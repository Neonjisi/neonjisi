// @vitest-environment node
/**
 * T021 — lib/dal/gift.ts 단위 테스트 (구현보다 먼저 — constitution 원칙 II)
 *
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §3
 *  - 모든 조회가 `evaluateExpiry()` 를 경유한 결과만 반환한다 (R3) — 예외 없음.
 *    이걸 빠뜨린 조회 함수가 하나라도 생기면 "만료됐는데 승인이 된다" (분담표 §10)
 *  - View 는 스냅샷 필드만 담는다 — Product·User 를 화면이 조인할 수 없게 (R5)
 *  - getGiftRequest 인가: giver 또는 receiver. 제3자·부재는 같은 null — 존재 힌트를 주지 않는다
 *
 * prisma·state 는 mock — 경유 여부와 호출 형태를 검증한다 (M2 dal-invite.test.ts 패턴).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  verifySession: vi.fn(),
  giftFindMany: vi.fn(),
  giftFindUnique: vi.fn(),
  evaluateExpiry: vi.fn(),
  evaluateExpiryAll: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { giftRequest: { findMany: h.giftFindMany, findUnique: h.giftFindUnique } },
}))
vi.mock('@/lib/dal/session', () => ({ verifySession: h.verifySession }))
vi.mock('@/lib/gift/state', () => ({
  evaluateExpiry: h.evaluateExpiry,
  evaluateExpiryAll: h.evaluateExpiryAll,
}))

// React cache() 메모이즈는 RSC 런타임 동작 — 테스트 간 결과가 새지 않게 passthrough 로 고정
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}))

import {
  getPendingRequestsForMe,
  getSentGifts,
  getReceivedGifts,
  getGiftRequest,
} from '@/lib/dal/gift'

const ME = '0b9f8a1e-1111-4222-8333-444455556666'
const OTHER = '9f9f9f9f-2222-4333-8444-555566667777'
const GIFT_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const NOW = new Date('2026-08-31T12:00:00.000Z')
const MIN = 60_000
const at = (delta: number) => new Date(NOW.getTime() + delta)

const SNAPSHOT = { name: '핸드크림 세트', imageUrl: null, price: 32000 }

type Row = Record<string, unknown>

function giftRow(overrides: Row = {}): Row {
  return {
    id: GIFT_ID,
    giverId: OTHER,
    receiverId: ME,
    status: 'PENDING',
    resolution: null,
    respondDueAt: at(+3 * MIN),
    requestedAmount: 32000,
    finalAmount: null,
    productSnapshot: SNAPSHOT,
    counterProductSnapshot: null,
    receiverDisplayName: '김민수',
    paymentAttemptCount: 0,
    paymentRetryUntil: null,
    shippingAddressSnapshot: null,
    createdAt: at(-2 * MIN),
    giver: { displayName: '박지현' },
    paymentMethod: { cardBrand: '신한', cardLast4: '4821' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.verifySession.mockResolvedValue({ userId: ME })
  // 기본은 통과 — 개별 테스트가 만료 시나리오를 덮어쓴다
  h.evaluateExpiry.mockImplementation(async (gift: Row) => gift)
  h.evaluateExpiryAll.mockImplementation(async (gifts: Row[]) => [...gifts])
  h.giftFindMany.mockResolvedValue([])
})

describe('getPendingRequestsForMe — 홈 승인 대기 (FR-038)', () => {
  it('내가 받은 PENDING 만 임박순으로 요청한다', async () => {
    await getPendingRequestsForMe()

    expect(h.giftFindMany).toHaveBeenCalledTimes(1)
    expect(h.giftFindMany.mock.calls[0][0]).toMatchObject({
      where: { receiverId: ME, status: 'PENDING' },
      orderBy: { respondDueAt: 'asc' },
    })
  })

  it('조회 행 전부가 evaluateExpiry 를 경유한다 (R3) — 이 검증이 이 파일의 존재 이유다', async () => {
    const rows = [giftRow(), giftRow({ id: 'g2' })]
    h.giftFindMany.mockResolvedValue(rows)

    await getPendingRequestsForMe()

    expect(h.evaluateExpiryAll).toHaveBeenCalledTimes(1)
    expect(h.evaluateExpiryAll.mock.calls[0][0]).toEqual(rows)
  })

  it('평가에서 만료로 확정된 행은 승인 대기에서 빠진다', async () => {
    const stays = giftRow()
    const expires = giftRow({ id: 'g2', respondDueAt: at(-1 * MIN) })
    h.giftFindMany.mockResolvedValue([stays, expires])
    h.evaluateExpiryAll.mockResolvedValue([stays, { ...expires, status: 'EXPIRED' }])

    const views = await getPendingRequestsForMe()

    expect(views.map((v) => v.id)).toEqual([GIFT_ID])
  })

  it('View 는 스냅샷 필드만 — 정확히 계약의 키만 내보낸다 (R5)', async () => {
    h.giftFindMany.mockResolvedValue([giftRow()])

    const [view] = await getPendingRequestsForMe()

    expect(Object.keys(view).sort()).toEqual(
      [
        'id',
        'counterpartDisplayName',
        'productSnapshot',
        'requestedAmount',
        'respondDueAt',
        'serverNow',
      ].sort(),
    )
    expect(view.counterpartDisplayName).toBe('박지현') // 상대 = giver
    expect(view.productSnapshot).toEqual(SNAPSHOT)
    expect(view.serverNow).toBeInstanceOf(Date) // 카운트다운 보정용 (R8)
  })

  it('productSnapshot 형태가 깨진 행은 목록에서 빼고 나머지는 살린다', async () => {
    h.giftFindMany.mockResolvedValue([giftRow({ productSnapshot: { broken: true } }), giftRow({ id: 'g2' })])

    const views = await getPendingRequestsForMe()

    expect(views.map((v) => v.id)).toEqual(['g2'])
  })

  it('세션이 없으면 redirect 가 전파되고 DB 를 건드리지 않는다', async () => {
    const redirectError = new Error('REDIRECT:/login')
    h.verifySession.mockRejectedValue(redirectError)

    await expect(getPendingRequestsForMe()).rejects.toBe(redirectError)
    expect(h.giftFindMany).not.toHaveBeenCalled()
  })
})

describe('getSentGifts / getReceivedGifts — 내역 (FR-042)', () => {
  it('보낸 내역: giverId = 나, 최신순 — 상대는 receiverDisplayName 스냅샷이다', async () => {
    h.giftFindMany.mockResolvedValue([giftRow({ giverId: ME, receiverId: OTHER })])

    const items = await getSentGifts()

    expect(h.giftFindMany.mock.calls[0][0]).toMatchObject({
      where: { giverId: ME },
      orderBy: { createdAt: 'desc' },
    })
    expect(items[0].role).toBe('giver')
    expect(items[0].counterpartDisplayName).toBe('김민수')
  })

  it('받은 내역: receiverId = 나 — 상대는 giver 의 현재 표시명이다', async () => {
    h.giftFindMany.mockResolvedValue([giftRow()])

    const items = await getReceivedGifts()

    expect(h.giftFindMany.mock.calls[0][0]).toMatchObject({
      where: { receiverId: ME },
      orderBy: { createdAt: 'desc' },
    })
    expect(items[0].role).toBe('receiver')
    expect(items[0].counterpartDisplayName).toBe('박지현')
  })

  it('두 내역 모두 evaluateExpiry 를 경유한다 (R3)', async () => {
    h.giftFindMany.mockResolvedValue([giftRow()])

    await getSentGifts()
    await getReceivedGifts()

    expect(h.evaluateExpiryAll).toHaveBeenCalledTimes(2)
  })

  it('만료로 평가된 행도 내역에는 남는다 — 상태만 EXPIRED 로 바뀐다', async () => {
    const row = giftRow({ respondDueAt: at(-1 * MIN) })
    h.giftFindMany.mockResolvedValue([row])
    h.evaluateExpiryAll.mockResolvedValue([{ ...row, status: 'EXPIRED' }])

    const items = await getReceivedGifts()

    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('EXPIRED')
    expect(items[0].isOngoing).toBe(false)
  })

  it.each([
    ['PENDING', true],
    ['PAYING', true],
    ['PAYMENT_FAILED', true],
    ['PAID', false],
    ['EXPIRED', false],
    ['CANCELLED', false],
  ])('진행 중 판정 (화면 명세 §7): %s → %s', async (status, ongoing) => {
    h.giftFindMany.mockResolvedValue([giftRow({ status })])

    const items = await getReceivedGifts()

    expect(items[0].isOngoing).toBe(ongoing)
  })

  it('resolution 라벨이 그대로 실린다 — 대안 대조 표시용 (FR-042)', async () => {
    h.giftFindMany.mockResolvedValue([
      giftRow({
        status: 'PAID',
        resolution: 'COUNTERED',
        counterProductSnapshot: { name: '립밤', imageUrl: null, price: 15000 },
        finalAmount: 15000,
      }),
    ])

    const items = await getReceivedGifts()

    expect(items[0].resolution).toBe('COUNTERED')
    expect(items[0].counterProductSnapshot).toEqual({ name: '립밤', imageUrl: null, price: 15000 })
    expect(items[0].finalAmount).toBe(15000)
  })
})

describe('getGiftRequest — 상세 (giver 또는 receiver 만)', () => {
  it('giver 가 열면 role=giver · 상대=receiverDisplayName · 결제수단 라벨이 보인다', async () => {
    h.giftFindUnique.mockResolvedValue(giftRow({ giverId: ME, receiverId: OTHER }))

    const view = await getGiftRequest(GIFT_ID)

    expect(view).not.toBeNull()
    expect(view!.role).toBe('giver')
    expect(view!.counterpartDisplayName).toBe('김민수')
    expect(view!.paymentMethodLabel).toBe('신한 **** 4821')
  })

  it('receiver 가 열면 role=receiver — 결제수단 라벨은 감춘다 (giver 에게만)', async () => {
    h.giftFindUnique.mockResolvedValue(giftRow())

    const view = await getGiftRequest(GIFT_ID)

    expect(view!.role).toBe('receiver')
    expect(view!.counterpartDisplayName).toBe('박지현')
    expect(view!.paymentMethodLabel).toBeNull()
  })

  it('제3자와 부재는 같은 null — 존재 여부 힌트를 주지 않는다', async () => {
    h.giftFindUnique.mockResolvedValue(giftRow({ giverId: OTHER, receiverId: 'someone-else' }))
    await expect(getGiftRequest(GIFT_ID)).resolves.toBeNull()

    h.giftFindUnique.mockResolvedValue(null)
    await expect(getGiftRequest(GIFT_ID)).resolves.toBeNull()
  })

  it('단건 조회도 evaluateExpiry 를 경유한다 — 평가 결과가 View 에 실린다 (R3)', async () => {
    const row = giftRow({ respondDueAt: at(-1 * MIN) })
    h.giftFindUnique.mockResolvedValue(row)
    h.evaluateExpiry.mockResolvedValue({ ...row, status: 'EXPIRED' })

    const view = await getGiftRequest(GIFT_ID)

    expect(h.evaluateExpiry).toHaveBeenCalledTimes(1)
    expect(view!.status).toBe('EXPIRED')
  })

  it('배송지 스냅샷이 있으면 파싱해 내보낸다 — 화면은 스냅샷 필드만 읽는다 (R5)', async () => {
    h.giftFindUnique.mockResolvedValue(
      giftRow({
        shippingAddressSnapshot: {
          recipientName: '김민수',
          phone: '010-1234-5678',
          address: '서울시 어딘가 1',
          addressDetail: '101동 202호',
        },
      }),
    )

    const view = await getGiftRequest(GIFT_ID)

    expect(view!.shippingAddress).toEqual({
      recipientName: '김민수',
      phone: '010-1234-5678',
      address: '서울시 어딘가 1',
      addressDetail: '101동 202호',
    })
  })

  it('배송지 스냅샷이 없으면 null — 지어내지 않는다', async () => {
    h.giftFindUnique.mockResolvedValue(giftRow())

    const view = await getGiftRequest(GIFT_ID)

    expect(view!.shippingAddress).toBeNull()
  })

  it('View 키는 계약(§3 GiftDetailView) 그대로다 — Product·User 관계 객체가 새지 않는다', async () => {
    h.giftFindUnique.mockResolvedValue(giftRow())

    const view = await getGiftRequest(GIFT_ID)

    expect(Object.keys(view!).sort()).toEqual(
      [
        'id',
        'role',
        'status',
        'resolution',
        'productSnapshot',
        'counterProductSnapshot',
        'requestedAmount',
        'finalAmount',
        'counterpartDisplayName',
        'respondDueAt',
        'serverNow',
        'paymentMethodLabel',
        'attemptCount',
        'retryUntil',
        'shippingAddress',
      ].sort(),
    )
  })
})
