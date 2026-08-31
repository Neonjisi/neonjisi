// @vitest-environment node
/**
 * T016 — chargeGiftRequest() 통합 테스트 (US5 · FR-028~FR-033)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §2 · research.md R7
 *
 * **이 파일이 소유 경계를 판정한다.** charge 는 잠긴(PAYING) 요청 하나를 받아
 * PortOne 호출 → Payment 기록 → 상태 확정 → 결제 알림까지 전부 소유한다. 호출자
 * (approveGift · counterGift · retryGiftPayment)는 그 뒤에서 상태도 알림도 만지지 않는다 —
 * 양쪽에 두면 **알림이 두 번 간다** (분담표 §7 "결제 알림이 두 번 온다").
 *
 * 여기서 못 박는 것 넷:
 *  ① 성공 → PAID + Payment(PAID) + **양쪽** 알림 (FR-029)
 *  ② 실패 → PAYMENT_FAILED + **주는 사람에게만** 알림 (FR-030 — 수령자에게 실패 진행 비노출)
 *  ③ 횟수·기한 초과 → CANCELLED + **양쪽 고지** (FR-032 — "승인까지 해놓고 소식이 끊기는 것이 최악")
 *  ④ 잠기지 않은 요청은 받지 않는다 (R2 전제)
 *
 * 실 DB 통합 테스트라 DATABASE_URL 이 필요하다. 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다.
 * 결제는 **항상 mock** 이다 — 뒷자리 0000 카드가 결정론적 실패를 만든다 (R1).
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

const { hasM3GiftTables } = await import('../support/m3-tables')

const hasDatabase = Boolean(process.env.DATABASE_URL)
// lib/prisma 는 임포트 시점에 DATABASE_URL 을 요구하므로 env 로드 뒤에 동적 임포트한다.
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

// J 의 마이그레이션(T004) 전에는 M3 테이블이 없다 — 실패가 아니라 skip 이다 (tests/support/m3-tables.ts)
const canRun = hasDatabase && (await hasM3GiftTables(prisma))

const { chargeGiftRequest } = await import('@/lib/gift/charge')
const { encryptBillingKey } = await import('@/lib/crypto/billing-key')
const { getPortOneClient } = await import('@/lib/portone/client')

/** 테스트 전용 고정 키 — 실키가 아니다 */
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64')
const MAX_ATTEMPTS = 3
const RETRY_WINDOW_HOURS = 24
const HOUR_MS = 60 * 60 * 1000

const GOOD_CARD_LAST4 = '4821'
/** R1 mock 실패 규약 — 이 카드는 결제가 항상 실패한다 */
const FAILING_CARD_LAST4 = '0000'

describe.skipIf(!canRun)('chargeGiftRequest — 결제 실행의 소유 경계 (T016)', () => {
  const userIds: string[] = []
  let categoryId = ''
  let productId = ''

  beforeEach(() => {
    vi.stubEnv('PORTONE_MODE', 'mock')
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
    vi.stubEnv('GIFT_PAYMENT_MAX_ATTEMPTS', String(MAX_ATTEMPTS))
    vi.stubEnv('GIFT_PAYMENT_RETRY_WINDOW', `${RETRY_WINDOW_HOURS}h`)
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
    const issued = await getPortOneClient().issueBillingKey({
      userId,
      cardBrand: '신한',
      cardLast4,
    })
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

  type GiftOverrides = {
    status?: 'PENDING' | 'PAYING' | 'PAID' | 'PAYMENT_FAILED' | 'EXPIRED' | 'CANCELLED'
    paymentAttemptCount?: number
    paymentRetryUntil?: Date | null
    counterAmount?: number | null
    finalAmount?: number | null
  }

  /** 호출자가 이미 잠근 상태(PAYING)를 기본으로 만든다 — charge 는 잠긴 요청만 받는다 */
  async function createLockedGift(
    giverId: string,
    receiverId: string,
    paymentMethodId: string,
    overrides: GiftOverrides = {},
  ): Promise<string> {
    const requestedAmount = 32000
    const hasCounter = typeof overrides.counterAmount === 'number'
    const created = await prisma.giftRequest.create({
      data: {
        giverId,
        receiverId,
        status: overrides.status ?? 'PAYING',
        resolution: hasCounter ? 'COUNTERED' : 'APPROVED',
        productId,
        productSnapshot: { name: '핸드크림 세트', imageUrl: null, price: requestedAmount },
        requestedAmount,
        counterProductId: hasCounter ? productId : null,
        counterProductSnapshot: hasCounter
          ? { name: '립밤 세트', imageUrl: null, price: overrides.counterAmount }
          : undefined,
        counterAmount: hasCounter ? overrides.counterAmount : null,
        counteredAt: hasCounter ? new Date() : null,
        finalAmount:
          overrides.finalAmount ?? (hasCounter ? overrides.counterAmount : requestedAmount),
        receiverDisplayName: '민수',
        paymentMethodId,
        consentAgreedAt: new Date(),
        consentVersion: '1',
        respondDueAt: new Date(Date.now() + 5 * 60 * 1000),
        paymentAttemptCount: overrides.paymentAttemptCount ?? 0,
        paymentRetryUntil: overrides.paymentRetryUntil ?? null,
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
    const category = await prisma.category.upsert({
      where: { name: `테스트-카테고리-${randomUUID().slice(0, 8)}` },
      update: {},
      create: { name: `테스트-카테고리-${randomUUID().slice(0, 8)}`, sortOrder: 9999 },
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
    if (!canRun) return
    await prisma.payment.deleteMany({ where: { giftRequest: { giverId: { in: userIds } } } })
    await prisma.giftRequest.deleteMany({ where: { giverId: { in: userIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    if (productId) await prisma.product.deleteMany({ where: { id: productId } })
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } })
  })

  it('성공하면 PAID 로 확정하고 Payment 를 남기고 **양쪽에** 알린다 (FR-029·FR-033)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const paymentMethodId = await createPaymentMethod(giverId, GOOD_CARD_LAST4)
    const giftRequestId = await createLockedGift(giverId, receiverId, paymentMethodId)

    const result = await chargeGiftRequest(giftRequestId)

    expect(result.outcome).toBe('PAID')

    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PAID')
    expect(gift.paidAt).not.toBeNull()
    expect(gift.finalAmount).toBe(32000)

    const payments = await prisma.payment.findMany({ where: { giftRequestId } })
    expect(payments).toHaveLength(1)
    expect(payments[0].status).toBe('PAID')
    expect(payments[0].amount).toBe(32000)
    expect(payments[0].providerTxId).toMatch(/^mock_pay_/)
    // C8 — 결제 기록은 정확히 하나의 대상에 연결된다 (FR-033)
    expect(payments[0].fundingContributionId).toBeNull()

    expect(await notificationTypesFor(giverId)).toEqual(['GIFT_PAID'])
    expect(await notificationTypesFor(receiverId)).toEqual(['GIFT_PAID'])
  })

  it('대안으로 확정된 요청은 **대안 금액**으로 청구한다 — 차액은 청구되지 않는다 (FR-021)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const paymentMethodId = await createPaymentMethod(giverId, GOOD_CARD_LAST4)
    const giftRequestId = await createLockedGift(giverId, receiverId, paymentMethodId, {
      counterAmount: 18000,
    })

    const result = await chargeGiftRequest(giftRequestId)

    expect(result.outcome).toBe('PAID')
    const payments = await prisma.payment.findMany({ where: { giftRequestId } })
    expect(payments[0].amount).toBe(18000)
  })

  it('실패하면 PAYMENT_FAILED 로 두고 **주는 사람에게만** 알린다 (FR-030)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const paymentMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const giftRequestId = await createLockedGift(giverId, receiverId, paymentMethodId)

    const before = Date.now()
    const result = await chargeGiftRequest(giftRequestId)

    expect(result.outcome).toBe('PAYMENT_FAILED')
    if (result.outcome !== 'PAYMENT_FAILED') return
    expect(result.attemptCount).toBe(1)

    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PAYMENT_FAILED')
    expect(gift.paymentAttemptCount).toBe(1)
    // 첫 실패 시점 + GIFT_PAYMENT_RETRY_WINDOW 가 절대 시각으로 박힌다 (R11)
    expect(gift.paymentRetryUntil).not.toBeNull()
    const retryUntil = gift.paymentRetryUntil as Date
    expect(retryUntil.getTime()).toBeGreaterThanOrEqual(before + RETRY_WINDOW_HOURS * HOUR_MS - 5000)

    // 시도는 실패도 기록된다 (FR-033) — 결제 id 를 호출 전에 만들기 때문에 실패에도 id 가 있다
    const payments = await prisma.payment.findMany({ where: { giftRequestId } })
    expect(payments).toHaveLength(1)
    expect(payments[0].status).toBe('FAILED')
    expect(payments[0].providerTxId).toMatch(/^mock_pay_/)

    expect(await notificationTypesFor(giverId)).toEqual(['GIFT_PAYMENT_FAILED'])
    // 🔑 수령자는 실패 진행 상황을 모른다 — 최종 취소 시점에만 고지한다 (FR-030)
    expect(await notificationTypesFor(receiverId)).toEqual([])
  })

  it('재시도 기한은 첫 실패 시각을 유지한다 — 실패할 때마다 24시간이 늘어나지 않는다', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const paymentMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const firstFailedAt = new Date(Date.now() - 2 * HOUR_MS)
    const giftRequestId = await createLockedGift(giverId, receiverId, paymentMethodId, {
      paymentAttemptCount: 1,
      paymentRetryUntil: new Date(firstFailedAt.getTime() + RETRY_WINDOW_HOURS * HOUR_MS),
    })

    await chargeGiftRequest(giftRequestId)

    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.paymentAttemptCount).toBe(2)
    expect((gift.paymentRetryUntil as Date).getTime()).toBe(
      firstFailedAt.getTime() + RETRY_WINDOW_HOURS * HOUR_MS,
    )
  })

  it('최대 시도 횟수를 채우면 CANCELLED 로 확정하고 **양쪽에** 고지한다 (FR-031·FR-032)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const paymentMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const giftRequestId = await createLockedGift(giverId, receiverId, paymentMethodId, {
      paymentAttemptCount: MAX_ATTEMPTS - 1,
      paymentRetryUntil: new Date(Date.now() + HOUR_MS),
    })

    const result = await chargeGiftRequest(giftRequestId)

    expect(result.outcome).toBe('CANCELLED')
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('CANCELLED')
    expect(gift.cancelledAt).not.toBeNull()
    expect(gift.paymentAttemptCount).toBe(MAX_ATTEMPTS)

    // 🔑 수령자 고지는 누락될 수 없다 (FR-032)
    expect(await notificationTypesFor(receiverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
    expect(await notificationTypesFor(giverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
  })

  it('재시도 기한이 지난 뒤의 실패도 CANCELLED 로 확정한다 (FR-031)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const paymentMethodId = await createPaymentMethod(giverId, FAILING_CARD_LAST4)
    const giftRequestId = await createLockedGift(giverId, receiverId, paymentMethodId, {
      paymentAttemptCount: 1,
      paymentRetryUntil: new Date(Date.now() - HOUR_MS),
    })

    const result = await chargeGiftRequest(giftRequestId)

    expect(result.outcome).toBe('CANCELLED')
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('CANCELLED')
    expect(await notificationTypesFor(receiverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
  })

  it('삭제된 결제수단은 결제사에 가지 않고 실패 경로로 흐른다 (Edge Case · FR-011)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const paymentMethodId = await createPaymentMethod(giverId, GOOD_CARD_LAST4)
    const giftRequestId = await createLockedGift(giverId, receiverId, paymentMethodId)
    await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { status: 'DELETED', deletedAt: new Date() },
    })

    const result = await chargeGiftRequest(giftRequestId)

    expect(result.outcome).toBe('PAYMENT_FAILED')
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PAYMENT_FAILED')
    expect(await notificationTypesFor(giverId)).toEqual(['GIFT_PAYMENT_FAILED'])
    expect(await notificationTypesFor(receiverId)).toEqual([])
  })

  it('잠기지 않은 요청은 받지 않는다 — 잠금은 호출자 몫이다 (R2 전제)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const paymentMethodId = await createPaymentMethod(giverId, GOOD_CARD_LAST4)
    const giftRequestId = await createLockedGift(giverId, receiverId, paymentMethodId, {
      status: 'PENDING',
    })

    await expect(chargeGiftRequest(giftRequestId)).rejects.toThrow()

    // 상태도 결제 기록도 건드리지 않는다
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PENDING')
    expect(await prisma.payment.count({ where: { giftRequestId } })).toBe(0)
  })

  it('없는 요청 id 는 예외다 — 호출자가 방금 잠근 요청만 넘긴다', async () => {
    await expect(chargeGiftRequest(randomUUID())).rejects.toThrow()
  })
})
