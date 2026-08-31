// @vitest-environment node
/**
 * T052 — retryGiftPayment 통합 테스트 (US5 · FR-030~FR-033)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4 `retryGiftPayment`
 *
 * 실패한 결제를 되살리는 유일한 경로다. 여기서 못 박는 것 넷:
 *  ① 수단을 바꿔 재시도하면 성공한다 (FR-030 — 같은 수단·수단 변경 양쪽)
 *  ② 횟수를 채우면 CANCELLED + **양쪽 고지** (FR-032)
 *  ③ 기한이 지나면 재잠금조차 하지 않는다 (FR-031) — 잠그고 실패시키면 시도 횟수만 축난다
 *  ④ **giver 전용** — 수령자는 실패 진행에 접근할 수 없다 (FR-030)
 *
 * ⑤ 그리고 **더블탭에도 결제는 1회**다 (FR-027) — 재잠금(R2)이 없으면 중복 청구가 나고
 *    화면상으로는 완전히 정상으로 보인다.
 *
 * 실 DB 통합 테스트라 DATABASE_URL 이 필요하다. 결제는 항상 mock 이다 (뒷자리 0000 = 항상 실패).
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

// 호출마다 다른 세션을 묶는다 — M2 accept-invite.test.ts 와 같은 AsyncLocalStorage 패턴이다
const h = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return { sessionUser: new AsyncLocalStorage<string>() }
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

const { retryGiftPayment } = await import('@/app/gifts/actions/payment')
const { encryptBillingKey } = await import('@/lib/crypto/billing-key')
const { getPortOneClient } = await import('@/lib/portone/client')

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')
const MAX_ATTEMPTS = 3
const HOUR_MS = 60 * 60 * 1000
const GOOD_CARD_LAST4 = '4821'
const FAILING_CARD_LAST4 = '0000'

function actAs<T>(userId: string, run: () => Promise<T>): Promise<T> {
  return h.sessionUser.run(userId, run)
}

describe.skipIf(!hasDatabase)('retryGiftPayment — 실패에서 복구한다 (T052)', () => {
  const userIds: string[] = []
  let categoryId = ''
  let productId = ''

  beforeEach(() => {
    vi.stubEnv('PORTONE_MODE', 'mock')
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
    vi.stubEnv('GIFT_PAYMENT_MAX_ATTEMPTS', String(MAX_ATTEMPTS))
    vi.stubEnv('GIFT_PAYMENT_RETRY_WINDOW', '24h')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function createUser(label: string): Promise<string> {
    const id = randomUUID()
    await prisma.user.create({ data: { id, displayName: `${label}-${id.slice(0, 8)}` } })
    userIds.push(id)
    return id
  }

  async function createPaymentMethod(userId: string, cardLast4: string): Promise<string> {
    const issued = await getPortOneClient().issueBillingKey({ userId, cardBrand: '신한', cardLast4 })
    if (!issued.ok) throw new Error(`빌링키 발급 실패: ${issued.reason}`)
    const created = await prisma.paymentMethod.create({
      data: {
        userId,
        billingKey: encryptBillingKey(issued.billingKey),
        cardBrand: '신한',
        cardLast4,
      },
      select: { id: true },
    })
    return created.id
  }

  /** 한 번 실패해 PAYMENT_FAILED 로 남은 요청 — 재시도의 출발점이다 */
  async function createFailedGift(
    giverId: string,
    receiverId: string,
    paymentMethodId: string,
    overrides: {
      status?: 'PENDING' | 'PAYING' | 'PAID' | 'PAYMENT_FAILED'
      paymentAttemptCount?: number
      paymentRetryUntil?: Date
    } = {},
  ): Promise<string> {
    const created = await prisma.giftRequest.create({
      data: {
        giverId,
        receiverId,
        status: overrides.status ?? 'PAYMENT_FAILED',
        resolution: 'APPROVED',
        productId,
        productSnapshot: { name: '핸드크림 세트', imageUrl: null, price: 32000 },
        requestedAmount: 32000,
        finalAmount: 32000,
        receiverDisplayName: '민수',
        paymentMethodId,
        consentAgreedAt: new Date(),
        consentVersion: '1',
        respondDueAt: new Date(Date.now() - 60 * 1000),
        paymentAttemptCount: overrides.paymentAttemptCount ?? 1,
        paymentRetryUntil: overrides.paymentRetryUntil ?? new Date(Date.now() + 12 * HOUR_MS),
      },
      select: { id: true },
    })
    return created.id
  }

  async function notificationTypesFor(userId: string): Promise<string[]> {
    const rows = await prisma.notification.findMany({
      where: { userId },
      select: { type: true },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((row) => row.type)
  }

  beforeAll(async () => {
    const name = `테스트-카테고리-${randomUUID().slice(0, 8)}`
    const category = await prisma.category.create({
      data: { name, sortOrder: 9998 },
      select: { id: true },
    })
    categoryId = category.id
    const product = await prisma.product.create({
      data: { name: '핸드크림 세트', categoryId, price: 32000 },
      select: { id: true },
    })
    productId = product.id
  })

  afterAll(async () => {
    if (!hasDatabase) return
    await prisma.payment.deleteMany({ where: { giftRequest: { giverId: { in: userIds } } } })
    await prisma.giftRequest.deleteMany({ where: { giverId: { in: userIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    if (productId) await prisma.product.deleteMany({ where: { id: productId } })
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } })
  })

  it('결제수단을 바꿔 재시도하면 성공한다 (FR-030)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const failingMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const goodMethodId = await createPaymentMethod(giverId, GOOD_CARD_LAST4)
    const giftRequestId = await createFailedGift(giverId, receiverId, failingMethodId)

    const result = await actAs(giverId, () =>
      retryGiftPayment({ giftRequestId, paymentMethodId: goodMethodId }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.outcome).toBe('PAID')

    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PAID')
    // 바뀐 수단이 남는다 — 복구 화면이 "무엇으로 결제됐는지" 보여줘야 한다 (SCR-M3-16)
    expect(gift.paymentMethodId).toBe(goodMethodId)
    expect(await notificationTypesFor(receiverId)).toEqual(['GIFT_PAID'])
  })

  it('같은 수단으로 재시도해 마지막 기회를 쓰면 CANCELLED + 양쪽 고지 (FR-031·FR-032)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const failingMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const giftRequestId = await createFailedGift(giverId, receiverId, failingMethodId, {
      paymentAttemptCount: MAX_ATTEMPTS - 1,
    })

    const result = await actAs(giverId, () => retryGiftPayment({ giftRequestId }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.outcome).toBe('CANCELLED')

    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('CANCELLED')
    expect(await notificationTypesFor(receiverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
    expect(await notificationTypesFor(giverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
  })

  it('기한이 지나면 RETRY_EXPIRED — 잠그지도 시도 횟수를 쓰지도 않는다 (FR-031)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const failingMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const giftRequestId = await createFailedGift(giverId, receiverId, failingMethodId, {
      paymentRetryUntil: new Date(Date.now() - HOUR_MS),
    })

    const result = await actAs(giverId, () => retryGiftPayment({ giftRequestId }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('RETRY_EXPIRED')

    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PAYMENT_FAILED')
    expect(gift.paymentAttemptCount).toBe(1)
    expect(await prisma.payment.count({ where: { giftRequestId } })).toBe(0)
  })

  it('시도 횟수를 다 쓴 요청은 NOT_RETRYABLE', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const failingMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const giftRequestId = await createFailedGift(giverId, receiverId, failingMethodId, {
      paymentAttemptCount: MAX_ATTEMPTS,
    })

    const result = await actAs(giverId, () => retryGiftPayment({ giftRequestId }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_RETRYABLE')
  })

  it('PAYMENT_FAILED 가 아닌 요청은 NOT_RETRYABLE — 이미 결제된 건을 다시 긁지 않는다', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const methodId = await createPaymentMethod(giverId, GOOD_CARD_LAST4)
    const giftRequestId = await createFailedGift(giverId, receiverId, methodId, { status: 'PAID' })

    const result = await actAs(giverId, () => retryGiftPayment({ giftRequestId }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_RETRYABLE')
    expect(await prisma.payment.count({ where: { giftRequestId } })).toBe(0)
  })

  it('수령자는 재시도할 수 없다 — 실패 복구는 giver 전용이다 (FR-030)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const failingMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const giftRequestId = await createFailedGift(giverId, receiverId, failingMethodId)

    const result = await actAs(receiverId, () => retryGiftPayment({ giftRequestId }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_OWNER')
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PAYMENT_FAILED')
  })

  it('남의 결제수단으로 바꿔치기할 수 없다 — 수단은 그대로 남는다', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const strangerId = await createUser('stranger')
    const failingMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const strangerMethodId = await createPaymentMethod(strangerId, GOOD_CARD_LAST4)
    const giftRequestId = await createFailedGift(giverId, receiverId, failingMethodId)

    const result = await actAs(giverId, () =>
      retryGiftPayment({ giftRequestId, paymentMethodId: strangerMethodId }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_OWNER')
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.paymentMethodId).toBe(failingMethodId)
  })

  it('더블탭으로 두 번 눌러도 결제는 1회다 (FR-027 · R2 재잠금)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const goodMethodId = await createPaymentMethod(giverId, GOOD_CARD_LAST4)
    const giftRequestId = await createFailedGift(giverId, receiverId, goodMethodId)

    const [first, second] = await Promise.all([
      actAs(giverId, () => retryGiftPayment({ giftRequestId })),
      actAs(giverId, () => retryGiftPayment({ giftRequestId })),
    ])

    // 한쪽만 통과한다 — 나머지는 이미 진행 중이라 NOT_RETRYABLE
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1)
    expect(await prisma.payment.count({ where: { giftRequestId } })).toBe(1)
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PAID')
    expect(await notificationTypesFor(receiverId)).toEqual(['GIFT_PAID'])
  })
})
