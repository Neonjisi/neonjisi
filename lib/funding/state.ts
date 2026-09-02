import type { ContributionStatus, FundingStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * 펀딩 상태 전이 + 예약 만료 단일 모듈 (T012) — 계약: specs/004-group-funding/data-model.md
 * "상태 전이" 표 · research R1(정산 트리거) · R2(예약 만료 지연 해제)
 *
 * 허용 화살표는 아래 두 표가 전부다. 이 모듈 밖에서 `Funding.status`·`FundingContribution.status`
 * 를 UPDATE 하지 않는다 — 전이가 파일마다 흩어지면 "정산 두 번" 같은 조합 버그가 파일 경계에서
 * 샌다. 정산의 실제 소유(환불·차액·알림)는 `lib/funding/settle.ts`(D, T014) 다 — 이 모듈은
 * 상태값 자체의 화살표 규칙과 조건부 UPDATE 관문만 쥔다(M3 `lib/gift/state.ts`와 같은 자리).
 */

// ── Funding FSM ──────────────────────────────────────────────────────────────

/** data-model "상태 전이" 표 — from → 허용되는 to. 여기 없는 전이는 전부 거부한다 */
const FUNDING_TRANSITIONS = {
  OPEN: ['SUCCEEDED', 'FAILED', 'CANCELLED'], // 정산: paid합 ≥/< min (R1) · 주최자 취소
  SUCCEEDED: ['SETTLED', 'CANCELLED'], // 차액 완료·불필요 / topup 상한 초과 (R5)
  SETTLED: [], // 종착
  FAILED: [], // 종착
  CANCELLED: [], // 종착
} as const satisfies Record<FundingStatus, readonly FundingStatus[]>

export const FUNDING_STATUSES = Object.keys(FUNDING_TRANSITIONS) as readonly FundingStatus[]

export class InvalidFundingTransitionError extends Error {
  constructor(from: FundingStatus, to: FundingStatus) {
    super(`허용되지 않는 펀딩 상태 전이: ${from} → ${to} (data-model 상태 전이 표 밖)`)
    this.name = 'InvalidFundingTransitionError'
  }
}

export function canTransitionFunding(from: FundingStatus, to: FundingStatus): boolean {
  return (FUNDING_TRANSITIONS[from] as readonly FundingStatus[]).includes(to)
}

export function assertTransitionFunding(from: FundingStatus, to: FundingStatus): void {
  if (!canTransitionFunding(from, to)) throw new InvalidFundingTransitionError(from, to)
}

/** 종착 상태로 갈 때 함수가 채우는 시각 컬럼 — SUCCEEDED 는 전용 컬럼이 없다(성사 자체는 경유) */
const FUNDING_TERMINAL_TIMESTAMP: Partial<Record<FundingStatus, 'settledAt' | 'failedAt' | 'cancelledAt'>> = {
  SETTLED: 'settledAt',
  FAILED: 'failedAt',
  CANCELLED: 'cancelledAt',
}

type FundingWriteClient = Pick<Prisma.TransactionClient, 'funding'>

/**
 * Funding 전이의 유일한 쓰기 관문. 화살표 검증 뒤 **조건부 UPDATE** 로 기록한다 — where 에
 * from 상태가 들어가므로 동시 정산 두 건이 경합해도 한쪽만 이긴다(R1 멱등 잠금과 같은 원자성).
 * `transitioned: false` 는 다른 시도가 이미 지나갔다는 뜻 — settle.ts(D)는 이를 "중단" 신호로 쓴다.
 */
export async function transitionFunding(
  fundingId: string,
  from: FundingStatus,
  to: FundingStatus,
  opts: {
    data?: Omit<Prisma.FundingUpdateManyMutationInput, 'status'>
    db?: FundingWriteClient
    now?: Date
  } = {},
): Promise<{ transitioned: boolean }> {
  assertTransitionFunding(from, to)
  const db = opts.db ?? prisma
  const timestampField = FUNDING_TERMINAL_TIMESTAMP[to]

  const { count } = await db.funding.updateMany({
    where: { id: fundingId, status: from },
    data: {
      status: to,
      ...(timestampField ? { [timestampField]: opts.now ?? new Date() } : {}),
      ...opts.data,
    },
  })
  return { transitioned: count > 0 }
}

/**
 * 정산 트리거 판정 (R1) — 마감 지난 OPEN 펀딩만 참이다. DAL(T016)의 모든 조회가 이 판정으로
 * `settleFunding()` 호출 여부를 결정한다. 판정만 여기 두고 실행은 settle.ts(D) 소유다.
 */
export function shouldSettle(
  funding: Pick<{ status: FundingStatus; deadline: Date }, 'status' | 'deadline'>,
  now: Date = new Date(),
): boolean {
  return funding.status === 'OPEN' && funding.deadline.getTime() < now.getTime()
}

// ── Contribution FSM ─────────────────────────────────────────────────────────

/**
 * data-model "상태 전이" 표 — RESERVED→PAID(결제 성공)·PAID→REFUNDED(환불 실행)만 실제
 * 상태값 전이다. "RESERVED --실패·만료·취소--> (행 해제)"는 상태값이 아니라 행 삭제로
 * 구현한다 — `ContributionStatus` 에 EXPIRED/CANCELLED 값이 없기 때문이다(evaluateReservationExpiry 참고).
 */
const CONTRIBUTION_TRANSITIONS = {
  RESERVED: ['PAID'],
  PAID: ['REFUNDED'],
  REFUNDED: [], // 종착
} as const satisfies Record<ContributionStatus, readonly ContributionStatus[]>

export const CONTRIBUTION_STATUSES = Object.keys(
  CONTRIBUTION_TRANSITIONS,
) as readonly ContributionStatus[]

export class InvalidContributionTransitionError extends Error {
  constructor(from: ContributionStatus, to: ContributionStatus) {
    super(`허용되지 않는 참여 상태 전이: ${from} → ${to} (data-model 상태 전이 표 밖)`)
    this.name = 'InvalidContributionTransitionError'
  }
}

export function canTransitionContribution(from: ContributionStatus, to: ContributionStatus): boolean {
  return (CONTRIBUTION_TRANSITIONS[from] as readonly ContributionStatus[]).includes(to)
}

export function assertTransitionContribution(from: ContributionStatus, to: ContributionStatus): void {
  if (!canTransitionContribution(from, to)) throw new InvalidContributionTransitionError(from, to)
}

const CONTRIBUTION_TERMINAL_TIMESTAMP: Partial<Record<ContributionStatus, 'paidAt' | 'refundedAt'>> = {
  PAID: 'paidAt',
  REFUNDED: 'refundedAt',
}

type ContributionWriteClient = Pick<Prisma.TransactionClient, 'fundingContribution'>

/** Contribution 전이의 유일한 쓰기 관문 — 같은 조건부 UPDATE 원자성 (④ contributeToFunding·settle.ts 가 쓴다) */
export async function transitionContribution(
  contributionId: string,
  from: ContributionStatus,
  to: ContributionStatus,
  opts: {
    data?: Omit<Prisma.FundingContributionUpdateManyMutationInput, 'status'>
    db?: ContributionWriteClient
    now?: Date
  } = {},
): Promise<{ transitioned: boolean }> {
  assertTransitionContribution(from, to)
  const db = opts.db ?? prisma
  const timestampField = CONTRIBUTION_TERMINAL_TIMESTAMP[to]

  const { count } = await db.fundingContribution.updateMany({
    where: { id: contributionId, status: from },
    data: {
      status: to,
      ...(timestampField ? { [timestampField]: opts.now ?? new Date() } : {}),
      ...opts.data,
    },
  })
  return { transitioned: count > 0 }
}

// ── 예약 만료 — 지연 해제 (R2) ─────────────────────────────────────────────────

/** 예약 만료 판정 그대로 — RESERVED 이고 reservedUntil < now 일 때만 (R2 원문) */
export function isReservationExpired(
  contribution: Pick<{ status: ContributionStatus; reservedUntil: Date }, 'status' | 'reservedUntil'>,
  now: Date = new Date(),
): boolean {
  return contribution.status === 'RESERVED' && contribution.reservedUntil.getTime() < now.getTime()
}

/**
 * 만료된 예약을 fundingId 단위로 일괄 해제한다 (R2, cron 없음 — 조회 시점 지연 평가).
 * "해제"는 상태 전이가 아니라 **행 삭제**다 — 조건부 UPDATE 처럼 where 절 자체가 원자적이라
 * 이미 결제가 확정(PAID 로 전이)된 행은 이 DELETE 의 `status: 'RESERVED'` 조건에 걸리지
 * 않는다(경합해도 안전). 삭제된 행만큼 잔여(capTotal)가 즉시 풀린다.
 */
export async function evaluateReservationExpiry(
  fundingId: string,
  now: Date = new Date(),
  db: ContributionWriteClient = prisma,
): Promise<{ releasedCount: number }> {
  const { count } = await db.fundingContribution.deleteMany({
    where: { fundingId, status: 'RESERVED', reservedUntil: { lt: now } },
  })
  return { releasedCount: count }
}

/**
 * 예약 **한 건**의 해제 관문 (T025 — 결제 실패 해제 · `cancelReservation`).
 *
 * 만료 해제(위)와 같은 자리·같은 규율이다: 해제는 상태 전이가 아니라 행 삭제이고, where 에
 * `status: 'RESERVED'` 를 넣어 **이미 확정(PAID)된 행은 절대 지우지 않는다** — 조건부 UPDATE
 * 와 같은 원자성이라, 확정 트랜잭션과 경합해도 한쪽만 이긴다. `released: false` 는 "다른
 * 흐름이 먼저 지나갔다"(만료 해제됨 · 이미 PAID)는 뜻이다.
 *
 * 소유자 검사는 호출자(액션)의 몫이다 — 이 모듈은 상태값 규칙만 쥔다. 상태 전이·해제를
 * 이 파일 밖에서 하지 않는다는 헤더 규약을 지키기 위해 여기 둔다.
 */
export async function releaseReservation(
  contributionId: string,
  db: ContributionWriteClient = prisma,
): Promise<{ released: boolean }> {
  const { count } = await db.fundingContribution.deleteMany({
    where: { id: contributionId, status: 'RESERVED' },
  })
  return { released: count > 0 }
}
