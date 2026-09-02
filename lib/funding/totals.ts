import type { Prisma } from '@prisma/client'

/**
 * 총액 단일 모듈 (T010) — 계약: specs/004-group-funding/contracts/server-actions.md §1 (R3)
 *
 * `paidTotal`(PAID 만 — 판정·진행바) · `capTotal`(RESERVED+PAID — 잔여 캡) 두 함수만 둔다.
 * **다른 파일에서 참여 금액을 직접 합산하지 않는다** — M4 신규 리뷰 규칙 3, 리뷰 체크 항목.
 *
 * 판정에 RESERVED 를 넣으면 결제 안 될 수도 있는 돈으로 성사를 선언하게 되고, 캡에서
 * RESERVED 를 빼면 동시 참여가 목표를 넘긴다(research R3) — 두 정의를 한 곳에 가둔다.
 *
 * `tx` 를 첫 인자로 받는다(계약 시그니처 고정). FOR UPDATE 트랜잭션 안에서 잔여를 확인할
 * 때(④ contributeToFunding, R2)도, 트랜잭션 밖에서 진행바·정산 판정을 읽을 때(DAL T016,
 * settle T014)도 같은 함수를 쓴다 — 전역 `prisma` 든 `tx` 든 델리게이트 모양만 맞으면 된다.
 */

type FundingContributionReadClient = Pick<Prisma.TransactionClient, 'fundingContribution'>

/** PAID 만 합산 — 판정(성사 여부)·진행바 표기 (R3) */
export async function paidTotal(
  tx: FundingContributionReadClient,
  fundingId: string,
): Promise<number> {
  const result = await tx.fundingContribution.aggregate({
    where: { fundingId, status: 'PAID' },
    _sum: { amount: true },
  })
  return result._sum.amount ?? 0
}

/** RESERVED + PAID 합산 — 잔여 캡(goalAmount − capTotal) 계산용 (R3) */
export async function capTotal(
  tx: FundingContributionReadClient,
  fundingId: string,
): Promise<number> {
  const result = await tx.fundingContribution.aggregate({
    where: { fundingId, status: { in: ['RESERVED', 'PAID'] } },
    _sum: { amount: true },
  })
  return result._sum.amount ?? 0
}
