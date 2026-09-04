// @vitest-environment node
/**
 * T011 — lib/funding/state.ts 단위 테스트 (구현 T012 보다 먼저 — constitution 원칙 II)
 * 계약: specs/004-group-funding/data-model.md "상태 전이" 표 · research R1(정산 트리거) ·
 * R2(예약 만료 지연 해제)
 *
 *  - Funding: OPEN→{SUCCEEDED,FAILED,CANCELLED} · SUCCEEDED→{SETTLED,CANCELLED} 만 허용.
 *    나머지(자기 자신 포함)는 전부 거부 — 전수 검사
 *  - Contribution: RESERVED→PAID · PAID→REFUNDED 만 허용. 나머지 전부 거부 — 전수 검사
 *  - `shouldSettle`: 마감 지난 OPEN, 그리고 차액 재시도 기한이 지난 SUCCEEDED 일 때 참 (R1 트리거 판정)
 *  - `isReservationExpired`: status=RESERVED 이고 reservedUntil < now 일 때만 참 (R2 판정)
 *  - `transitionFunding`/`transitionContribution`: 조건부 UPDATE(where 에 from 상태) —
 *    검사와 갱신 사이 경합이 없다. 종착 상태로 갈 때 종착 시각을 함수가 채운다
 *  - `evaluateReservationExpiry`: 만료된 RESERVED 를 fundingId 단위로 일괄 해제(DELETE)한다 —
 *    ContributionStatus 에는 EXPIRED 값이 없으므로 "해제"는 행 삭제다(data-model "행 해제")
 *
 * prisma 는 mock — DB 왕복 없이 호출 형태를 검증한다 (M3 gift-state.test.ts 패턴).
 * 제약·실 DB 검증은 ① 세션의 tests/integration/funding-constraints.test.ts 몫이다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  fundingUpdateMany: vi.fn(),
  contributionUpdateMany: vi.fn(),
  contributionDeleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    funding: { updateMany: h.fundingUpdateMany },
    fundingContribution: {
      updateMany: h.contributionUpdateMany,
      deleteMany: h.contributionDeleteMany,
    },
  },
}))

import {
  FUNDING_STATUSES,
  InvalidFundingTransitionError,
  canTransitionFunding,
  assertTransitionFunding,
  transitionFunding,
  shouldSettle,
  CONTRIBUTION_STATUSES,
  InvalidContributionTransitionError,
  canTransitionContribution,
  assertTransitionContribution,
  transitionContribution,
  isReservationExpired,
  evaluateReservationExpiry,
} from '@/lib/funding/state'

const NOW = new Date('2026-08-31T12:00:00.000Z')
const MIN = 60_000
const at = (delta: number) => new Date(NOW.getTime() + delta)

const FUNDING_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const CONTRIBUTION_ID = 'a1b2c3d4-0000-4000-8000-000000000002'

const ALL_FUNDING_STATUSES = ['OPEN', 'SUCCEEDED', 'SETTLED', 'FAILED', 'CANCELLED'] as const
const ALLOWED_FUNDING: Array<[string, string]> = [
  ['OPEN', 'SUCCEEDED'], // 정산: paid합 ≥ min (마감/조기)
  ['OPEN', 'FAILED'], // 정산: paid합 < min (마감)
  ['OPEN', 'CANCELLED'], // 주최자 취소
  ['SUCCEEDED', 'SETTLED'], // 차액 결제 완료·불필요
  ['SUCCEEDED', 'CANCELLED'], // topup 상한 초과 (R5)
]
const isAllowedFunding = (from: string, to: string) =>
  ALLOWED_FUNDING.some(([f, t]) => f === from && t === to)

const ALL_CONTRIBUTION_STATUSES = ['RESERVED', 'PAID', 'REFUNDED'] as const
const ALLOWED_CONTRIBUTION: Array<[string, string]> = [
  ['RESERVED', 'PAID'], // 결제 성공
  ['PAID', 'REFUNDED'], // 환불 실행
]
const isAllowedContribution = (from: string, to: string) =>
  ALLOWED_CONTRIBUTION.some(([f, t]) => f === from && t === to)

beforeEach(() => {
  vi.clearAllMocks()
  h.fundingUpdateMany.mockResolvedValue({ count: 1 })
  h.contributionUpdateMany.mockResolvedValue({ count: 1 })
  h.contributionDeleteMany.mockResolvedValue({ count: 0 })
})

describe('Funding — canTransitionFunding 전수', () => {
  it('상태는 정확히 5종이다', () => {
    expect([...FUNDING_STATUSES].sort()).toEqual([...ALL_FUNDING_STATUSES].sort())
  })

  // 5×5 = 25 조합 전수 — 허용 5개만 true
  for (const from of ALL_FUNDING_STATUSES) {
    for (const to of ALL_FUNDING_STATUSES) {
      const expected = isAllowedFunding(from, to)
      it(`${from} → ${to} = ${expected ? '허용' : '거부'}`, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(canTransitionFunding(from as any, to as any)).toBe(expected)
      })
    }
  }
})

describe('assertTransitionFunding', () => {
  it('허용 화살표는 조용히 통과한다', () => {
    for (const [from, to] of ALLOWED_FUNDING) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => assertTransitionFunding(from as any, to as any)).not.toThrow()
    }
  })

  it('금지 화살표는 InvalidFundingTransitionError — 어떤 전이였는지 메시지에 남는다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => assertTransitionFunding('SETTLED' as any, 'OPEN' as any)).toThrow(
      InvalidFundingTransitionError,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => assertTransitionFunding('FAILED' as any, 'SUCCEEDED' as any)).toThrow(
      /FAILED.*SUCCEEDED/,
    )
  })

  it('SUCCEEDED → FAILED 는 거부된다 — 다이어그램 밖 화살표', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => assertTransitionFunding('SUCCEEDED' as any, 'FAILED' as any)).toThrow(
      InvalidFundingTransitionError,
    )
  })
})

describe('transitionFunding — 조건부 UPDATE 단일 관문 (R1 잠금과 같은 원자성)', () => {
  it('where 에 from 상태를 넣는다 — 검사와 갱신 사이 경합이 없다', async () => {
    const result = await transitionFunding(FUNDING_ID, 'OPEN', 'SUCCEEDED')

    expect(result).toEqual({ transitioned: true })
    expect(h.fundingUpdateMany).toHaveBeenCalledTimes(1)
    expect(h.fundingUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: FUNDING_ID, status: 'OPEN' },
      data: { status: 'SUCCEEDED' },
    })
  })

  it('0행이면 transitioned: false — 다른 조회가 이미 정산 중 (R1 멱등 잠금)', async () => {
    h.fundingUpdateMany.mockResolvedValue({ count: 0 })

    await expect(transitionFunding(FUNDING_ID, 'OPEN', 'FAILED')).resolves.toEqual({
      transitioned: false,
    })
  })

  it.each([
    ['SETTLED', 'settledAt'],
    ['FAILED', 'failedAt'],
    ['CANCELLED', 'cancelledAt'],
  ] as const)('종착 %s 로 가면 %s 를 함수가 채운다', async (to, field) => {
    const from = to === 'SETTLED' ? 'SUCCEEDED' : 'OPEN'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await transitionFunding(FUNDING_ID, from as any, to as any, { now: NOW })

    const data = h.fundingUpdateMany.mock.calls[0][0].data
    expect(data.status).toBe(to)
    expect(data[field]).toEqual(NOW)
  })

  it('SUCCEEDED 는 전용 시각 컬럼이 없다 — status 만 바뀐다', async () => {
    await transitionFunding(FUNDING_ID, 'OPEN', 'SUCCEEDED', { now: NOW })
    const data = h.fundingUpdateMany.mock.calls[0][0].data
    expect(data).toEqual({ status: 'SUCCEEDED' })
  })

  it('금지 화살표는 DB 를 건드리기 전에 던진다', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transitionFunding(FUNDING_ID, 'SETTLED' as any, 'OPEN' as any),
    ).rejects.toThrow(InvalidFundingTransitionError)
    expect(h.fundingUpdateMany).not.toHaveBeenCalled()
  })

  it('opts.data 를 함께 얹는다 (예: topupAttemptCount)', async () => {
    await transitionFunding(FUNDING_ID, 'SUCCEEDED', 'CANCELLED', {
      data: { topupAttemptCount: 3 },
      now: NOW,
    })
    expect(h.fundingUpdateMany.mock.calls[0][0].data).toEqual({
      status: 'CANCELLED',
      cancelledAt: NOW,
      topupAttemptCount: 3,
    })
  })

  it('tx 를 받으면 그 클라이언트로 실행한다 — 호출자의 트랜잭션에 참여', async () => {
    const txUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const tx = { funding: { updateMany: txUpdateMany } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await transitionFunding(FUNDING_ID, 'OPEN', 'SUCCEEDED', { db: tx as any })

    expect(txUpdateMany).toHaveBeenCalledTimes(1)
    expect(h.fundingUpdateMany).not.toHaveBeenCalled()
  })
})

describe('shouldSettle — R1 트리거 판정 (마감 지난 OPEN · 재시도 기한 지난 SUCCEEDED)', () => {
  it('OPEN + 마감 경과 → 참', () => {
    expect(shouldSettle({ status: 'OPEN', deadline: at(-1 * MIN) }, NOW)).toBe(true)
  })

  it('OPEN + 마감 전 → 거짓', () => {
    expect(shouldSettle({ status: 'OPEN', deadline: at(+1 * MIN) }, NOW)).toBe(false)
  })

  it('마감 정각(===) → 거짓 — 엄격 미만(<)', () => {
    expect(shouldSettle({ status: 'OPEN', deadline: NOW }, NOW)).toBe(false)
  })

  it.each(['SUCCEEDED', 'SETTLED', 'FAILED', 'CANCELLED'])(
    '%s 는 마감이 지나도 트리거하지 않는다 — deadline 은 OPEN 에서만 본다',
    (status) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(shouldSettle({ status: status as any, deadline: at(-1 * MIN) }, NOW)).toBe(false)
    },
  )

  // 차액 재시도 기한이 지난 SUCCEEDED 도 트리거다 (contracts §2 "후속(J)"). settle.ts 는 이미
  // isExhausted 로 지연 취소·전액 환불을 확정한다 — 트리거가 없으면 주최자가 재시도를 누를
  // 때까지 아무 조회도 settle 을 부르지 않아 참여자 돈이 SUCCEEDED 로 묶인다.
  it('SUCCEEDED + 재시도 기한 경과 → 참 — 어느 조회든 지연 취소를 확정시킨다', () => {
    expect(
      shouldSettle({ status: 'SUCCEEDED', deadline: at(-1 * MIN), topupRetryUntil: at(-1 * MIN) }, NOW),
    ).toBe(true)
  })

  it('SUCCEEDED + 재시도 기한 남음 → 거짓 — 주최자가 아직 재시도할 수 있다', () => {
    expect(
      shouldSettle({ status: 'SUCCEEDED', deadline: at(-1 * MIN), topupRetryUntil: at(+1 * MIN) }, NOW),
    ).toBe(false)
  })

  it('재시도 기한 정각(===) → 거짓 — settle.ts isExhausted 와 같은 엄격 초과(>)', () => {
    expect(
      shouldSettle({ status: 'SUCCEEDED', deadline: at(-1 * MIN), topupRetryUntil: NOW }, NOW),
    ).toBe(false)
  })

  it('SUCCEEDED + topupRetryUntil = null → 거짓 — 기한이 없으면 지연 취소 대상이 아니다', () => {
    expect(
      shouldSettle({ status: 'SUCCEEDED', deadline: at(-1 * MIN), topupRetryUntil: null }, NOW),
    ).toBe(false)
  })

  it.each(['OPEN', 'SETTLED', 'FAILED', 'CANCELLED'])(
    '%s 는 재시도 기한이 지나도 트리거하지 않는다 — topupRetryUntil 은 SUCCEEDED 에서만 본다',
    (status) => {
      expect(
        shouldSettle(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { status: status as any, deadline: at(+1 * MIN), topupRetryUntil: at(-1 * MIN) },
          NOW,
        ),
      ).toBe(false)
    },
  )
})

describe('Contribution — canTransitionContribution 전수', () => {
  it('상태는 정확히 3종이다', () => {
    expect([...CONTRIBUTION_STATUSES].sort()).toEqual([...ALL_CONTRIBUTION_STATUSES].sort())
  })

  // 3×3 = 9 조합 전수 — 허용 2개만 true
  for (const from of ALL_CONTRIBUTION_STATUSES) {
    for (const to of ALL_CONTRIBUTION_STATUSES) {
      const expected = isAllowedContribution(from, to)
      it(`${from} → ${to} = ${expected ? '허용' : '거부'}`, () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(canTransitionContribution(from as any, to as any)).toBe(expected)
      })
    }
  }
})

describe('assertTransitionContribution', () => {
  it('허용 화살표는 조용히 통과한다', () => {
    for (const [from, to] of ALLOWED_CONTRIBUTION) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => assertTransitionContribution(from as any, to as any)).not.toThrow()
    }
  })

  it('RESERVED → REFUNDED 는 거부된다 — PAID 를 거치지 않은 환불은 없다', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assertTransitionContribution('RESERVED' as any, 'REFUNDED' as any),
    ).toThrow(InvalidContributionTransitionError)
  })
})

describe('transitionContribution — 조건부 UPDATE 단일 관문', () => {
  it('where 에 from 상태를 넣는다', async () => {
    const result = await transitionContribution(CONTRIBUTION_ID, 'RESERVED', 'PAID', { now: NOW })

    expect(result).toEqual({ transitioned: true })
    expect(h.contributionUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: CONTRIBUTION_ID, status: 'RESERVED' },
      data: { status: 'PAID', paidAt: NOW },
    })
  })

  it('0행이면 transitioned: false', async () => {
    h.contributionUpdateMany.mockResolvedValue({ count: 0 })
    await expect(transitionContribution(CONTRIBUTION_ID, 'PAID', 'REFUNDED')).resolves.toEqual({
      transitioned: false,
    })
  })

  it('PAID → REFUNDED 는 refundedAt 을 채운다', async () => {
    await transitionContribution(CONTRIBUTION_ID, 'PAID', 'REFUNDED', { now: NOW })
    const data = h.contributionUpdateMany.mock.calls[0][0].data
    expect(data).toEqual({ status: 'REFUNDED', refundedAt: NOW })
  })

  it('금지 화살표는 DB 를 건드리기 전에 던진다', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transitionContribution(CONTRIBUTION_ID, 'REFUNDED' as any, 'PAID' as any),
    ).rejects.toThrow(InvalidContributionTransitionError)
    expect(h.contributionUpdateMany).not.toHaveBeenCalled()
  })
})

describe('isReservationExpired — R2 판정 (status=RESERVED 이고 reservedUntil < now 일 때만)', () => {
  it('RESERVED + 기한 경과 → 참', () => {
    expect(isReservationExpired({ status: 'RESERVED', reservedUntil: at(-1 * MIN) }, NOW)).toBe(
      true,
    )
  })

  it('RESERVED + 기한 전 → 거짓', () => {
    expect(isReservationExpired({ status: 'RESERVED', reservedUntil: at(+1 * MIN) }, NOW)).toBe(
      false,
    )
  })

  it('기한 정각(===) → 거짓', () => {
    expect(isReservationExpired({ status: 'RESERVED', reservedUntil: NOW }, NOW)).toBe(false)
  })

  it.each(['PAID', 'REFUNDED'])('%s 는 기한이 지나도 만료 판정하지 않는다', (status) => {
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isReservationExpired({ status: status as any, reservedUntil: at(-1 * MIN) }, NOW),
    ).toBe(false)
  })
})

describe('evaluateReservationExpiry — 지연 해제 (R2, cron 없음)', () => {
  it('fundingId 단위로 만료된 RESERVED 를 일괄 삭제한다 — ContributionStatus 에 EXPIRED 값이 없다', async () => {
    h.contributionDeleteMany.mockResolvedValue({ count: 2 })

    const result = await evaluateReservationExpiry(FUNDING_ID, NOW)

    expect(result).toEqual({ releasedCount: 2 })
    expect(h.contributionDeleteMany).toHaveBeenCalledTimes(1)
    expect(h.contributionDeleteMany.mock.calls[0][0]).toEqual({
      where: { fundingId: FUNDING_ID, status: 'RESERVED', reservedUntil: { lt: NOW } },
    })
  })

  it('만료된 예약이 없으면 releasedCount: 0', async () => {
    h.contributionDeleteMany.mockResolvedValue({ count: 0 })
    await expect(evaluateReservationExpiry(FUNDING_ID, NOW)).resolves.toEqual({
      releasedCount: 0,
    })
  })

  it('now 를 생략하면 현재 시각을 쓴다', async () => {
    await evaluateReservationExpiry(FUNDING_ID)
    const where = h.contributionDeleteMany.mock.calls[0][0].where
    expect(where.reservedUntil.lt).toBeInstanceOf(Date)
  })

  it('db 를 받으면 그 클라이언트로 실행한다 — 호출자의 트랜잭션에 참여', async () => {
    const txDeleteMany = vi.fn().mockResolvedValue({ count: 1 })
    const tx = { fundingContribution: { deleteMany: txDeleteMany } }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await evaluateReservationExpiry(FUNDING_ID, NOW, tx as any)

    expect(txDeleteMany).toHaveBeenCalledTimes(1)
    expect(h.contributionDeleteMany).not.toHaveBeenCalled()
  })
})
