// @vitest-environment node
/**
 * 재시도 기한 지연 평가 통합 테스트 (US5 · FR-031·FR-032)
 * 계약: research.md R3 의 지연 평가 방식을 결제 재시도 기한에 적용한다
 *
 * **왜 필요한가.** 취소 확정은 지금까지 "실패한 시도가 마지막이었을 때"만 일어났다. 그래서
 * 주는 사람이 재시도를 **안 하면** 요청은 PAYMENT_FAILED 로 영영 남고, 수령자는 FR-032 의
 * 취소 고지를 받지 못한다 — "승인까지 해놓고 소식이 끊기는 것이 최악이다"가 그대로 재현된다.
 *
 * 만료(R3)와 같은 해법을 쓴다: **배치 없이 조회·시도 시점에 판정**하고, 확정 지점에서 알림을
 * 만든다. 여기서 못 박는 것 넷:
 *  ① 기한이 지난 PAYMENT_FAILED 를 만나면 CANCELLED 로 확정하고 **양쪽에** 고지한다
 *  ② 아직 기한 안이면 아무것도 바꾸지 않는다
 *  ③ 동시에 두 번 평가해도 **알림은 한 번씩** (조건부 UPDATE)
 *  ④ 종착 상태는 건드리지 않는다
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
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

const canRun = hasDatabase && (await hasM3GiftTables(prisma))

const { evaluateRetryExpiry } = await import('@/lib/gift/retry-window')
const { encryptBillingKey } = await import('@/lib/crypto/billing-key')
const { getPortOneClient } = await import('@/lib/portone/client')

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString('base64')
const MAX_ATTEMPTS = 3
const HOUR_MS = 60 * 60 * 1000

describe.skipIf(!canRun)('evaluateRetryExpiry — 재시도 기한의 지연 평가', () => {
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

  async function createPaymentMethod(userId: string): Promise<string> {
    const issued = await getPortOneClient().issueBillingKey({
      userId,
      cardBrand: '신한',
      cardLast4: '0000',
    })
    if (!issued.ok) throw new Error(issued.reason)
    const created = await prisma.paymentMethod.create({
      data: {
        userId,
        provider: 'portone',
        billingKey: encryptBillingKey(issued.billingKey),
        cardBrand: '신한',
        cardLast4: '0000',
      },
      select: { id: true },
    })
    return created.id
  }

  async function createGift(
    giverId: string,
    receiverId: string,
    paymentMethodId: string,
    overrides: {
      status?: 'PAYMENT_FAILED' | 'PAID' | 'CANCELLED' | 'PENDING'
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
        respondDueAt: new Date(Date.now() - HOUR_MS),
        paymentAttemptCount: overrides.paymentAttemptCount ?? 1,
        paymentRetryUntil: overrides.paymentRetryUntil ?? new Date(Date.now() - HOUR_MS),
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
    const category = await prisma.category.create({
      data: { name: `테스트-카테고리-${randomUUID().slice(0, 8)}`, sortOrder: 9997 },
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

  it('기한이 지난 실패는 CANCELLED 로 확정하고 **양쪽에** 고지한다 (FR-032)', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const methodId = await createPaymentMethod(giverId)
    const giftRequestId = await createGift(giverId, receiverId, methodId)

    const outcome = await evaluateRetryExpiry(giftRequestId)

    expect(outcome).toBe('CANCELLED')
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('CANCELLED')
    expect(gift.cancelledAt).not.toBeNull()

    // 🔑 수령자 고지가 이 변경의 이유다 — 없으면 승인해 준 사람은 영영 소식을 못 듣는다
    expect(await notificationTypesFor(receiverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
    expect(await notificationTypesFor(giverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
  })

  it('시도 횟수를 다 쓴 채 남아 있는 실패도 확정한다', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const methodId = await createPaymentMethod(giverId)
    const giftRequestId = await createGift(giverId, receiverId, methodId, {
      paymentAttemptCount: MAX_ATTEMPTS,
      paymentRetryUntil: new Date(Date.now() + HOUR_MS),
    })

    expect(await evaluateRetryExpiry(giftRequestId)).toBe('CANCELLED')
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('CANCELLED')
  })

  it('아직 기한 안이면 아무것도 바꾸지 않는다 — 재시도할 수 있는 요청을 죽이지 않는다', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const methodId = await createPaymentMethod(giverId)
    const giftRequestId = await createGift(giverId, receiverId, methodId, {
      paymentRetryUntil: new Date(Date.now() + 12 * HOUR_MS),
    })

    expect(await evaluateRetryExpiry(giftRequestId)).toBe('UNCHANGED')
    const gift = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(gift.status).toBe('PAYMENT_FAILED')
    expect(await notificationTypesFor(receiverId)).toEqual([])
  })

  it('종착 상태는 건드리지 않는다 — 이미 결제된 건을 취소로 뒤집지 않는다', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const methodId = await createPaymentMethod(giverId)
    const paid = await createGift(giverId, receiverId, methodId, { status: 'PAID' })
    const cancelled = await createGift(giverId, receiverId, methodId, { status: 'CANCELLED' })

    expect(await evaluateRetryExpiry(paid)).toBe('UNCHANGED')
    expect(await evaluateRetryExpiry(cancelled)).toBe('UNCHANGED')
    expect((await prisma.giftRequest.findUniqueOrThrow({ where: { id: paid } })).status).toBe('PAID')
    expect(await notificationTypesFor(receiverId)).toEqual([])
  })

  it('동시에 두 번 평가해도 고지는 한 번씩이다 — 조건부 UPDATE 가 한쪽만 통과시킨다', async () => {
    const giverId = await createUser('giver')
    const receiverId = await createUser('receiver')
    const methodId = await createPaymentMethod(giverId)
    const giftRequestId = await createGift(giverId, receiverId, methodId)

    const outcomes = await Promise.all([
      evaluateRetryExpiry(giftRequestId),
      evaluateRetryExpiry(giftRequestId),
    ])

    expect(outcomes.filter((outcome) => outcome === 'CANCELLED')).toHaveLength(1)
    expect(await notificationTypesFor(receiverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
    expect(await notificationTypesFor(giverId)).toEqual(['GIFT_CANCELLED_BY_PAYMENT'])
  })

  it('없는 요청은 조용히 UNCHANGED — 조회 경로에서 불리므로 던지지 않는다', async () => {
    expect(await evaluateRetryExpiry(randomUUID())).toBe('UNCHANGED')
  })
})
