// @vitest-environment node
/**
 * T031 (D) — cancelFunding · retryFundingTopup 통합 테스트 (US3 · FR-016~FR-018)
 * 계약: specs/004-group-funding/contracts/server-actions.md §4 `manage.ts` · §2 settle 경계
 *
 * 여기서 못 박는 것:
 *  ① 취소는 **주최자만**, **OPEN 만** — 부재·남의 펀딩·형식 불량은 같은 NOT_ORGANIZER, 끝난 펀딩은 NOT_OPEN
 *  ② 취소 → settle 경유 환불 + 미달과 다른 구분(reason CANCELLED · cause ORGANIZER) (FR-018)
 *  ③ 마감 지난 OPEN 은 취소가 아니라 정산된다 — 달성선을 넘긴 펀딩을 주최자가 뒤집지 못한다
 *  ④ 동시 취소 2회 → 전이 1회·환불 1회
 *  ⑤ 재시도는 SUCCEEDED 만, 수단 변경은 본인 ACTIVE 만, **명시적 재시도만** 카드를 긁는다
 *  ⑥ 기한·횟수 초과 재시도는 RETRY_EXPIRED / NOT_RETRYABLE 을 돌려주며 **정산을 태워** 취소·환불로 확정한다
 *  ⑦ 알림 DAL 이 펀딩 알림 payload 를 계약 형태로 읽어 낸다 (T032 — 목록이 종류를 모르면 조용히 빠진다)
 *
 * 결제는 실물 mock 클라이언트다(R1) — 뒷자리 0000 카드가 결정론적 실패를 만든다. 호출 횟수만 감싸서 센다.
 * 실 DB 통합 테스트라 .env.local 이 필요하다. 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

vi.setConfig({ testTimeout: 60_000 })

// 호출마다 다른 세션을 묶기 위해 AsyncLocalStorage 로 userId 를 전달한다 (funding-cap-concurrent.test.ts 와 동일)
const h = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return {
    sessionUser: new AsyncLocalStorage<string>(),
    refundCalls: 0,
    chargeCalls: 0,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () => {
        const sub = h.sessionUser.getStore()
        return sub
          ? { data: { claims: { sub } }, error: null }
          : { data: null, error: { message: '세션 없음 (테스트)' } }
      }),
    },
  })),
}))

vi.mock('@/lib/portone/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/portone/client')>()
  return {
    ...actual,
    getPortOneClient: () => {
      const client = actual.getPortOneClient()
      return {
        ...client,
        chargeBillingKey: async (input: Parameters<typeof client.chargeBillingKey>[0]) => {
          h.chargeCalls += 1
          return client.chargeBillingKey(input)
        },
        refund: async (input: Parameters<typeof client.refund>[0]) => {
          h.refundCalls += 1
          return client.refund(input)
        },
      }
    },
  }
})

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

const fundingDelegate = hasDatabase ? (prisma as unknown as Record<string, unknown>).funding : undefined
const hasFundingSchema =
  typeof (fundingDelegate as { findUnique?: unknown } | undefined)?.findUnique === 'function'

const skipReason = !hasDatabase
  ? 'DATABASE_URL 미설정 — .env.local 을 확인할 것'
  : !hasFundingSchema
    ? 'Funding 모델 없음 — J 의 마이그레이션(T004~T005) 적용 후 `npx prisma generate`'
    : ''
if (skipReason) console.warn(`[funding-manage.test] skip — ${skipReason}`)

const { cancelFunding, retryFundingTopup } = await import('@/app/fundings/actions/manage')
const { getMyNotifications } = await import('@/lib/dal/notification')
const { encryptBillingKey } = await import('@/lib/crypto/billing-key')
const { getPortOneClient } = await import('@/lib/portone/client')

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64')
const MAX_ATTEMPTS = 3

const MIN_MS = 60 * 1000
const HOUR_MS = 60 * MIN_MS
const DAY_MS = 24 * HOUR_MS
const past = (ms: number) => new Date(Date.now() - ms)
const future = (ms: number) => new Date(Date.now() + ms)

const GOOD_CARD_LAST4 = '4821'
const FAILING_CARD_LAST4 = '0000'

type FundingStatus = 'OPEN' | 'SUCCEEDED' | 'SETTLED' | 'FAILED' | 'CANCELLED'

function errorCode(result: { ok: boolean; error?: { code: string } }): string | null {
  return result.ok ? null : (result.error?.code ?? null)
}

describe.skipIf(skipReason !== '')('cancelFunding · retryFundingTopup — 관리 액션 (T031)', () => {
  const userIds: string[] = []
  const fundingIds: string[] = []
  let categoryId: string
  let productId: string

  let organizer: string
  let receiver: string
  let contributor: string
  let stranger: string
  let organizerGoodMethodId: string
  let organizerFailingMethodId: string
  let strangerMethodId: string

  async function createUser(label: string): Promise<string> {
    const id = randomUUID()
    await prisma.user.create({ data: { id, displayName: `${label} ${id.slice(0, 8)}` } })
    userIds.push(id)
    return id
  }

  async function createPaymentMethod(userId: string, cardLast4: string): Promise<string> {
    const issued = await getPortOneClient().issueBillingKey({ userId, cardBrand: '신한', cardLast4 })
    if (!issued.ok) throw new Error(`빌링키 발급 실패: ${issued.reason}`)
    const created = await prisma.paymentMethod.create({
      data: {
        userId,
        provider: 'portone',
        billingKey: encryptBillingKey(issued.billingKey),
        cardBrand: '신한',
        cardLast4,
      },
      select: { id: true },
    })
    return created.id
  }

  async function createFunding(
    overrides: {
      status?: FundingStatus
      deadline?: Date
      goalAmount?: number
      minAmount?: number
      organizerPaymentMethodId?: string | null
      topupAttemptCount?: number
      topupRetryUntil?: Date | null
    } = {},
  ): Promise<string> {
    const id = randomUUID()
    await prisma.funding.create({
      data: {
        id,
        organizerId: organizer,
        receiverId: receiver,
        status: overrides.status ?? 'OPEN',
        productId,
        productSnapshot: { name: 'T031 테스트 상품', imageUrl: null, price: 100_000 },
        goalAmount: overrides.goalAmount ?? 100_000,
        minAmount: overrides.minAmount ?? 50_000,
        deadline: overrides.deadline ?? future(7 * DAY_MS),
        organizerPaymentMethodId:
          overrides.organizerPaymentMethodId === undefined
            ? organizerGoodMethodId
            : overrides.organizerPaymentMethodId,
        organizerConsentAgreedAt: new Date(),
        consentVersion: '1',
        receiverDisplayName: 'T031 수령자',
        topupAttemptCount: overrides.topupAttemptCount ?? 0,
        topupRetryUntil: overrides.topupRetryUntil ?? null,
      },
    })
    fundingIds.push(id)
    return id
  }

  async function addPaid(fundingId: string, contributorId: string, amount: number): Promise<void> {
    const paidAt = new Date()
    const created = await prisma.fundingContribution.create({
      data: { fundingId, contributorId, amount, status: 'PAID', reservedUntil: future(5 * MIN_MS), paidAt },
      select: { id: true },
    })
    await prisma.payment.create({
      data: {
        provider: 'portone',
        providerTxId: `mock_pay_${randomBytes(8).toString('hex')}`,
        amount,
        status: 'PAID',
        fundingContributionId: created.id,
        paidAt,
      },
    })
  }

  function funding(id: string) {
    return prisma.funding.findUniqueOrThrow({ where: { id } })
  }

  function contributions(fundingId: string) {
    return prisma.fundingContribution.findMany({ where: { fundingId }, orderBy: { createdAt: 'asc' } })
  }

  function notifications(fundingId: string, type: string, userId?: string) {
    return prisma.notification.findMany({
      where: {
        ...(userId ? { userId } : {}),
        type: type as never,
        payload: { path: ['fundingId'], equals: fundingId },
      },
    })
  }

  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
  }

  function stubEnv(): void {
    vi.stubEnv('PORTONE_MODE', 'mock')
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
    vi.stubEnv('GIFT_PAYMENT_MAX_ATTEMPTS', String(MAX_ATTEMPTS))
    vi.stubEnv('GIFT_PAYMENT_RETRY_WINDOW', '24h')
  }

  beforeAll(async () => {
    stubEnv()
    await prisma.$queryRaw`SELECT 1`

    organizer = await createUser('T031 주최자')
    receiver = await createUser('T031 수령자')
    contributor = await createUser('T031 참여자')
    stranger = await createUser('T031 무관사용자')

    categoryId = randomUUID()
    await prisma.category.create({ data: { id: categoryId, name: `t031-${categoryId}`, sortOrder: 9800 } })
    productId = randomUUID()
    await prisma.product.create({ data: { id: productId, name: 'T031 테스트 상품', categoryId, price: 100_000 } })

    organizerGoodMethodId = await createPaymentMethod(organizer, GOOD_CARD_LAST4)
    organizerFailingMethodId = await createPaymentMethod(organizer, FAILING_CARD_LAST4)
    strangerMethodId = await createPaymentMethod(stranger, GOOD_CARD_LAST4)
  })

  beforeEach(() => {
    stubEnv()
    h.refundCalls = 0
    h.chargeCalls = 0
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    const rows = await prisma.fundingContribution.findMany({
      where: { fundingId: { in: fundingIds } },
      select: { id: true },
    })
    await prisma.payment.deleteMany({ where: { fundingContributionId: { in: rows.map((r) => r.id) } } })
    await prisma.fundingContribution.deleteMany({ where: { fundingId: { in: fundingIds } } })
    await prisma.funding.deleteMany({ where: { id: { in: fundingIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.product.deleteMany({ where: { id: productId } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.$disconnect()
  })

  // ── cancelFunding ───────────────────────────────────────────────────────────
  describe('cancelFunding', () => {
    it('주최자가 진행 중 펀딩을 취소하면 CANCELLED — settle 경유로 환불 + 취소 구분 고지 (FR-017·FR-018)', async () => {
      const fundingId = await createFunding()
      await addPaid(fundingId, contributor, 30_000)

      const result = await as(organizer, () => cancelFunding({ fundingId }))

      expect(result).toEqual({ ok: true, data: { outcome: 'CANCELLED' } })
      const row = await funding(fundingId)
      expect(row.status).toBe('CANCELLED')
      expect(row.cancelledAt).not.toBeNull()
      expect(h.refundCalls).toBe(1)
      expect((await contributions(fundingId)).map((c) => c.status)).toEqual(['REFUNDED'])

      const [notice] = await notifications(fundingId, 'FUNDING_FAILED_REFUNDED', contributor)
      expect(notice.payload).toMatchObject({ reason: 'CANCELLED', cause: 'ORGANIZER', amount: 30_000 })
    })

    it('주최자가 아니면 NOT_ORGANIZER — 수령자·참여자·무관 사용자·없는 id·형식 불량 전부 같은 답', async () => {
      const fundingId = await createFunding()
      await addPaid(fundingId, contributor, 30_000)

      for (const user of [receiver, contributor, stranger]) {
        expect(errorCode(await as(user, () => cancelFunding({ fundingId })))).toBe('NOT_ORGANIZER')
      }
      expect(errorCode(await as(organizer, () => cancelFunding({ fundingId: randomUUID() })))).toBe('NOT_ORGANIZER')
      expect(errorCode(await as(organizer, () => cancelFunding({ fundingId: 'not-a-uuid' })))).toBe('NOT_ORGANIZER')

      expect((await funding(fundingId)).status).toBe('OPEN')
      expect(h.refundCalls).toBe(0)
    })

    it('OPEN 이 아니면 NOT_OPEN — 끝난 펀딩은 다시 취소되지 않는다', async () => {
      for (const status of ['SUCCEEDED', 'SETTLED', 'FAILED', 'CANCELLED'] as const) {
        const fundingId = await createFunding({ status, deadline: past(MIN_MS) })
        expect(errorCode(await as(organizer, () => cancelFunding({ fundingId }))), status).toBe('NOT_OPEN')
        expect((await funding(fundingId)).status).toBe(status)
      }
    })

    it('마감이 지난 OPEN 은 취소가 아니라 정산된다 — 달성선을 넘긴 펀딩을 주최자가 뒤집지 못한다 (R1)', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS) })
      await addPaid(fundingId, contributor, 100_000)

      const result = await as(organizer, () => cancelFunding({ fundingId }))

      expect(errorCode(result)).toBe('NOT_OPEN')
      expect((await funding(fundingId)).status).toBe('SETTLED')
      expect(h.refundCalls).toBe(0)
      expect(await notifications(fundingId, 'FUNDING_SUCCEEDED')).toHaveLength(2) // 참여자 + 수령자
    })

    it('동시 취소 2회 → 전이·환불은 한 번 (조건부 전이)', async () => {
      const fundingId = await createFunding()
      await addPaid(fundingId, contributor, 30_000)

      const results = await Promise.all([
        as(organizer, () => cancelFunding({ fundingId })),
        as(organizer, () => cancelFunding({ fundingId })),
      ])

      expect(results.map(errorCode).sort()).toEqual(['NOT_OPEN', null])
      expect(h.refundCalls).toBe(1)
      expect(await notifications(fundingId, 'FUNDING_FAILED_REFUNDED')).toHaveLength(1)
    })
  })

  // ── retryFundingTopup ───────────────────────────────────────────────────────
  describe('retryFundingTopup', () => {
    it('실패한 차액을 다른(정상) 수단으로 재시도하면 SETTLED — 수단이 바뀌고 TOPUP 고지가 간다', async () => {
      const fundingId = await createFunding({
        status: 'SUCCEEDED',
        deadline: past(MIN_MS),
        organizerPaymentMethodId: organizerFailingMethodId,
        topupAttemptCount: 1,
        topupRetryUntil: future(23 * HOUR_MS),
      })
      await addPaid(fundingId, contributor, 60_000)

      const result = await as(organizer, () =>
        retryFundingTopup({ fundingId, paymentMethodId: organizerGoodMethodId }),
      )

      expect(result).toEqual({ ok: true, data: { outcome: 'SETTLED' } })
      expect(h.chargeCalls).toBe(1)
      const row = await funding(fundingId)
      expect(row.status).toBe('SETTLED')
      expect(row.organizerPaymentMethodId).toBe(organizerGoodMethodId)
      expect(row.topupAttemptCount).toBe(2)
      expect(await notifications(fundingId, 'FUNDING_ORGANIZER_TOPUP', organizer)).toHaveLength(1)
    })

    it('수단을 바꾸지 않고 재시도하면 같은 카드를 다시 긁는다 — 실패하면 TOPUP_FAILED, 횟수만 오른다', async () => {
      const fundingId = await createFunding({
        status: 'SUCCEEDED',
        deadline: past(MIN_MS),
        organizerPaymentMethodId: organizerFailingMethodId,
        topupAttemptCount: 1,
        topupRetryUntil: future(23 * HOUR_MS),
      })
      await addPaid(fundingId, contributor, 60_000)

      const result = await as(organizer, () => retryFundingTopup({ fundingId }))

      expect(result).toEqual({ ok: true, data: { outcome: 'TOPUP_FAILED' } })
      expect(h.chargeCalls).toBe(1)
      const row = await funding(fundingId)
      expect(row.status).toBe('SUCCEEDED')
      expect(row.topupAttemptCount).toBe(2)
    })

    it('주최자가 아니면 NOT_ORGANIZER, SUCCEEDED 가 아니면 NOT_RETRYABLE — 카드는 긁지 않는다', async () => {
      const succeeded = await createFunding({
        status: 'SUCCEEDED',
        deadline: past(MIN_MS),
        organizerPaymentMethodId: organizerFailingMethodId,
        topupAttemptCount: 1,
        topupRetryUntil: future(HOUR_MS),
      })
      for (const user of [receiver, contributor, stranger]) {
        expect(errorCode(await as(user, () => retryFundingTopup({ fundingId: succeeded })))).toBe('NOT_ORGANIZER')
      }

      for (const status of ['OPEN', 'SETTLED', 'FAILED', 'CANCELLED'] as const) {
        const fundingId = await createFunding({ status })
        expect(errorCode(await as(organizer, () => retryFundingTopup({ fundingId }))), status).toBe('NOT_RETRYABLE')
      }
      expect(h.chargeCalls).toBe(0)
    })

    it('남의(또는 없는) 결제수단으로 바꾸려 하면 NOT_RETRYABLE — 수단도 바뀌지 않고 카드도 긁지 않는다', async () => {
      const fundingId = await createFunding({
        status: 'SUCCEEDED',
        deadline: past(MIN_MS),
        organizerPaymentMethodId: organizerFailingMethodId,
        topupAttemptCount: 1,
        topupRetryUntil: future(HOUR_MS),
      })
      await addPaid(fundingId, contributor, 60_000)

      for (const paymentMethodId of [strangerMethodId, randomUUID(), 'bad-id']) {
        const result = await as(organizer, () => retryFundingTopup({ fundingId, paymentMethodId }))
        expect(errorCode(result)).toBe('NOT_RETRYABLE')
      }
      expect(h.chargeCalls).toBe(0)
      expect((await funding(fundingId)).organizerPaymentMethodId).toBe(organizerFailingMethodId)
    })

    it('재시도 기한이 지났으면 RETRY_EXPIRED — 그리고 정산을 태워 CANCELLED + 환불로 확정한다 (지연 평가)', async () => {
      const fundingId = await createFunding({
        status: 'SUCCEEDED',
        deadline: past(2 * DAY_MS),
        organizerPaymentMethodId: organizerGoodMethodId,
        topupAttemptCount: 1,
        topupRetryUntil: past(HOUR_MS),
      })
      await addPaid(fundingId, contributor, 60_000)

      const result = await as(organizer, () => retryFundingTopup({ fundingId }))

      expect(errorCode(result)).toBe('RETRY_EXPIRED')
      expect(h.chargeCalls).toBe(0)
      expect(h.refundCalls).toBe(1)
      expect((await funding(fundingId)).status).toBe('CANCELLED')
      expect((await contributions(fundingId)).map((c) => c.status)).toEqual(['REFUNDED'])
    })

    it('횟수가 다 찼으면 NOT_RETRYABLE — 마찬가지로 CANCELLED + 환불로 확정한다', async () => {
      const fundingId = await createFunding({
        status: 'SUCCEEDED',
        deadline: past(MIN_MS),
        organizerPaymentMethodId: organizerGoodMethodId,
        topupAttemptCount: MAX_ATTEMPTS,
        topupRetryUntil: future(HOUR_MS),
      })
      await addPaid(fundingId, contributor, 60_000)

      const result = await as(organizer, () => retryFundingTopup({ fundingId }))

      expect(errorCode(result)).toBe('NOT_RETRYABLE')
      expect(h.chargeCalls).toBe(0)
      expect((await funding(fundingId)).status).toBe('CANCELLED')
      expect(await notifications(fundingId, 'FUNDING_FAILED_REFUNDED')).toHaveLength(3) // 참여자 + 주최자 + 수령자
    })
  })

  // ── 알림 DAL 이 펀딩 payload 를 읽는다 (T032) ───────────────────────────────
  it('취소 뒤 참여자의 알림 목록에 FUNDING_FAILED_REFUNDED 가 계약 payload 형태로 나온다', async () => {
    const fundingId = await createFunding()
    await addPaid(fundingId, contributor, 30_000)
    await as(organizer, () => cancelFunding({ fundingId }))

    const views = await as(contributor, () => getMyNotifications())
    const mine = views.find(
      (v) => v.type === 'FUNDING_FAILED_REFUNDED' && (v.payload as { fundingId: string }).fundingId === fundingId,
    )
    expect(mine).toBeDefined()
    expect(mine!.payload).toMatchObject({
      fundingId,
      productName: 'T031 테스트 상품',
      receiverDisplayName: 'T031 수령자',
      amount: 30_000,
      reason: 'CANCELLED',
      cause: 'ORGANIZER',
    })
  })
})
