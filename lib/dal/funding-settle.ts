import type { FundingStatus, PaymentMethodStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { paidTotal } from '@/lib/funding/totals'

/**
 * 정산 전용 쓰기·잠금 DAL (T014 · US3) — `lib/funding/settle.ts` 만 부른다.
 * 계약: specs/004-group-funding/contracts/server-actions.md §2 · research R1·R5
 *
 * M3 `lib/dal/payment.ts` 와 같은 자리다: 도메인 판정(성사·미달·차액·상한)은 settle.ts 가 하고, 여기는
 * 잠금·원시 행·원자적 쓰기만 쥔다. prisma 는 lib/dal/* 에서만 임포트한다 (lib/prisma.ts 규약).
 *
 * 🔒 `withFundingLock` 이 정산의 직렬화 지점이다. 판정(OPEN→…)과 차액 결제(SUCCEEDED→SETTLED)가 같은
 *    `Funding` 행 잠금 안에서 일어나야 ① 판정 합계가 확정 경로(④ finalizeContributionPaid — 같은 행을
 *    FOR UPDATE)와 교차하지 않고 ② 주최자 카드가 두 번 긁히지 않는다. 잠금 순서는 항상 Funding 먼저 —
 *    Contribution 을 먼저 잠그면 확정 경로와 역순 교착이 성립한다 (contracts §2).
 *
 * 총액 합산은 `lib/funding/totals.ts` 만 쓴다 — 여기서 다시 합산하지 않는다 (R3).
 */

/** 정산이 잠근 뒤 읽는 `Funding` 원시 행 — 잠금 안에서만 유효하다 */
export type LockedFundingRow = {
  id: string
  status: FundingStatus
  organizerId: string
  receiverId: string
  goalAmount: number
  minAmount: number
  deadline: Date
  organizerPaymentMethodId: string | null
  topupAttemptCount: number
  topupRetryUntil: Date | null
}

/** 정산 쓰기 함수들이 받는 클라이언트 모양 — 잠금 트랜잭션(tx)이든 전역 prisma 든 델리게이트만 맞으면 된다 */
export type SettleWriteClient = Pick<
  Prisma.TransactionClient,
  'funding' | 'fundingContribution' | 'payment' | 'notification' | 'paymentMethod'
>

/**
 * 차액 결제(외부 호출, 최대 PORTONE_TIMEOUT_MS)가 잠금 안에서 일어난다 — 그 시간을 넉넉히 덮는다.
 * 원격 DB 왕복도 트랜잭션당 여러 번이다 (④ 의 TX_OPTIONS 와 같은 이유로 기본 5초는 부족하다).
 */
const TX_OPTIONS = { timeout: 30_000, maxWait: 15_000 } as const

/**
 * `Funding` 행 하나를 잠그고 콜백을 실행한다 (R1 멱등 잠금의 실체). Prisma 에 행 잠금 API 가 없어 raw SQL —
 * 그래서 DAL 안에 가둔다. 행이 없으면 `null` 을 넘긴다 — 정산할 대상이 없다는 판정은 호출자 몫이다.
 *
 * ⚠️ 콜백 안에서 결제사를 부르는 경로(차액)가 있다 — M3 의 "외부 호출은 트랜잭션 밖" 원칙을 알고 어긴다.
 *    펀딩에는 M3 의 `PAYING` 같은 "결제 중" 상태가 없어, 잠금을 놓으면 확정 경로의 재진입(settledMeanwhile)이나
 *    주최자의 더블탭이 같은 차액을 두 번 긁을 수 있다. 잠금 시간은 결제사 타임아웃(10초)으로 상한이 있고,
 *    이 시점의 펀딩은 이미 OPEN 이 아니라 새 예약은 어차피 거절된다 — 기다리는 것은 뒤늦은 확정 몇 건뿐이다.
 */
export async function withFundingLock<T>(
  fundingId: string,
  run: (tx: Prisma.TransactionClient, row: LockedFundingRow | null) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedFundingRow[]>`
      SELECT "id", "status", "organizerId", "receiverId", "goalAmount", "minAmount", "deadline",
             "organizerPaymentMethodId", "topupAttemptCount", "topupRetryUntil"
      FROM "Funding"
      WHERE "id" = ${fundingId}::uuid
      FOR UPDATE
    `
    return run(tx, rows[0] ?? null)
  }, TX_OPTIONS)
}

/** 알림 payload·결제 주문명에 필요한 표시용 값 — 잠금 밖에서 읽는다(바뀌지 않는 스냅샷 컬럼들) */
export type SettleContext = {
  id: string
  status: FundingStatus
  organizerId: string
  receiverId: string
  goalAmount: number
  topupAttemptCount: number
  productName: string
  receiverDisplayName: string
}

function snapshotName(snapshot: unknown): string | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null
  const name = (snapshot as { name?: unknown }).name
  return typeof name === 'string' && name !== '' ? name : null
}

export async function getSettleContext(fundingId: string): Promise<SettleContext | null> {
  const row = await prisma.funding.findUnique({
    where: { id: fundingId },
    select: {
      id: true,
      status: true,
      organizerId: true,
      receiverId: true,
      goalAmount: true,
      topupAttemptCount: true,
      productSnapshot: true,
      receiverDisplayName: true,
    },
  })
  if (row === null) return null
  return {
    id: row.id,
    status: row.status,
    organizerId: row.organizerId,
    receiverId: row.receiverId,
    goalAmount: row.goalAmount,
    topupAttemptCount: row.topupAttemptCount,
    productName: snapshotName(row.productSnapshot) ?? '펀딩',
    receiverDisplayName: row.receiverDisplayName,
  }
}

/** settle 이 잠금 밖에서 판정 합계를 다시 읽을 때 — totals 단일 모듈을 그대로 지난다 (R3) */
export function paidTotalOf(fundingId: string): Promise<number> {
  return paidTotal(prisma, fundingId)
}

// ── 환불 ────────────────────────────────────────────────────────────────────

/** 환불 실행에 필요한 것 전부 — 결제 기록(providerTxId)이 없는 PAID 는 환불할 수 없다 */
export type RefundablePaid = {
  contributionId: string
  contributorId: string
  amount: number
  paidAt: Date | null
  paymentId: string | null
  providerTxId: string | null
}

/**
 * 환불 미처리 PAID — `status = PAID` 이고 **환불 선점(refundedAt)이 없는** 행. 선점된 행은 다른 정산 실행이
 * 결제사와 왕복 중이다. 최신 결제부터 돌려준다(SETTLED 뒤 잉여 환불이 "가장 늦게 들어온 돈"을 고른다).
 */
export async function listRefundablePaid(
  fundingId: string,
  db: SettleWriteClient = prisma,
): Promise<RefundablePaid[]> {
  const rows = await db.fundingContribution.findMany({
    where: { fundingId, status: 'PAID', refundedAt: null },
    select: { id: true, contributorId: true, amount: true, paidAt: true },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
  })
  if (rows.length === 0) return []

  // `Payment.fundingContributionId` 에는 Prisma `@relation` 이 없다(raw SQL FK 만, R4) — 따로 읽어 붙인다
  const payments = await db.payment.findMany({
    where: { fundingContributionId: { in: rows.map((r) => r.id) }, status: 'PAID' },
    select: { id: true, fundingContributionId: true, providerTxId: true },
  })
  const byContribution = new Map(payments.map((p) => [p.fundingContributionId, p]))

  return rows.map((row) => {
    const payment = byContribution.get(row.id)
    return {
      contributionId: row.id,
      contributorId: row.contributorId,
      amount: row.amount,
      paidAt: row.paidAt,
      paymentId: payment?.id ?? null,
      providerTxId: payment?.providerTxId ?? null,
    }
  })
}

/**
 * 환불 **선점** — 상태는 그대로 두고 `refundedAt` 만 먼저 박는다. 조건부 UPDATE 라 동시 정산 두 실행 중
 * 한쪽만 통과한다(R1 과 같은 원리). 상태(PAID→REFUNDED)는 결제사가 환불을 받아준 **뒤에** 옮긴다 —
 * 그래야 "REFUNDED 인데 돈은 안 돌아간" 행이 생기지 않는다. 결제사가 거절하면 선점을 되돌린다.
 *
 * 남는 구멍(의도적으로 좁힘, R5 후행): 선점 뒤 프로세스가 죽으면 `PAID AND refundedAt IS NOT NULL` 로 남는다 —
 * 그 조합이 곧 대사 쿼리다.
 */
export async function claimRefund(
  contributionId: string,
  now: Date,
  db: SettleWriteClient = prisma,
): Promise<{ claimed: boolean }> {
  const { count } = await db.fundingContribution.updateMany({
    where: { id: contributionId, status: 'PAID', refundedAt: null },
    data: { refundedAt: now },
  })
  return { claimed: count > 0 }
}

export async function releaseRefundClaim(
  contributionId: string,
  db: SettleWriteClient = prisma,
): Promise<void> {
  await db.fundingContribution.updateMany({
    where: { id: contributionId, status: 'PAID' },
    data: { refundedAt: null },
  })
}

/** 환불 성공 뒤 Payment 를 REFUNDED 로 — 상태 전이(PAID→REFUNDED)·알림과 같은 트랜잭션에서 부른다 */
export async function markPaymentRefunded(
  tx: SettleWriteClient,
  input: { paymentId: string; refundedAt: Date },
): Promise<void> {
  await tx.payment.update({
    where: { id: input.paymentId },
    data: { status: 'REFUNDED', refundedAt: input.refundedAt },
  })
}

/** 잠금 밖에서 환불 한 건을 원자적으로 마무리할 때 쓰는 트랜잭션 — 잠금 안이면 그 tx 를 그대로 쓴다 */
export function runSettleTransaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(run, TX_OPTIONS)
}

// ── 성사·차액 ────────────────────────────────────────────────────────────────

/** 성사 알림 수신자 — PAID 참여자(중복 제거). 차액 행은 주최자 명의라 호출자가 뺀다 */
export async function listPaidContributorIds(
  tx: SettleWriteClient,
  fundingId: string,
  excludeContributionId?: string,
): Promise<string[]> {
  const rows = await tx.fundingContribution.findMany({
    where: {
      fundingId,
      status: 'PAID',
      ...(excludeContributionId ? { id: { not: excludeContributionId } } : {}),
    },
    select: { contributorId: true },
    distinct: ['contributorId'],
  })
  return rows.map((r) => r.contributorId)
}

/** 차액 결제 수단 — 빌링키는 암호화된 채로 낸다. 복호화는 결제사 호출 직전 한 곳에서만 (M3 R10) */
export async function getBillingMethod(
  tx: SettleWriteClient,
  paymentMethodId: string,
): Promise<{ encryptedBillingKey: string; status: PaymentMethodStatus } | null> {
  const row = await tx.paymentMethod.findUnique({
    where: { id: paymentMethodId },
    select: { billingKey: true, status: true },
  })
  return row === null ? null : { encryptedBillingKey: row.billingKey, status: row.status }
}

/**
 * 차액 결제 성공의 기록 — **주최자 명의 PAID 참여 행 + Payment(PAID)**.
 *
 * 왜 참여 행인가: `Payment` 는 C8(대상 정확히 하나 — giftRequestId XOR fundingContributionId)을 DB 가 지키고,
 * 펀딩 자체를 가리키는 FK 는 없다. 스키마를 바꾸지 않고(마이그레이션은 J만) 차액 결제 이력을 잃지 않는 길은
 * 이것 하나다. 부수 효과가 오히려 맞다 — SETTLED 에서 `paidTotal` 이 정확히 목표와 같아져 진행바가 100% 다.
 * 예약이 없었으므로 `reservedUntil = paidAt = now` 로 같은 시각을 박는다 — 차액 행을 가려낼 유일한 흔적이다.
 */
export async function recordTopupPaid(
  tx: SettleWriteClient,
  input: {
    fundingId: string
    organizerId: string
    amount: number
    providerTxId: string
    now: Date
  },
): Promise<{ contributionId: string }> {
  const created = await tx.fundingContribution.create({
    data: {
      fundingId: input.fundingId,
      contributorId: input.organizerId,
      amount: input.amount,
      status: 'PAID',
      reservedUntil: input.now,
      paidAt: input.now,
    },
    select: { id: true },
  })
  await tx.payment.create({
    data: {
      // 명시적으로 넣는다 — @default 에 기대면 default 없는 정본에서 NOT NULL 위반이 난다 (M3 규약)
      provider: 'portone',
      fundingContributionId: created.id,
      amount: input.amount,
      status: 'PAID',
      providerTxId: input.providerTxId,
      paidAt: input.now,
    },
  })
  return { contributionId: created.id }
}

/**
 * 차액 결제 실패의 기록 — 시도 횟수·재시도 기한 (R5). 상태는 SUCCEEDED 그대로다(전이가 아니라 여기서 쓴다 —
 * state.ts 는 status 컬럼만 지킨다). 실패한 시도는 Payment 로 남기지 않는다: C8 때문에 대상 참여 행이 필요한데
 * 실패에는 만들 행이 없다 (④ 가 실패 예약을 기록하지 않는 것과 같은 이유).
 */
export async function recordTopupFailure(
  tx: SettleWriteClient,
  fundingId: string,
  input: { attemptCount: number; retryUntil: Date },
): Promise<void> {
  await tx.funding.updateMany({
    where: { id: fundingId, status: 'SUCCEEDED' },
    data: { topupAttemptCount: input.attemptCount, topupRetryUntil: input.retryUntil },
  })
}

// ── 관리 액션 (T031) ──────────────────────────────────────────────────────────

/** `cancelFunding`·`retryFundingTopup` 의 소유자·상태 판정용 원시 행 */
export type ManageTarget = {
  organizerId: string
  status: FundingStatus
  deadline: Date
  topupAttemptCount: number
  topupRetryUntil: Date | null
  organizerPaymentMethodId: string | null
}

export async function findFundingForManage(fundingId: string): Promise<ManageTarget | null> {
  return prisma.funding.findUnique({
    where: { id: fundingId },
    select: {
      organizerId: true,
      status: true,
      deadline: true,
      topupAttemptCount: true,
      topupRetryUntil: true,
      organizerPaymentMethodId: true,
    },
  })
}

/**
 * 재시도 시 결제수단 변경 — `SUCCEEDED` 조건부라 이미 끝난 펀딩의 수단은 바뀌지 않는다.
 * 본인 소유·ACTIVE 검증은 액션 몫이다 (M3 retryGiftPayment 와 같은 순서).
 */
export async function setOrganizerPaymentMethod(
  fundingId: string,
  paymentMethodId: string,
): Promise<{ updated: boolean }> {
  const { count } = await prisma.funding.updateMany({
    where: { id: fundingId, status: 'SUCCEEDED' },
    data: { organizerPaymentMethodId: paymentMethodId },
  })
  return { updated: count > 0 }
}
