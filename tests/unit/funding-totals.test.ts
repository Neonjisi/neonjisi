// @vitest-environment node
/**
 * T009 — lib/funding/totals.ts 단위 테스트 (구현 T010 보다 먼저 — constitution 원칙 II)
 * 계약: specs/004-group-funding/contracts/server-actions.md §1 (R3)
 *
 *  - `paidTotal`: PAID 상태만 합산 (판정·진행바)
 *  - `capTotal`: RESERVED + PAID 를 합산 (잔여 캡) — REFUNDED 는 어느 쪽에도 들어가지 않는다
 *  - **다른 파일에서 참여 금액을 직접 합산하지 않는다** — 이 모듈이 유일한 합산 지점이다.
 *
 * 계약 시그니처가 `paidTotal(tx, fundingId)` 로 tx 를 먼저 받는다 — ④의 FOR UPDATE 트랜잭션
 * 안에서도, 트랜잭션 밖(DAL)에서도 같은 함수를 쓰기 위해서다. 여기서는 실 DB aggregate 를
 * 흉내 낸 fake tx 로 where 절이 실제로 상태를 가른다는 것까지 검증한다 — where 절이 빠지거나
 * 잘못되면(예: 필터 없이 전부 합산) 이 fake 가 그대로 잡아낸다(섞이면 실패).
 */
import { describe, expect, it } from 'vitest'
import { paidTotal, capTotal } from '@/lib/funding/totals'

const FUNDING_A = 'a1b2c3d4-0000-4000-8000-00000000000a'
const FUNDING_B = 'a1b2c3d4-0000-4000-8000-00000000000b'

type Row = { fundingId: string; amount: number; status: 'RESERVED' | 'PAID' | 'REFUNDED' }

/** A: PAID 2건(3만) + RESERVED 1건(5천) + REFUNDED 1건(3천) / B: 별도 펀딩 — 섞이면 안 된다 */
const ROWS: Row[] = [
  { fundingId: FUNDING_A, amount: 10_000, status: 'PAID' },
  { fundingId: FUNDING_A, amount: 20_000, status: 'PAID' },
  { fundingId: FUNDING_A, amount: 5_000, status: 'RESERVED' },
  { fundingId: FUNDING_A, amount: 3_000, status: 'REFUNDED' },
  { fundingId: FUNDING_B, amount: 999_999, status: 'PAID' },
]

type AggregateArgs = { where: { fundingId: string; status: unknown } }

/** prisma.fundingContribution.aggregate 를 흉내 낸다 — where 절 그대로 필터링한다 */
function fakeTx(rows: Row[] = ROWS) {
  return {
    fundingContribution: {
      aggregate: async ({ where }: AggregateArgs) => {
        const matchesStatus = (status: Row['status']) => {
          if (typeof where.status === 'string') return status === where.status
          if (where.status && typeof where.status === 'object' && 'in' in where.status) {
            return (where.status as { in: string[] }).in.includes(status)
          }
          return true // 상태 필터가 아예 없다 — 잘못된 구현이면 이 분기로 빠져 값이 부풀어 실패한다
        }
        const sum = rows
          .filter((r) => r.fundingId === where.fundingId && matchesStatus(r.status))
          .reduce((s, r) => s + r.amount, 0)
        return { _sum: { amount: sum || null } }
      },
    },
  }
}

describe('paidTotal — PAID 만 (판정·진행바, R3)', () => {
  it('PAID 두 건만 합산한다 — RESERVED·REFUNDED·다른 펀딩은 섞이지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(paidTotal(fakeTx() as any, FUNDING_A)).resolves.toBe(30_000)
  })

  it('PAID 가 없으면 0을 돌려준다 — RESERVED 만 있는 펀딩', async () => {
    const rows: Row[] = [{ fundingId: FUNDING_A, amount: 5_000, status: 'RESERVED' }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(paidTotal(fakeTx(rows) as any, FUNDING_A)).resolves.toBe(0)
  })

  it('where 에 status: "PAID" 를 정확히 넘긴다', async () => {
    let capturedWhere: unknown
    const tx = {
      fundingContribution: {
        aggregate: async ({ where }: { where: unknown }) => {
          capturedWhere = where
          return { _sum: { amount: 0 } }
        },
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await paidTotal(tx as any, FUNDING_A)
    expect(capturedWhere).toEqual({ fundingId: FUNDING_A, status: 'PAID' })
  })
})

describe('capTotal — RESERVED + PAID (잔여 캡, R3)', () => {
  it('RESERVED + PAID 를 합산한다 — REFUNDED·다른 펀딩은 섞이지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(capTotal(fakeTx() as any, FUNDING_A)).resolves.toBe(35_000)
  })

  it('아무 참여도 없으면 0을 돌려준다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(capTotal(fakeTx([]) as any, FUNDING_A)).resolves.toBe(0)
  })

  it('where 에 status: { in: ["RESERVED","PAID"] } 를 넘긴다', async () => {
    let capturedWhere: unknown
    const tx = {
      fundingContribution: {
        aggregate: async ({ where }: { where: unknown }) => {
          capturedWhere = where
          return { _sum: { amount: 0 } }
        },
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await capTotal(tx as any, FUNDING_A)
    expect(capturedWhere).toEqual({
      fundingId: FUNDING_A,
      status: { in: ['RESERVED', 'PAID'] },
    })
  })
})

describe('paidTotal vs capTotal — 섞이면 실패하는 케이스', () => {
  it('RESERVED 만 있는 펀딩은 paidTotal=0, capTotal=amount — 둘이 같으면 회귀다', async () => {
    const rows: Row[] = [{ fundingId: FUNDING_A, amount: 7_000, status: 'RESERVED' }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paid = await paidTotal(fakeTx(rows) as any, FUNDING_A)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = await capTotal(fakeTx(rows) as any, FUNDING_A)
    expect(paid).toBe(0)
    expect(cap).toBe(7_000)
    expect(paid).not.toBe(cap)
  })

  it('REFUNDED 만 있는 펀딩은 둘 다 0 — 환불분은 어느 합산에도 남지 않는다', async () => {
    const rows: Row[] = [{ fundingId: FUNDING_A, amount: 9_000, status: 'REFUNDED' }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paid = await paidTotal(fakeTx(rows) as any, FUNDING_A)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = await capTotal(fakeTx(rows) as any, FUNDING_A)
    expect(paid).toBe(0)
    expect(cap).toBe(0)
  })
})
