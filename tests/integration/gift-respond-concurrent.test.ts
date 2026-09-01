// @vitest-environment node
/**
 * T045 (J13) — 응답 동시성 통합 테스트 (US4 · SC-002 · research R2·R3)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4 `approveGift`·`counterGift`
 *
 * 이 마일스톤의 단일 방어 지점을 판정한다 — `PENDING → PAYING` 조건부 UPDATE(R2)가
 * 없으면 더블탭·동시 요청에서 중복 청구가 나고, 화면상으로는 완전히 정상으로 보인다.
 *
 * D5 `lib/gift/charge.ts`(T017)는 vi.mock 으로 대체한다 — 파일은 D 소유라 만들지 않는다.
 * 따라서 성공 경로의 종착 상태는 PAYING 에 머문다. 그것 자체가 소유 경계(contracts §2)의
 * 검증이다: respond 는 잠금까지만 소유하고, 상태 확정·Payment·결제 알림은 charge 안이다.
 *
 * 픽스처에 Friendship 을 만들지 않는다 — 응답은 관계 상태와 무관해야 한다 (D3 "진행 중
 * 거래 예외"). 이 테스트가 통과한다는 것이 그 사실의 증명이기도 하다.
 *
 * 실 DB 통합 테스트라 .env.local 이 필요하다. 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

// 동시 호출 각각에 다른 세션을 묶어야 한다. mockResolvedValueOnce 는 호출 순서에 기대므로
// AsyncLocalStorage 로 비동기 문맥마다 userId 를 실어 보낸다 — getClaims 목이 그것을 읽는다.
const h = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return {
    sessionUser: new AsyncLocalStorage<string>(),
    chargeGiftRequest: vi.fn(),
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// D5(T017) 대체 — 계약: contracts §2. 잠긴 요청만 받는다는 전제를 이 테스트가 강제한다.
vi.mock('@/lib/gift/charge', () => ({ chargeGiftRequest: h.chargeGiftRequest }))

// D 소유 T018(app/gifts/actions/shared.ts)이 오르기 전까지 M2 app/friends/actions/shared.ts
// 계약과 같은 모양으로 대체한다 — ③ gift-request.test.ts 와 같은 방식이고 **파일은 만들지
// 않는다** (M3-J-BRIEFING 공통 규칙). T018 이 실제로 오르면 이 mock 을 지워 진짜
// guarded(STORAGE_FAILED 변환)를 태운다.
vi.mock('@/app/gifts/actions/shared', () => ({
  failure: (error: { code: string; message: string }) => ({ ok: false, error }),
  guarded: async (message: string, run: () => Promise<unknown>) => {
    try {
      return await run()
    } catch (e) {
      console.error('[gift-respond.test mock guarded] 예상 못 한 예외 — STORAGE_FAILED 변환', e)
      return { ok: false, error: { code: 'STORAGE_FAILED', message } }
    }
  },
}))

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }
const { approveGift, counterGift } = await import('@/app/gifts/actions/respond')

const MINUTE_MS = 60 * 1000
/** 경합 창이 좁아 한 번으로는 재현되지 않을 수 있다 — 라운드마다 새 요청으로 반복한다 */
const ROUNDS = 3
/** 원격 DB 왕복이 라운드당 수십 번이라 기본 5초로는 부족하다 */
const RACE_TEST_TIMEOUT = 60_000
const DB_TEST_TIMEOUT = 30_000

const REQUESTED_PRICE = 50_000
const CHEAP_PRICE = 30_000
const OVER_LIMIT_PRICE = 80_000

const SHIPPING = {
  recipientName: '김수령',
  phone: '010-1234-5678',
  address: '서울시 강남구 테헤란로 1',
  addressDetail: '101동 202호',
}

type RespondResult = Awaited<ReturnType<typeof approveGift>>

function errorCode(result: RespondResult): string | null {
  return result.ok ? null : result.error.code
}

describe.skipIf(!hasDatabase)('approveGift · counterGift — 동시성·상한·만료 (T045)', () => {
  const userIds: string[] = []
  const productIds: string[] = []
  let categoryId: string

  let giver: { id: string; displayName: string }
  let receiver: { id: string; displayName: string }
  let outsider: { id: string; displayName: string }
  let paymentMethodId: string
  let mainProduct: { id: string; name: string; price: number }
  let cheapProduct: { id: string; name: string; price: number }
  let overLimitProduct: { id: string; name: string; price: number }
  let inactiveProduct: { id: string; name: string; price: number }

  async function createUser(label: string): Promise<{ id: string; displayName: string }> {
    const id = randomUUID()
    const displayName = `${label} ${id.slice(0, 8)}`
    await prisma.user.create({ data: { id, displayName } })
    userIds.push(id)
    return { id, displayName }
  }

  async function createProduct(name: string, price: number, isActive = true) {
    const product = await prisma.product.create({
      data: { name: `T045 ${name} ${randomUUID().slice(0, 8)}`, categoryId, price, isActive },
    })
    productIds.push(product.id)
    return { id: product.id, name: product.name, price }
  }

  /** PENDING 기본 요청. 스냅샷 3종은 createGiftRequest(T038)와 같은 모양으로 채운다 */
  async function createGift(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    return prisma.giftRequest.create({
      data: {
        giverId: giver.id,
        receiverId: receiver.id,
        status: 'PENDING',
        productId: mainProduct.id,
        productSnapshot: { name: mainProduct.name, imageUrl: null, price: mainProduct.price },
        requestedAmount: REQUESTED_PRICE,
        receiverDisplayName: receiver.displayName,
        paymentMethodId,
        consentAgreedAt: new Date(),
        consentVersion: '1',
        respondDueAt: new Date(Date.now() + 5 * MINUTE_MS),
        ...overrides,
      },
      select: { id: true },
    })
  }

  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
  }

  function giftRow(id: string) {
    return prisma.giftRequest.findUniqueOrThrow({ where: { id } })
  }

  function counteredNotificationCount(giftRequestId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId: giver.id,
        type: 'GIFT_COUNTERED',
        payload: { path: ['giftRequestId'], equals: giftRequestId },
      },
    })
  }

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`

    giver = await createUser('T045 G')
    receiver = await createUser('T045 R')
    outsider = await createUser('T045 X')

    const category = await prisma.category.create({
      data: { name: `T045 분류 ${randomUUID().slice(0, 8)}`, sortOrder: 9_999 },
    })
    categoryId = category.id

    mainProduct = await createProduct('요청 상품', REQUESTED_PRICE)
    cheapProduct = await createProduct('저렴한 대안', CHEAP_PRICE)
    overLimitProduct = await createProduct('상한 초과 대안', OVER_LIMIT_PRICE)
    inactiveProduct = await createProduct('판매 종료 대안', CHEAP_PRICE, false)

    const method = await prisma.paymentMethod.create({
      data: {
        userId: giver.id,
        provider: 'portone',
        billingKey: `enc-test-${randomUUID()}`,
        cardBrand: '테스트카드',
        cardLast4: '1234',
        status: 'ACTIVE',
      },
    })
    paymentMethodId = method.id
  }, DB_TEST_TIMEOUT)

  beforeEach(() => {
    h.chargeGiftRequest.mockReset().mockResolvedValue({ outcome: 'PAID' })
  })

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.giftRequest.deleteMany({ where: { giverId: { in: userIds } } })
    await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })

  it(
    '같은 요청을 동시에 두 번 승인하면 결제는 정확히 1회 — 진 쪽은 ALREADY_RESPONDED (R2)',
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const gift = await createGift()
        h.chargeGiftRequest.mockClear()

        const results = await Promise.all([
          as(receiver.id, () => approveGift({ giftRequestId: gift.id, shippingAddress: SHIPPING })),
          as(receiver.id, () => approveGift({ giftRequestId: gift.id, shippingAddress: SHIPPING })),
        ])

        expect(results.map(errorCode).sort(), `round ${round}`).toEqual([
          'ALREADY_RESPONDED',
          null,
        ])
        expect(results.find((r) => r.ok), `round ${round}: 승자`).toEqual({
          ok: true,
          data: { outcome: 'PAID' },
        })

        // 중복 청구 방지의 본체 — 두 호출이 전부 잠금을 통과하면 여기가 2가 된다
        expect(h.chargeGiftRequest, `round ${round}: 결제 횟수`).toHaveBeenCalledTimes(1)
        expect(h.chargeGiftRequest).toHaveBeenCalledWith(gift.id)

        const row = await giftRow(gift.id)
        // charge 가 mock 이라 상태 확정이 없다 — 잠금(PAYING)까지가 respond 소유 (contracts §2)
        expect(row.status, `round ${round}`).toBe('PAYING')
        expect(row.resolution, `round ${round}`).toBe('APPROVED')
        expect(row.finalAmount, `round ${round}`).toBe(REQUESTED_PRICE)
        expect(row.shippingAddressSnapshot, `round ${round}`).toEqual(SHIPPING)
        expect(row.resolvedAt, `round ${round}`).not.toBeNull()
      }
    },
    RACE_TEST_TIMEOUT,
  )

  it(
    '같은 요청에 동시에 두 번 대안을 확정해도 결제 1회 · GIFT_COUNTERED 알림 1건 (R2·R7)',
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const gift = await createGift()
        h.chargeGiftRequest.mockClear()

        const results = await Promise.all([
          as(receiver.id, () =>
            counterGift({
              giftRequestId: gift.id,
              counterProductId: cheapProduct.id,
              shippingAddress: SHIPPING,
            }),
          ),
          as(receiver.id, () =>
            counterGift({
              giftRequestId: gift.id,
              counterProductId: cheapProduct.id,
              shippingAddress: SHIPPING,
            }),
          ),
        ])

        expect(results.map(errorCode).sort(), `round ${round}`).toEqual([
          'ALREADY_RESPONDED',
          null,
        ])
        expect(h.chargeGiftRequest, `round ${round}: 결제 횟수`).toHaveBeenCalledTimes(1)
        expect(h.chargeGiftRequest).toHaveBeenCalledWith(gift.id)

        const row = await giftRow(gift.id)
        expect(row.status, `round ${round}`).toBe('PAYING')
        expect(row.resolution, `round ${round}`).toBe('COUNTERED')
        expect(row.counterProductId, `round ${round}`).toBe(cheapProduct.id)
        expect(row.counterAmount, `round ${round}`).toBe(CHEAP_PRICE)
        expect(row.counterProductSnapshot, `round ${round}`).toEqual({
          name: cheapProduct.name,
          imageUrl: null,
          price: CHEAP_PRICE,
        })
        expect(row.finalAmount, `round ${round}`).toBe(CHEAP_PRICE)
        expect(row.counteredAt, `round ${round}`).not.toBeNull()
        expect(row.shippingAddressSnapshot, `round ${round}`).toEqual(SHIPPING)

        // 대안 경로의 GIFT_COUNTERED 만 respond 가 보낸다 (R7) — 진 쪽이 또 보내면 2가 된다
        expect(await counteredNotificationCount(gift.id), `round ${round}: 알림`).toBe(1)
      }
    },
    RACE_TEST_TIMEOUT,
  )

  it(
    '대안 금액이 요청 금액을 넘으면 COUNTER_OVER_LIMIT — 잠금 전에 거부된다 (FR-021)',
    async () => {
      const gift = await createGift()

      const result = await as(receiver.id, () =>
        counterGift({
          giftRequestId: gift.id,
          counterProductId: overLimitProduct.id,
          shippingAddress: SHIPPING,
        }),
      )

      expect(errorCode(result)).toBe('COUNTER_OVER_LIMIT')
      expect(h.chargeGiftRequest).not.toHaveBeenCalled()

      const row = await giftRow(gift.id)
      expect(row.status).toBe('PENDING')
      expect(row.resolution).toBeNull()
      expect(row.counterProductId).toBeNull()
      expect(await counteredNotificationCount(gift.id)).toBe(0)
    },
    DB_TEST_TIMEOUT,
  )

  it(
    '판매 종료(isActive=false) 상품으로는 대안을 확정할 수 없다 — PRODUCT_UNAVAILABLE',
    async () => {
      const gift = await createGift()

      const result = await as(receiver.id, () =>
        counterGift({
          giftRequestId: gift.id,
          counterProductId: inactiveProduct.id,
          shippingAddress: SHIPPING,
        }),
      )

      expect(errorCode(result)).toBe('PRODUCT_UNAVAILABLE')
      expect(h.chargeGiftRequest).not.toHaveBeenCalled()
      expect((await giftRow(gift.id)).status).toBe('PENDING')
    },
    DB_TEST_TIMEOUT,
  )

  it(
    '기한이 지난 요청에 응답하면 GIFT_EXPIRED — 그 자리에서 EXPIRED 확정 + giver 알림 1건 (R3)',
    async () => {
      const gift = await createGift({ respondDueAt: new Date(Date.now() - MINUTE_MS) })

      const approved = await as(receiver.id, () =>
        approveGift({ giftRequestId: gift.id, shippingAddress: SHIPPING }),
      )
      expect(errorCode(approved)).toBe('GIFT_EXPIRED')

      const row = await giftRow(gift.id)
      expect(row.status).toBe('EXPIRED')
      expect(row.expiredAt).not.toBeNull()
      expect(row.shippingAddressSnapshot).toBeNull()

      // 만료 확정을 기록하는 바로 그 지점에서 알림이 생긴다 (R3 — evaluateExpiry 소유)
      const expiredNotifications = () =>
        prisma.notification.count({
          where: {
            userId: giver.id,
            type: 'GIFT_EXPIRED',
            payload: { path: ['giftRequestId'], equals: gift.id },
          },
        })
      expect(await expiredNotifications()).toBe(1)

      // 이미 EXPIRED 로 확정된 요청에 다시 응답해도 같은 답 — 알림이 중복되지 않는다
      const countered = await as(receiver.id, () =>
        counterGift({
          giftRequestId: gift.id,
          counterProductId: cheapProduct.id,
          shippingAddress: SHIPPING,
        }),
      )
      expect(errorCode(countered)).toBe('GIFT_EXPIRED')
      expect(await expiredNotifications()).toBe(1)

      expect(h.chargeGiftRequest).not.toHaveBeenCalled()
    },
    DB_TEST_TIMEOUT,
  )

  it(
    '주는 사람이 먼저 취소한 요청에 응답하면 GIFT_CANCELLED',
    async () => {
      const gift = await createGift({ status: 'CANCELLED', cancelledAt: new Date() })

      const result = await as(receiver.id, () =>
        approveGift({ giftRequestId: gift.id, shippingAddress: SHIPPING }),
      )

      expect(errorCode(result)).toBe('GIFT_CANCELLED')
      expect(h.chargeGiftRequest).not.toHaveBeenCalled()
      expect((await giftRow(gift.id)).status).toBe('CANCELLED')
    },
    DB_TEST_TIMEOUT,
  )

  it(
    '이미 확정된(PAID) 요청에 다시 응답하면 ALREADY_RESPONDED',
    async () => {
      const gift = await createGift({
        status: 'PAID',
        resolution: 'APPROVED',
        resolvedAt: new Date(),
        finalAmount: REQUESTED_PRICE,
        paidAt: new Date(),
        shippingAddressSnapshot: SHIPPING,
      })

      const result = await as(receiver.id, () =>
        approveGift({ giftRequestId: gift.id, shippingAddress: SHIPPING }),
      )

      expect(errorCode(result)).toBe('ALREADY_RESPONDED')
      expect(h.chargeGiftRequest).not.toHaveBeenCalled()
    },
    DB_TEST_TIMEOUT,
  )

  it(
    '수령자가 아니면 NOT_RECEIVER — giver·제3자·존재하지 않는 요청 전부 같은 답',
    async () => {
      const gift = await createGift()

      const byGiver = await as(giver.id, () =>
        approveGift({ giftRequestId: gift.id, shippingAddress: SHIPPING }),
      )
      const byOutsider = await as(outsider.id, () =>
        approveGift({ giftRequestId: gift.id, shippingAddress: SHIPPING }),
      )
      const missing = await as(receiver.id, () =>
        approveGift({ giftRequestId: randomUUID(), shippingAddress: SHIPPING }),
      )

      expect(errorCode(byGiver)).toBe('NOT_RECEIVER')
      expect(errorCode(byOutsider)).toBe('NOT_RECEIVER')
      expect(errorCode(missing)).toBe('NOT_RECEIVER')
      expect(h.chargeGiftRequest).not.toHaveBeenCalled()
      expect((await giftRow(gift.id)).status).toBe('PENDING')
    },
    DB_TEST_TIMEOUT,
  )

  it(
    '배송지 필수 항목이 비면 VALIDATION_FAILED — 빈 스냅샷이 결제로 넘어가지 않는다',
    async () => {
      const gift = await createGift()

      const result = await as(receiver.id, () =>
        approveGift({
          giftRequestId: gift.id,
          shippingAddress: { ...SHIPPING, recipientName: '   ' },
        }),
      )

      expect(errorCode(result)).toBe('VALIDATION_FAILED')
      expect(h.chargeGiftRequest).not.toHaveBeenCalled()

      const row = await giftRow(gift.id)
      expect(row.status).toBe('PENDING')
      expect(row.shippingAddressSnapshot).toBeNull()
    },
    DB_TEST_TIMEOUT,
  )
})
