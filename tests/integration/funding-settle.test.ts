// @vitest-environment node
/**
 * T013 (D) — settleFunding() 통합 테스트 (US3 · FR-015~FR-020 · research R1·R5·R8)
 * 계약: specs/004-group-funding/contracts/server-actions.md §2
 *
 * **이 파일이 정산의 소유 경계를 판정한다.** settle 은 펀딩 하나를 받아 판정 잠금 → 환불(refund 첫
 * 실사용) → 차액(chargeBillingKey) → SETTLED → 알림 3종까지 전부 소유한다. 호출자(조회 DAL·조기
 * 성사·취소·재시도)는 그 뒤에서 상태도 환불도 정산 알림도 만지지 않는다 — 양쪽에 두면 알림이 두 번
 * 가고, 잠금이 없으면 환불이 두 번 나간다 (M3 T016 charge 테스트와 같은 자리).
 *
 * 여기서 못 박는 것:
 *  ① 판정 — 마감 후 paid ≥ min → SUCCEEDED / paid < min → FAILED. 마감 전은 paid ≥ goal(조기 성사)만,
 *     아니면 STILL_OPEN. **RESERVED 는 판정에 들어가지 않는다** (SC-002 · R3)
 *  ② 미달·취소 → 전 PAID 건 환불(REFUNDED + Payment REFUNDED) + FUNDING_FAILED_REFUNDED, 미달/취소 구분 (FR-017·018)
 *  ③ 차액 — min ≤ paid < goal 이면 주최자 카드로 부족분 결제 → SETTLED + **FUNDING_ORGANIZER_TOPUP 누락 0건** (SC-004)
 *  ④ topup 실패 → SUCCEEDED 유지 + 재시도 기록, 자동 재시도 없음, 상한 초과 → CANCELLED + 전액 환불 + 전원 고지 (clarify Q3)
 *  ⑤ **동시 정산 2회 → 실행 1회** — 환불·차액 결제·알림이 두 번 나가지 않는다 (R1 멱등 잠금)
 *  ⑥ 재진입 — 비-OPEN 으로 다시 불려도 환불 미처리 PAID 를 편입한다 (contracts §2, contribute 의 settledMeanwhile)
 *
 * 결제는 **실물 mock 클라이언트**를 그대로 태운다(R1) — 뒷자리 0000 카드가 결정론적 topup 실패를 만든다.
 * 호출 횟수만 감싸서 센다. 실 DB 통합 테스트라 .env.local 이 필요하다. 픽스처는 randomUUID 로 격리하고
 * afterAll 에서 지운다.
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

const h = vi.hoisted(() => ({
  refundCalls: 0,
  chargeCalls: 0,
  chargeAmounts: [] as number[],
}))

// 실물 mock 클라이언트를 그대로 쓰되(R1), 결제사 호출 횟수를 센다 — 멱등 판정의 근거다.
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
          h.chargeAmounts.push(input.amount)
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
if (skipReason) console.warn(`[funding-settle.test] skip — ${skipReason}`)

const { settleFunding } = await import('@/lib/funding/settle')
const { transitionFunding } = await import('@/lib/funding/state')
const { encryptBillingKey } = await import('@/lib/crypto/billing-key')
const { getPortOneClient } = await import('@/lib/portone/client')

/** 테스트 전용 고정 키 — 실키가 아니다 (gift-charge.test.ts 와 같은 값 규약) */
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64')
const MAX_ATTEMPTS = 3
const RETRY_WINDOW_HOURS = 24

const MIN_MS = 60 * 1000
const HOUR_MS = 60 * MIN_MS
const DAY_MS = 24 * HOUR_MS
const past = (ms: number) => new Date(Date.now() - ms)
const future = (ms: number) => new Date(Date.now() + ms)

const GOOD_CARD_LAST4 = '4821'
/** R1 mock 실패 규약 — 이 카드는 결제가 항상 실패한다 (quickstart V4-3 의 topup 실패 재현) */
const FAILING_CARD_LAST4 = '0000'

type FundingStatus = 'OPEN' | 'SUCCEEDED' | 'SETTLED' | 'FAILED' | 'CANCELLED'
type NotificationType =
  | 'FUNDING_SUCCEEDED'
  | 'FUNDING_FAILED_REFUNDED'
  | 'FUNDING_ORGANIZER_TOPUP'
  | 'FUNDING_CONTRIBUTION_RECEIVED'

describe.skipIf(skipReason !== '')('settleFunding — 정산의 소유 경계 (T013)', () => {
  const userIds: string[] = []
  const fundingIds: string[] = []
  let categoryId: string
  let productId: string

  let organizer: string
  let receiver: string
  let contributorA: string
  let contributorB: string
  /** 주최자의 결제수단 둘 — 펀딩마다 어느 쪽을 차액 수단으로 묶을지 고른다 */
  let organizerGoodMethodId: string
  let organizerFailingMethodId: string

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
      organizerId?: string
      receiverId?: string
      organizerPaymentMethodId?: string | null
      topupAttemptCount?: number
      topupRetryUntil?: Date | null
    } = {},
  ): Promise<string> {
    const id = randomUUID()
    await prisma.funding.create({
      data: {
        id,
        organizerId: overrides.organizerId ?? organizer,
        receiverId: overrides.receiverId ?? receiver,
        status: overrides.status ?? 'OPEN',
        productId,
        productSnapshot: { name: 'T013 테스트 상품', imageUrl: null, price: 100_000 },
        goalAmount: overrides.goalAmount ?? 100_000,
        minAmount: overrides.minAmount ?? 50_000,
        deadline: overrides.deadline ?? past(MIN_MS),
        organizerPaymentMethodId:
          overrides.organizerPaymentMethodId === undefined
            ? organizerGoodMethodId
            : overrides.organizerPaymentMethodId,
        organizerConsentAgreedAt: new Date(),
        consentVersion: '1',
        receiverDisplayName: 'T013 수령자',
        topupAttemptCount: overrides.topupAttemptCount ?? 0,
        topupRetryUntil: overrides.topupRetryUntil ?? null,
      },
    })
    fundingIds.push(id)
    return id
  }

  /** 결제 완료 참여 — ④ finalizeContributionPaid 가 남기는 모양 그대로(PAID 행 + Payment PAID). mock 환불이 받는 tx id 형식이다 */
  async function addPaid(fundingId: string, contributorId: string, amount: number): Promise<string> {
    const paidAt = new Date()
    const created = await prisma.fundingContribution.create({
      data: {
        fundingId,
        contributorId,
        amount,
        status: 'PAID',
        reservedUntil: future(5 * MIN_MS),
        paidAt,
      },
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
    return created.id
  }

  async function addReserved(fundingId: string, contributorId: string, amount: number): Promise<void> {
    await prisma.fundingContribution.create({
      data: { fundingId, contributorId, amount, status: 'RESERVED', reservedUntil: future(5 * MIN_MS) },
    })
  }

  function funding(id: string) {
    return prisma.funding.findUniqueOrThrow({ where: { id } })
  }

  function contributions(fundingId: string) {
    return prisma.fundingContribution.findMany({ where: { fundingId }, orderBy: { createdAt: 'asc' } })
  }

  async function paymentsOf(fundingId: string) {
    const rows = await contributions(fundingId)
    return prisma.payment.findMany({
      where: { fundingContributionId: { in: rows.map((r) => r.id) } },
      orderBy: { createdAt: 'asc' },
    })
  }

  function notifications(fundingId: string, type: NotificationType, userId?: string) {
    return prisma.notification.findMany({
      where: {
        ...(userId ? { userId } : {}),
        type,
        payload: { path: ['fundingId'], equals: fundingId },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  function stubEnv(): void {
    vi.stubEnv('PORTONE_MODE', 'mock')
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
    vi.stubEnv('GIFT_PAYMENT_MAX_ATTEMPTS', String(MAX_ATTEMPTS))
    vi.stubEnv('GIFT_PAYMENT_RETRY_WINDOW', `${RETRY_WINDOW_HOURS}h`)
  }

  beforeAll(async () => {
    stubEnv()
    await prisma.$queryRaw`SELECT 1`

    organizer = await createUser('T013 주최자')
    receiver = await createUser('T013 수령자')
    contributorA = await createUser('T013 참여자A')
    contributorB = await createUser('T013 참여자B')

    categoryId = randomUUID()
    await prisma.category.create({ data: { id: categoryId, name: `t013-${categoryId}`, sortOrder: 9700 } })
    productId = randomUUID()
    await prisma.product.create({
      data: { id: productId, name: 'T013 테스트 상품', categoryId, price: 100_000 },
    })

    organizerGoodMethodId = await createPaymentMethod(organizer, GOOD_CARD_LAST4)
    organizerFailingMethodId = await createPaymentMethod(organizer, FAILING_CARD_LAST4)
  })

  beforeEach(() => {
    stubEnv()
    h.refundCalls = 0
    h.chargeCalls = 0
    h.chargeAmounts = []
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

  // ── ① 판정 ─────────────────────────────────────────────────────────────────
  describe('판정 (R1·R3)', () => {
    it('마감 후 paid = goal → 차액 없이 SETTLED. FUNDING_SUCCEEDED 는 참여자·수령자, TOPUP 은 없다', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS) })
      await addPaid(fundingId, contributorA, 60_000)
      await addPaid(fundingId, contributorB, 40_000)

      const result = await settleFunding(fundingId)

      expect(result).toEqual({ outcome: 'SETTLED' })
      const row = await funding(fundingId)
      expect(row.status).toBe('SETTLED')
      expect(row.settledAt).not.toBeNull()
      expect(h.chargeCalls).toBe(0)
      expect(h.refundCalls).toBe(0)

      const succeeded = await notifications(fundingId, 'FUNDING_SUCCEEDED')
      expect(succeeded.map((n) => n.userId).sort()).toEqual([contributorA, contributorB, receiver].sort())
      expect(await notifications(fundingId, 'FUNDING_ORGANIZER_TOPUP')).toHaveLength(0)
      expect(await notifications(fundingId, 'FUNDING_FAILED_REFUNDED')).toHaveLength(0)
    })

    it('조기 성사 — 마감 전이라도 paid = goal 이면 SETTLED (FR-015, 잠금은 deadline 을 보지 않는다)', async () => {
      const fundingId = await createFunding({ deadline: future(7 * DAY_MS) })
      await addPaid(fundingId, contributorA, 100_000)

      expect(await settleFunding(fundingId)).toEqual({ outcome: 'SETTLED' })
      expect((await funding(fundingId)).status).toBe('SETTLED')
    })

    it('마감 전 paid < goal 은 달성선을 넘었어도 STILL_OPEN — 아무것도 바꾸지 않는다', async () => {
      const fundingId = await createFunding({ deadline: future(7 * DAY_MS) })
      await addPaid(fundingId, contributorA, 70_000)

      expect(await settleFunding(fundingId)).toEqual({ outcome: 'STILL_OPEN' })
      expect((await funding(fundingId)).status).toBe('OPEN')
      expect(h.chargeCalls).toBe(0)
      expect(h.refundCalls).toBe(0)
      expect(await prisma.notification.count({ where: { payload: { path: ['fundingId'], equals: fundingId } } })).toBe(0)
    })

    it('RESERVED 만으로는 성사가 선언되지 않는다 — 예약이 목표를 채워도 마감 후 판정은 FAILED (SC-002)', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS) })
      await addReserved(fundingId, contributorA, 100_000)

      expect(await settleFunding(fundingId)).toEqual({ outcome: 'FAILED' })
      const row = await funding(fundingId)
      expect(row.status).toBe('FAILED')
      expect(row.failedAt).not.toBeNull()
      // 예약 행은 settle 이 건드리지 않는다 — 만료 해제(R2)가 지연 평가로 지운다
      expect((await contributions(fundingId)).map((c) => c.status)).toEqual(['RESERVED'])
    })

    it('없는 펀딩은 던진다 — 호출자가 존재를 보장한다 (조회 DAL·확정 트랜잭션 뒤에서만 불린다)', async () => {
      await expect(settleFunding(randomUUID())).rejects.toThrow(/찾지 못했다/)
    })
  })

  // ── ② 미달·취소 → 환불 ─────────────────────────────────────────────────────
  describe('미달·취소 환불 (FR-017·FR-018 · R5 refund 첫 실사용)', () => {
    it('마감 후 paid < min → FAILED. 전 PAID 건 REFUNDED + Payment REFUNDED + 참여자마다 FUNDING_FAILED_REFUNDED(미달 구분)', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS), minAmount: 50_000 })
      await addPaid(fundingId, contributorA, 20_000)
      await addPaid(fundingId, contributorB, 10_000)
      await addPaid(fundingId, contributorA, 5_000) // 추가 참여(FR-011) — 건별로 환불된다

      const result = await settleFunding(fundingId)

      expect(result).toEqual({ outcome: 'FAILED' })
      expect((await funding(fundingId)).status).toBe('FAILED')
      expect(h.refundCalls).toBe(3)
      expect(h.chargeCalls).toBe(0)

      const rows = await contributions(fundingId)
      expect(rows.map((c) => c.status)).toEqual(['REFUNDED', 'REFUNDED', 'REFUNDED'])
      expect(rows.every((c) => c.refundedAt !== null)).toBe(true)

      const payments = await paymentsOf(fundingId)
      expect(payments.map((p) => p.status)).toEqual(['REFUNDED', 'REFUNDED', 'REFUNDED'])
      expect(payments.every((p) => p.refundedAt !== null)).toBe(true)

      const refunded = await notifications(fundingId, 'FUNDING_FAILED_REFUNDED')
      expect(refunded).toHaveLength(3)
      expect(refunded.map((n) => n.userId).sort()).toEqual([contributorA, contributorA, contributorB].sort())
      for (const n of refunded) {
        const payload = n.payload as { reason?: string; amount?: number; productName?: string }
        expect(payload.reason).toBe('FAILED')
        expect(payload.productName).toBe('T013 테스트 상품')
        expect([20_000, 10_000, 5_000]).toContain(payload.amount)
      }
      expect(await notifications(fundingId, 'FUNDING_SUCCEEDED')).toHaveLength(0)
    })

    it('주최자 취소 — OPEN→CANCELLED 뒤 재진입하면 환불 + 취소 구분 문구용 reason=CANCELLED·cause=ORGANIZER (FR-018)', async () => {
      const fundingId = await createFunding({ deadline: future(7 * DAY_MS) })
      await addPaid(fundingId, contributorA, 30_000)

      // 취소 액션(T031)이 하는 일 — 조건부 전이 뒤 settle 경유
      const { transitioned } = await transitionFunding(fundingId, 'OPEN', 'CANCELLED')
      expect(transitioned).toBe(true)

      expect(await settleFunding(fundingId)).toEqual({ outcome: 'CANCELLED' })
      expect(h.refundCalls).toBe(1)
      expect((await contributions(fundingId)).map((c) => c.status)).toEqual(['REFUNDED'])

      const [notice] = await notifications(fundingId, 'FUNDING_FAILED_REFUNDED', contributorA)
      expect(notice).toBeDefined()
      expect(notice.payload).toMatchObject({ reason: 'CANCELLED', cause: 'ORGANIZER', amount: 30_000 })
    })

    it('재진입 — FAILED 뒤 확정된 PAID(마감을 가로지른 대사 복원 건)를 다시 부르면 환불에 편입한다 (contracts §2)', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS) })
      await addPaid(fundingId, contributorA, 10_000)
      expect(await settleFunding(fundingId)).toEqual({ outcome: 'FAILED' })
      expect(h.refundCalls).toBe(1)

      // 결제가 마감을 가로질러 확정됐다 — 그 정산의 환불 대상에 없었던 고아 PAID
      await addPaid(fundingId, contributorB, 20_000)

      expect(await settleFunding(fundingId)).toEqual({ outcome: 'FAILED' })
      expect(h.refundCalls).toBe(2)
      expect((await contributions(fundingId)).map((c) => c.status)).toEqual(['REFUNDED', 'REFUNDED'])
      expect(await notifications(fundingId, 'FUNDING_FAILED_REFUNDED', contributorB)).toHaveLength(1)

      // 세 번째 호출 — 환불할 것이 없으면 아무 일도 없다
      expect(await settleFunding(fundingId)).toEqual({ outcome: 'FAILED' })
      expect(h.refundCalls).toBe(2)
      expect(await notifications(fundingId, 'FUNDING_FAILED_REFUNDED')).toHaveLength(2)
    })
  })

  // ── ③ 차액 ─────────────────────────────────────────────────────────────────
  describe('차액 자동 결제 (FR-016 · R5 · SC-004)', () => {
    it('min ≤ paid < goal → 주최자 카드로 부족분 결제 → SETTLED. 차액은 PAID 참여 행 + Payment 로 남고 FUNDING_ORGANIZER_TOPUP 이 간다', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS), goalAmount: 100_000, minAmount: 50_000 })
      await addPaid(fundingId, contributorA, 40_000)
      await addPaid(fundingId, contributorB, 30_000)

      const result = await settleFunding(fundingId)

      expect(result).toEqual({ outcome: 'SETTLED' })
      expect(h.chargeCalls).toBe(1)
      expect(h.chargeAmounts).toEqual([30_000])
      expect(h.refundCalls).toBe(0)

      const row = await funding(fundingId)
      expect(row.status).toBe('SETTLED')
      expect(row.topupAttemptCount).toBe(1)

      // 차액 결제의 기록 — C8(Payment 는 대상 정확히 하나)을 지키는 유일한 길은 주최자 명의 PAID 참여 행이다
      const rows = await contributions(fundingId)
      const topupRow = rows.find((c) => c.contributorId === organizer)
      expect(topupRow).toMatchObject({ amount: 30_000, status: 'PAID' })
      const topupPayment = await prisma.payment.findFirst({ where: { fundingContributionId: topupRow!.id } })
      expect(topupPayment).toMatchObject({ amount: 30_000, status: 'PAID' })
      expect(topupPayment!.providerTxId).toMatch(/^mock_pay_/)

      // 결제 완료 합계 = 목표 (R3 paidTotal 이 SETTLED 에서 100% 를 가리킨다)
      const paid = rows.filter((c) => c.status === 'PAID').reduce((sum, c) => sum + c.amount, 0)
      expect(paid).toBe(100_000)

      // "동의를 받았어도 고지는 별개다" — 누락되면 여기서 잡힌다 (SC-004)
      const topup = await notifications(fundingId, 'FUNDING_ORGANIZER_TOPUP')
      expect(topup).toHaveLength(1)
      expect(topup[0].userId).toBe(organizer)
      expect(topup[0].payload).toMatchObject({ amount: 30_000, productName: 'T013 테스트 상품' })

      const succeeded = await notifications(fundingId, 'FUNDING_SUCCEEDED')
      expect(succeeded.map((n) => n.userId).sort()).toEqual([contributorA, contributorB, receiver].sort())
    })

    it('topup 실패 → SUCCEEDED 유지 + 시도 기록. 플래그 없는 재진입은 재결제하지 않고, retryTopup 만 다시 시도한다', async () => {
      const fundingId = await createFunding({
        deadline: past(MIN_MS),
        organizerPaymentMethodId: organizerFailingMethodId,
      })
      await addPaid(fundingId, contributorA, 60_000)

      const first = await settleFunding(fundingId)
      expect(first.outcome).toBe('TOPUP_FAILED')
      if (first.outcome !== 'TOPUP_FAILED') throw new Error('unreachable')
      expect(first.attemptCount).toBe(1)
      expect(first.retryUntil.getTime()).toBeGreaterThan(Date.now() + (RETRY_WINDOW_HOURS - 1) * HOUR_MS)
      expect(h.chargeCalls).toBe(1)

      const afterFirst = await funding(fundingId)
      expect(afterFirst.status).toBe('SUCCEEDED')
      expect(afterFirst.topupAttemptCount).toBe(1)
      expect(afterFirst.topupRetryUntil?.getTime()).toBe(first.retryUntil.getTime())
      // 실패 진행은 아직 아무에게도 알리지 않는다 — 성사 알림도 topup 알림도 SETTLED 에서만
      expect(await prisma.notification.count({ where: { payload: { path: ['fundingId'], equals: fundingId } } })).toBe(0)
      // 참여자 돈은 그대로 — 성사 유지 (R5)
      expect((await contributions(fundingId)).map((c) => c.status)).toEqual(['PAID'])

      // 조회·확정 경로의 재진입(플래그 없음)은 주최자 카드를 다시 긁지 않는다 — 시도 횟수는 주최자의 것이다
      const reentry = await settleFunding(fundingId)
      expect(reentry).toMatchObject({ outcome: 'TOPUP_FAILED', attemptCount: 1 })
      expect(h.chargeCalls).toBe(1)

      // 주최자의 명시적 재시도만 다음 시도를 쓴다. 기한은 첫 실패 시점에 한 번만 박힌다 (M3 R11)
      const retry = await settleFunding(fundingId, { retryTopup: true })
      expect(retry).toMatchObject({ outcome: 'TOPUP_FAILED', attemptCount: 2 })
      if (retry.outcome !== 'TOPUP_FAILED') throw new Error('unreachable')
      expect(retry.retryUntil.getTime()).toBe(first.retryUntil.getTime())
      expect(h.chargeCalls).toBe(2)
    })

    it('상한(3회) 초과 → CANCELLED + 전액 환불 + 전원 고지 (clarify Q3) — 참여자는 환불 금액, 주최자·수령자는 취소 사실', async () => {
      const fundingId = await createFunding({
        deadline: past(MIN_MS),
        organizerPaymentMethodId: organizerFailingMethodId,
      })
      await addPaid(fundingId, contributorA, 60_000)

      expect((await settleFunding(fundingId)).outcome).toBe('TOPUP_FAILED') // 1
      expect((await settleFunding(fundingId, { retryTopup: true })).outcome).toBe('TOPUP_FAILED') // 2
      const last = await settleFunding(fundingId, { retryTopup: true }) // 3 — 마지막 기회

      expect(last).toEqual({ outcome: 'CANCELLED' })
      expect(h.chargeCalls).toBe(3)
      expect(h.refundCalls).toBe(1)

      const row = await funding(fundingId)
      expect(row.status).toBe('CANCELLED')
      expect(row.cancelledAt).not.toBeNull()
      expect(row.topupAttemptCount).toBe(3)
      expect((await contributions(fundingId)).map((c) => c.status)).toEqual(['REFUNDED'])

      const notices = await notifications(fundingId, 'FUNDING_FAILED_REFUNDED')
      expect(notices.map((n) => n.userId).sort()).toEqual([contributorA, organizer, receiver].sort())
      const byUser = new Map(notices.map((n) => [n.userId, n.payload as Record<string, unknown>]))
      expect(byUser.get(contributorA)).toMatchObject({ reason: 'CANCELLED', cause: 'TOPUP_EXHAUSTED', amount: 60_000 })
      expect(byUser.get(organizer)).toMatchObject({ reason: 'CANCELLED', cause: 'TOPUP_EXHAUSTED', amount: 0 })
      expect(byUser.get(receiver)).toMatchObject({ reason: 'CANCELLED', cause: 'TOPUP_EXHAUSTED', amount: 0 })

      // 더 부르면 결제도 환불도 더 나가지 않는다
      expect(await settleFunding(fundingId, { retryTopup: true })).toEqual({ outcome: 'CANCELLED' })
      expect(h.chargeCalls).toBe(3)
      expect(h.refundCalls).toBe(1)
    })

    it('재시도 기한이 지난 SUCCEEDED 는 재진입 시점에 CANCELLED 로 확정된다 — 지연 평가, 카드는 다시 긁지 않는다', async () => {
      const fundingId = await createFunding({
        status: 'SUCCEEDED',
        deadline: past(2 * DAY_MS),
        organizerPaymentMethodId: organizerFailingMethodId,
        topupAttemptCount: 1,
        topupRetryUntil: past(HOUR_MS),
      })
      await addPaid(fundingId, contributorA, 60_000)

      expect(await settleFunding(fundingId)).toEqual({ outcome: 'CANCELLED' })
      expect(h.chargeCalls).toBe(0)
      expect(h.refundCalls).toBe(1)
      expect((await funding(fundingId)).status).toBe('CANCELLED')
      expect(await notifications(fundingId, 'FUNDING_FAILED_REFUNDED')).toHaveLength(3)
    })

    it('차액 수단이 없거나 쓸 수 없으면 결제사에 가지 않고 topup 실패로 흐른다', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS), organizerPaymentMethodId: null })
      await addPaid(fundingId, contributorA, 60_000)

      const result = await settleFunding(fundingId)
      expect(result).toMatchObject({ outcome: 'TOPUP_FAILED', attemptCount: 1 })
      expect(h.chargeCalls).toBe(0)
      expect((await funding(fundingId)).status).toBe('SUCCEEDED')
    })
  })

  // ── ⑤ 멱등 ─────────────────────────────────────────────────────────────────
  describe('동시 정산 2회 → 실행 1회 (R1 멱등 잠금)', () => {
    it('미달 펀딩을 동시에 두 번 정산해도 환불·알림은 참여 건수만큼만 나간다', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS) })
      await addPaid(fundingId, contributorA, 10_000)
      await addPaid(fundingId, contributorB, 20_000)

      const results = await Promise.all([settleFunding(fundingId), settleFunding(fundingId)])

      expect(results).toEqual([{ outcome: 'FAILED' }, { outcome: 'FAILED' }])
      expect(h.refundCalls).toBe(2)
      expect((await contributions(fundingId)).map((c) => c.status)).toEqual(['REFUNDED', 'REFUNDED'])
      expect(await notifications(fundingId, 'FUNDING_FAILED_REFUNDED')).toHaveLength(2)
      expect((await paymentsOf(fundingId)).map((p) => p.status)).toEqual(['REFUNDED', 'REFUNDED'])
    })

    it('차액 펀딩을 동시에 두 번 정산해도 주최자 카드는 한 번만 긁힌다 — TOPUP 고지도 1건', async () => {
      const fundingId = await createFunding({ deadline: past(MIN_MS) })
      await addPaid(fundingId, contributorA, 60_000)

      const results = await Promise.all([settleFunding(fundingId), settleFunding(fundingId)])

      expect(results).toEqual([{ outcome: 'SETTLED' }, { outcome: 'SETTLED' }])
      expect(h.chargeCalls).toBe(1)
      expect(await notifications(fundingId, 'FUNDING_ORGANIZER_TOPUP')).toHaveLength(1)
      expect(await notifications(fundingId, 'FUNDING_SUCCEEDED')).toHaveLength(2) // A + 수령자
      const rows = await contributions(fundingId)
      expect(rows.filter((c) => c.contributorId === organizer)).toHaveLength(1)
      expect(rows.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.amount, 0)).toBe(100_000)
    })
  })

  // ── 자기 펀딩 ──────────────────────────────────────────────────────────────
  describe('개설자 = 수령자 (FR-003 · SC-005)', () => {
    it('min = goal 이라 차액이 구조적으로 없다 — paid = goal 이면 SETTLED, 성사 알림은 수령자(=개설자) 1건 + 참여자', async () => {
      const fundingId = await createFunding({
        deadline: past(MIN_MS),
        organizerId: receiver,
        receiverId: receiver,
        goalAmount: 100_000,
        minAmount: 100_000,
        organizerPaymentMethodId: null,
      })
      await addPaid(fundingId, contributorA, 100_000)

      expect(await settleFunding(fundingId)).toEqual({ outcome: 'SETTLED' })
      expect(h.chargeCalls).toBe(0)
      const succeeded = await notifications(fundingId, 'FUNDING_SUCCEEDED')
      expect(succeeded.map((n) => n.userId).sort()).toEqual([contributorA, receiver].sort())
      expect(await notifications(fundingId, 'FUNDING_ORGANIZER_TOPUP')).toHaveLength(0)
    })
  })
})
