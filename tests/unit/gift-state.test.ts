// @vitest-environment node
/**
 * T014 — lib/gift/state.ts 단위 테스트 (구현 T015 보다 먼저 — constitution 원칙 II)
 *
 * 계약: specs/003-gift-request-payment/research.md R6 (전이 표) · R3 (지연 만료)
 *  - 허용 화살표 7개만 통과한다. 나머지 (자기 자신 포함) 전부 거부 — 전수 검사
 *  - `shouldExpire`: PENDING 이고 respondDueAt < now 일 때만 참 (R3 원문 그대로)
 *  - `transitionGiftRequest`: 조건부 UPDATE (where 에 from 상태) — R2 와 같은 원자성.
 *    종착 상태로 갈 때 종착 시각(paidAt·expiredAt·cancelledAt)을 함수가 채운다
 *  - `evaluateExpiry`: 만료 확정을 기록하는 바로 그 트랜잭션에서 GIFT_EXPIRED 알림 생성 (R3).
 *    0행(경합 패배)이면 알림 없이 현재 상태를 다시 읽는다
 *
 * prisma 는 mock — DB 왕복 없이 호출 형태를 검증한다 (M2 dal-invite.test.ts 패턴).
 * 제약·실 DB 검증은 ① 세션의 tests/integration/gift-constraints.test.ts 몫이다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  giftUpdateMany: vi.fn(),
  giftFindUnique: vi.fn(),
  notificationCreate: vi.fn(),
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    giftRequest: { updateMany: h.giftUpdateMany, findUnique: h.giftFindUnique },
    notification: { create: h.notificationCreate },
    $transaction: h.$transaction,
  },
}))

import {
  GIFT_STATUSES,
  InvalidGiftTransitionError,
  canTransition,
  assertTransition,
  shouldExpire,
  transitionGiftRequest,
  evaluateExpiry,
} from '@/lib/gift/state'

const NOW = new Date('2026-08-31T12:00:00.000Z')
const MIN = 60_000
const at = (delta: number) => new Date(NOW.getTime() + delta)

const GIFT_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const GIVER_ID = 'a1b2c3d4-0000-4000-8000-0000000000aa'

/** R6 표의 허용 화살표 전부 — 이 7개 외에는 존재하지 않는다 */
const ALLOWED: Array<[string, string]> = [
  ['PENDING', 'PAYING'], // 승인 · 대안 확정 (R2 잠금)
  ['PENDING', 'EXPIRED'], // 지연 평가 (R3)
  ['PENDING', 'CANCELLED'], // 주는 사람 취소
  ['PAYING', 'PAID'], // 결제 성공
  ['PAYING', 'PAYMENT_FAILED'], // 결제 실패
  ['PAYMENT_FAILED', 'PAYING'], // 재시도 (R2 재잠금)
  ['PAYMENT_FAILED', 'CANCELLED'], // 횟수·기한 초과
]

const isAllowed = (from: string, to: string) => ALLOWED.some(([f, t]) => f === from && t === to)

function pendingGift(overrides: Record<string, unknown> = {}) {
  return {
    id: GIFT_ID,
    status: 'PENDING' as const,
    respondDueAt: at(-1 * MIN),
    giverId: GIVER_ID,
    receiverDisplayName: '김민수',
    requestedAmount: 32000,
    productSnapshot: { name: '핸드크림 세트', imageUrl: null, price: 32000 },
    expiredAt: null as Date | null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // $transaction(fn) 은 tx 로 같은 mock 델리게이트를 넘긴다 — 같은 트랜잭션 검증이 목적
  h.$transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        giftRequest: { updateMany: h.giftUpdateMany, findUnique: h.giftFindUnique },
        notification: { create: h.notificationCreate },
      }),
  )
  h.giftUpdateMany.mockResolvedValue({ count: 1 })
})

describe('canTransition — R6 표 전수', () => {
  it('상태는 정확히 6종이다 (DECLINED 없음 — FR-020)', () => {
    expect([...GIFT_STATUSES].sort()).toEqual(
      ['CANCELLED', 'EXPIRED', 'PAID', 'PAYING', 'PAYMENT_FAILED', 'PENDING'].sort(),
    )
    expect(GIFT_STATUSES).not.toContain('DECLINED')
  })

  // 6×6 = 36 조합 전수 — 허용 7개만 true, 자기 자신 전이 포함 나머지 29개 false
  for (const from of ['PENDING', 'PAYING', 'PAID', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED']) {
    for (const to of ['PENDING', 'PAYING', 'PAID', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED']) {
      const expected = isAllowed(from, to)
      it(`${from} → ${to} = ${expected ? '허용' : '거부'}`, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(canTransition(from as any, to as any)).toBe(expected)
      })
    }
  }
})

describe('assertTransition', () => {
  it('허용 화살표는 조용히 통과한다', () => {
    for (const [from, to] of ALLOWED) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => assertTransition(from as any, to as any)).not.toThrow()
    }
  })

  it('금지 화살표는 InvalidGiftTransitionError — 어떤 전이였는지 메시지에 남는다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => assertTransition('PAID' as any, 'PENDING' as any)).toThrow(
      InvalidGiftTransitionError,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => assertTransition('EXPIRED' as any, 'PAYING' as any)).toThrow(/EXPIRED.*PAYING/)
  })
})

describe('shouldExpire — R3 판정 (respondDueAt < now 이고 PENDING 일 때만)', () => {
  it('PENDING + 기한 경과 → 참', () => {
    expect(shouldExpire(pendingGift(), NOW)).toBe(true)
  })

  it('PENDING + 기한 전 → 거짓', () => {
    expect(shouldExpire(pendingGift({ respondDueAt: at(+1 * MIN) }), NOW)).toBe(false)
  })

  it('기한 정각(===) → 거짓 — R3 원문이 엄격 미만(<)이다', () => {
    expect(shouldExpire(pendingGift({ respondDueAt: NOW }), NOW)).toBe(false)
  })

  it.each(['PAYING', 'PAID', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED'])(
    '%s 는 기한이 지나도 만료 판정하지 않는다 — 만료는 PENDING 에서만 (R6)',
    (status) => {
      expect(shouldExpire(pendingGift({ status }), NOW)).toBe(false)
    },
  )
})

describe('transitionGiftRequest — 조건부 UPDATE 단일 관문', () => {
  it('where 에 from 상태를 넣는다 — 검사와 갱신 사이 경합이 없다 (R2 원자성)', async () => {
    const result = await transitionGiftRequest(GIFT_ID, 'PENDING', 'PAYING', {
      data: { resolution: 'APPROVED', resolvedAt: NOW },
    })

    expect(result).toEqual({ transitioned: true })
    expect(h.giftUpdateMany).toHaveBeenCalledTimes(1)
    expect(h.giftUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: GIFT_ID, status: 'PENDING' },
      data: { status: 'PAYING', resolution: 'APPROVED', resolvedAt: NOW },
    })
  })

  it('0행이면 transitioned: false — 이미 다른 시도가 지나갔다', async () => {
    h.giftUpdateMany.mockResolvedValue({ count: 0 })

    await expect(transitionGiftRequest(GIFT_ID, 'PENDING', 'PAYING')).resolves.toEqual({
      transitioned: false,
    })
  })

  it.each([
    ['PAID', 'paidAt'],
    ['EXPIRED', 'expiredAt'],
    ['CANCELLED', 'cancelledAt'],
  ] as const)('종착 %s 로 가면 %s 를 함수가 채운다', async (to, field) => {
    const from = to === 'PAID' ? 'PAYING' : 'PENDING'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await transitionGiftRequest(GIFT_ID, from as any, to as any, { now: NOW })

    const data = h.giftUpdateMany.mock.calls[0][0].data
    expect(data.status).toBe(to)
    expect(data[field]).toEqual(NOW)
  })

  it('금지 화살표는 DB 를 건드리기 전에 던진다', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transitionGiftRequest(GIFT_ID, 'EXPIRED' as any, 'PAYING' as any),
    ).rejects.toThrow(InvalidGiftTransitionError)
    expect(h.giftUpdateMany).not.toHaveBeenCalled()
  })

  it('tx 를 받으면 그 클라이언트로 실행한다 — 호출자의 트랜잭션에 참여', async () => {
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const tx = { giftRequest: { updateMany: txUpdateMany } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await transitionGiftRequest(GIFT_ID, 'PAYING', 'PAID', { db: tx as any, now: NOW })

    expect(txUpdateMany).toHaveBeenCalledTimes(1)
    expect(h.giftUpdateMany).not.toHaveBeenCalled()
  })
})

describe('evaluateExpiry — 만료 확정 + 같은 트랜잭션에서 GIFT_EXPIRED 알림 (R3)', () => {
  it('기한 경과 PENDING 은 EXPIRED 로 기록하고 giver 에게 알림을 만든다', async () => {
    const gift = pendingGift()

    const result = await evaluateExpiry(gift, NOW)

    // 같은 트랜잭션 — $transaction 한 번 안에서 UPDATE 와 알림 생성이 모두 일어난다
    expect(h.$transaction).toHaveBeenCalledTimes(1)
    expect(h.giftUpdateMany).toHaveBeenCalledTimes(1)
    expect(h.giftUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: GIFT_ID, status: 'PENDING' },
      data: { status: 'EXPIRED', expiredAt: NOW },
    })
    expect(h.notificationCreate).toHaveBeenCalledTimes(1)
    expect(h.notificationCreate.mock.calls[0][0]).toEqual({
      data: {
        userId: GIVER_ID, // 받는 사람은 주는 사람이다 (data-model 알림 표)
        type: 'GIFT_EXPIRED',
        payload: {
          giftRequestId: GIFT_ID,
          counterpartDisplayName: '김민수',
          productName: '핸드크림 세트',
          amount: 32000,
        },
      },
    })
    expect(result.status).toBe('EXPIRED')
    expect(result.expiredAt).toEqual(NOW)
  })

  it('기한 전이면 아무것도 하지 않고 그대로 돌려준다', async () => {
    const gift = pendingGift({ respondDueAt: at(+3 * MIN) })

    const result = await evaluateExpiry(gift, NOW)

    expect(result).toBe(gift)
    expect(h.$transaction).not.toHaveBeenCalled()
    expect(h.notificationCreate).not.toHaveBeenCalled()
  })

  it.each(['PAYING', 'PAID', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED'])(
    '%s 상태는 판정 대상이 아니다 — DB 왕복 자체가 없다',
    async (status) => {
      const gift = pendingGift({ status })

      const result = await evaluateExpiry(gift, NOW)

      expect(result).toBe(gift)
      expect(h.$transaction).not.toHaveBeenCalled()
    },
  )

  it('경합 패배(0행)면 알림 없이 현재 상태를 다시 읽어 돌려준다 — 이중 알림 금지', async () => {
    h.giftUpdateMany.mockResolvedValue({ count: 0 })
    h.giftFindUnique.mockResolvedValue({
      status: 'PAYING',
      resolution: 'APPROVED',
      expiredAt: null,
      cancelledAt: null,
      paidAt: null,
    })

    const result = await evaluateExpiry(pendingGift(), NOW)

    expect(h.notificationCreate).not.toHaveBeenCalled()
    expect(result.status).toBe('PAYING')
  })

  it('productSnapshot 형태가 깨져도 만료 기록은 막히지 않는다 — 표시값만 대체', async () => {
    const gift = pendingGift({ productSnapshot: { broken: true } })

    const result = await evaluateExpiry(gift, NOW)

    expect(result.status).toBe('EXPIRED')
    expect(h.notificationCreate).toHaveBeenCalledTimes(1)
    const payload = h.notificationCreate.mock.calls[0][0].data.payload
    expect(typeof payload.productName).toBe('string')
    expect(payload.giftRequestId).toBe(GIFT_ID)
  })
})
