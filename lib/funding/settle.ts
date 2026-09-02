import type { FundingStatus, Prisma } from '@prisma/client'
import { getPaymentMaxAttempts, retryUntilFrom } from '@/lib/config/gift'
import { decryptBillingKey } from '@/lib/crypto/billing-key'
import {
  claimRefund,
  getBillingMethod,
  getSettleContext,
  listPaidContributorIds,
  listRefundablePaid,
  markPaymentRefunded,
  paidTotalOf,
  recordTopupFailure,
  recordTopupPaid,
  releaseRefundClaim,
  runSettleTransaction,
  withFundingLock,
  type LockedFundingRow,
  type RefundablePaid,
  type SettleContext,
  type SettleWriteClient,
} from '@/lib/dal/funding-settle'
import { createFundingNotifications, type FundingNotificationEntry } from '@/lib/dal/notification'
import { transitionContribution, transitionFunding } from '@/lib/funding/state'
import { paidTotal } from '@/lib/funding/totals'
import { getPortOneClient, type ChargeResult } from '@/lib/portone/client'

/**
 * 정산 (T014) — 계약: specs/004-group-funding/contracts/server-actions.md §2 ★
 * 근거: research R1(지연 트리거 + 멱등 잠금) · R5(환불·차액 = M3 portone 재사용, topup 실패 → 재시도 → 취소) ·
 *       R8(정산 알림 3종은 전부 여기) · clarify Q3(상한 초과 시 취소·전액 환불·전원 고지)
 *
 * **정산의 유일한 실행 지점이다.** 트리거는 마감 지난 OPEN 을 지나는 첫 조회(DAL) / 조기 성사(참여 확정) /
 * 주최자 취소 / topup 재시도 — 넷 다 이 함수 하나를 부르고, 그 뒤에서 상태·환불·정산 알림에 손대지 않는다.
 *
 * 소유: 판정 → 환불 실행(refund — M3 가 mock 에 미리 만든 것의 첫 실사용) → 차액 결제(chargeBillingKey) →
 *       SETTLED 확정 → 알림 3종(FUNDING_SUCCEEDED · FUNDING_FAILED_REFUNDED · FUNDING_ORGANIZER_TOPUP).
 *
 * 🔑 돈이 움직이므로 멱등이 전부다. 세 잠금이 그것을 만든다:
 *   ① 판정 — `Funding` 행 잠금(FOR UPDATE) 안에서 paidTotal 을 읽고 OPEN→SUCCEEDED|FAILED 를 조건부 UPDATE.
 *      잠금 조건은 status 만 본다(deadline 술어 없음) — 조기 성사는 마감 전에 들어온다. 확정 경로(④)가 같은 행을
 *      잠그므로 판정 합계와 확정이 교차하지 않는다.
 *   ② 환불 — 건별 **선점**(refundedAt 조건부 UPDATE) 뒤 결제사 호출, 성공 뒤 PAID→REFUNDED. 동시 두 실행이 같은
 *      건을 두 번 환불하지 못한다.
 *   ③ 차액 — `Funding` 행 잠금 안에서 결제까지 끝낸다. 펀딩에는 M3 의 PAYING 같은 "결제 중" 상태가 없어 잠금을
 *      놓으면 재진입·더블탭이 주최자 카드를 두 번 긁는다 (lib/dal/funding-settle.ts withFundingLock 참고).
 *
 * 재진입(비-OPEN 으로 재호출): 잠금은 0행이지만 그냥 끝내지 않는다 — FAILED·CANCELLED 는 **환불 미처리 PAID**
 * (마감·취소를 가로질러 확정된 대사 복원 건; ④ 가 settledMeanwhile 로 재호출한다)를 환불에 편입하고, SUCCEEDED
 * 는 차액 단계를, SETTLED 는 잉여(목표 초과분) 환불을 지난다.
 *
 * topup 실패: SUCCEEDED 유지 + topupAttemptCount·retryUntil 기록. **자동 재시도는 없다** — 플래그 없는 재진입
 * (조회·확정)은 주최자 카드를 다시 긁지 않고, `retryTopup` 을 든 호출(주최자의 재시도 액션)만 다음 시도를 쓴다.
 * 시도 횟수는 주최자의 것이다. 상한(M3 와 같은 env — GIFT_PAYMENT_MAX_ATTEMPTS·RETRY_WINDOW) 초과 시
 * SUCCEEDED→CANCELLED + 전액 환불 + 전원 고지. 기한 초과는 어느 재진입에서든 지연 평가로 확정된다.
 *
 * 차액 결제의 기록은 **주최자 명의 PAID 참여 행 + Payment** 다 — Payment 의 C8(대상 정확히 하나)이 펀딩 자체를
 * 가리킬 FK 를 허용하지 않아, 스키마를 바꾸지 않는 유일한 길이다 (recordTopupPaid 주석). 그래서 SETTLED 의
 * paidTotal 은 정확히 목표와 같다.
 */

export type SettleOutcome =
  | { outcome: 'SETTLED' }
  | { outcome: 'FAILED' }
  | { outcome: 'CANCELLED' }
  | { outcome: 'TOPUP_FAILED'; attemptCount: number; retryUntil: Date }
  /** 마감 전이고 paidTotal < goalAmount — 아무것도 하지 않았다 */
  | { outcome: 'STILL_OPEN' }

export type SettleOptions = {
  /**
   * 주최자의 **명시적** 재시도(retryFundingTopup)만 true 다. 조회·조기 성사·취소 경로는 넘기지 않는다 —
   * 그 경로에서 차액을 다시 긁으면 주최자 모르게 시도 횟수가 축난다.
   */
  retryTopup?: boolean
}

/** 결제사에 갈 수 없는 상태 — 호출도 하지 않고 실패로 흐른다 (M3 charge.ts 와 같은 규약) */
const UNUSABLE_METHOD_REASON = '등록된 결제수단을 사용할 수 없습니다'

export async function settleFunding(fundingId: string, opts: SettleOptions = {}): Promise<SettleOutcome> {
  const now = new Date()

  const judged = await judge(fundingId, now)
  if (judged.kind === 'NOT_FOUND') {
    // 호출자(조회 DAL·확정 트랜잭션·관리 액션)가 존재를 보장한다 — 여기까지 왔다면 코드의 실수다
    throw new Error(`정산할 펀딩을 찾지 못했다: ${fundingId}`)
  }
  if (judged.kind === 'STILL_OPEN') return { outcome: 'STILL_OPEN' }

  return finishByStatus(fundingId, judged.status, now, opts)
}

// ── ① 판정 ─────────────────────────────────────────────────────────────────

type Judgement =
  | { kind: 'NOT_FOUND' }
  | { kind: 'STILL_OPEN' }
  /** 이번 호출이 전이시켰거나(OPEN→…) 이미 비-OPEN 이었다(재진입) — 둘 다 그 상태의 후속 단계로 간다 */
  | { kind: 'STATUS'; status: FundingStatus }

/**
 * 마감 후: paid ≥ min → SUCCEEDED / 아니면 FAILED. 마감 전: paid ≥ goal(조기 성사)만 SUCCEEDED, 아니면 STILL_OPEN.
 * RESERVED 는 판정에 없다 — paidTotal 이 PAID 만 합산한다 (R3 · SC-002).
 */
async function judge(fundingId: string, now: Date): Promise<Judgement> {
  return withFundingLock(fundingId, async (tx, row) => {
    if (row === null) return { kind: 'NOT_FOUND' }
    if (row.status !== 'OPEN') return { kind: 'STATUS', status: row.status }

    const paid = await paidTotal(tx, fundingId)
    const deadlinePassed = row.deadline.getTime() < now.getTime()

    let to: 'SUCCEEDED' | 'FAILED'
    if (deadlinePassed) to = paid >= row.minAmount ? 'SUCCEEDED' : 'FAILED'
    else if (paid >= row.goalAmount) to = 'SUCCEEDED'
    else return { kind: 'STILL_OPEN' }

    const { transitioned } = await transitionFunding(fundingId, 'OPEN', to, { db: tx, now })
    if (!transitioned) {
      // 행을 잠근 채 읽은 OPEN 이 그새 바뀔 수는 없다 — 일어나면 잠금 자체가 깨진 것이다
      throw new Error(`정산 판정 잠금이 0행이었다 — Funding 행 잠금이 성립하지 않았다: ${fundingId}`)
    }
    return { kind: 'STATUS', status: to }
  })
}

async function finishByStatus(
  fundingId: string,
  status: FundingStatus,
  now: Date,
  opts: SettleOptions,
): Promise<SettleOutcome> {
  const ctx = await getSettleContext(fundingId)
  if (ctx === null) throw new Error(`정산할 펀딩을 찾지 못했다: ${fundingId}`)

  switch (status) {
    case 'FAILED':
      await refundAllPaid(ctx, { reason: 'FAILED' }, now)
      return { outcome: 'FAILED' }
    case 'CANCELLED':
      // 취소의 출처는 시도 횟수로 갈린다 — 주최자 취소는 OPEN 에서만 가능해(contracts §4) 시도가 0 이다
      await refundAllPaid(
        ctx,
        { reason: 'CANCELLED', cause: ctx.topupAttemptCount > 0 ? 'TOPUP_EXHAUSTED' : 'ORGANIZER' },
        now,
      )
      return { outcome: 'CANCELLED' }
    case 'SUCCEEDED':
      return settleSucceeded(ctx, now, opts.retryTopup === true)
    case 'SETTLED':
      await refundSurplus(ctx, now)
      return { outcome: 'SETTLED' }
    case 'OPEN':
      // judge 가 OPEN 을 STATUS 로 돌려주지 않는다 — 타입 완결성용
      return { outcome: 'STILL_OPEN' }
  }
}

// ── ③ 성사 → 차액 → SETTLED ─────────────────────────────────────────────────

type SucceededStep =
  | { kind: 'SETTLED' }
  | { kind: 'CANCELLED_EXHAUSTED' }
  | { kind: 'TOPUP_FAILED'; attemptCount: number; retryUntil: Date }
  /** 잠금을 얻고 보니 다른 실행이 이미 끝냈다 — 그 상태의 후속 단계로 */
  | { kind: 'STATUS'; status: FundingStatus }

async function settleSucceeded(ctx: SettleContext, now: Date, retryTopup: boolean): Promise<SettleOutcome> {
  const step = await withFundingLock(ctx.id, async (tx, row): Promise<SucceededStep> => {
    if (row === null) throw new Error(`정산할 펀딩을 찾지 못했다: ${ctx.id}`)
    if (row.status !== 'SUCCEEDED') return { kind: 'STATUS', status: row.status }

    const paid = await paidTotal(tx, ctx.id)
    const shortfall = row.goalAmount - paid

    if (shortfall <= 0) {
      // 차액 없음 (조기 성사 · 개설자=수령자의 min=goal · 대사 복원으로 넘친 경우) — 바로 SETTLED
      await confirmSettled(tx, ctx, row, now, null)
      return { kind: 'SETTLED' }
    }

    const maxAttempts = getPaymentMaxAttempts()
    const isExhausted = (attemptCount: number, retryUntil: Date | null) =>
      attemptCount >= maxAttempts || (retryUntil !== null && now.getTime() > retryUntil.getTime())

    if (isExhausted(row.topupAttemptCount, row.topupRetryUntil)) {
      // 기한·횟수가 끝난 SUCCEEDED 를 어느 재진입에서든 취소로 확정한다 — 그대로 두면 참여자 돈이 영영 묶인다
      await cancelExhausted(tx, ctx, row, now, null)
      return { kind: 'CANCELLED_EXHAUSTED' }
    }

    if (!retryTopup && row.topupAttemptCount > 0) {
      // 이미 한 번 실패했다. 자동 재시도는 없다 — 다음 시도는 주최자의 재시도 액션(retryTopup)만 쓴다
      return {
        kind: 'TOPUP_FAILED',
        attemptCount: row.topupAttemptCount,
        retryUntil: row.topupRetryUntil ?? retryUntilFrom(now),
      }
    }

    // 차액 결제 — 잠금 안 (헤더 ③). 빌링키 평문은 attemptTopupCharge 안에서만 존재한다
    const charged = await attemptTopupCharge(tx, ctx, row, shortfall)
    const attemptCount = row.topupAttemptCount + 1

    if (charged.ok) {
      const { contributionId } = await recordTopupPaid(tx, {
        fundingId: ctx.id,
        organizerId: row.organizerId,
        amount: shortfall,
        providerTxId: charged.providerTxId,
        now,
      })
      await confirmSettled(tx, ctx, row, now, { contributionId, amount: shortfall, attemptCount })
      return { kind: 'SETTLED' }
    }

    // 재시도 기한은 **첫 실패 시점 + window** 로 한 번만 박는다 (M3 R11) — 실패마다 다시 계산하면 영원히 안 끝난다
    const retryUntil = row.topupRetryUntil ?? retryUntilFrom(now)
    if (attemptCount >= maxAttempts || now.getTime() > retryUntil.getTime()) {
      await cancelExhausted(tx, ctx, row, now, { attemptCount, retryUntil })
      return { kind: 'CANCELLED_EXHAUSTED' }
    }

    await recordTopupFailure(tx, ctx.id, { attemptCount, retryUntil })
    return { kind: 'TOPUP_FAILED', attemptCount, retryUntil }
  })

  switch (step.kind) {
    case 'SETTLED':
      await refundSurplus(ctx, now)
      return { outcome: 'SETTLED' }
    case 'CANCELLED_EXHAUSTED':
      // 전이·전원 고지는 잠금 안에서 끝났다 — 환불(외부 호출)은 잠금 밖에서 건별 선점으로
      await refundAllPaid(ctx, { reason: 'CANCELLED', cause: 'TOPUP_EXHAUSTED' }, now)
      return { outcome: 'CANCELLED' }
    case 'TOPUP_FAILED':
      return { outcome: 'TOPUP_FAILED', attemptCount: step.attemptCount, retryUntil: step.retryUntil }
    case 'STATUS':
      return finishByStatus(ctx.id, step.status, now, {})
  }
}

/**
 * SUCCEEDED → SETTLED 확정 + 알림 — 성사(참여자 전원·수령자)와, 차액이 있었다면 주최자 고지까지 **같은 트랜잭션**.
 * "동의를 받았어도 고지는 별개다" — FUNDING_ORGANIZER_TOPUP 은 차액 결제 성공 직후 같은 흐름에서 만든다 (R8 · SC-004).
 */
async function confirmSettled(
  tx: Prisma.TransactionClient,
  ctx: SettleContext,
  row: LockedFundingRow,
  now: Date,
  topup: { contributionId: string; amount: number; attemptCount: number } | null,
): Promise<void> {
  const { transitioned } = await transitionFunding(ctx.id, 'SUCCEEDED', 'SETTLED', {
    db: tx,
    now,
    data: topup ? { topupAttemptCount: topup.attemptCount } : {},
  })
  if (!transitioned) {
    throw new Error(`SETTLED 확정이 0행이었다 — Funding 행 잠금이 성립하지 않았다: ${ctx.id}`)
  }

  const contributorIds = await listPaidContributorIds(tx, ctx.id, topup?.contributionId)
  const recipients = new Set<string>([...contributorIds, row.receiverId])

  const entries: FundingNotificationEntry[] = [...recipients].map((userId) => ({
    userId,
    type: 'FUNDING_SUCCEEDED',
    payload: {
      fundingId: ctx.id,
      productName: ctx.productName,
      receiverDisplayName: ctx.receiverDisplayName,
      amount: row.goalAmount,
    },
  }))
  if (topup) {
    entries.push({
      userId: row.organizerId,
      type: 'FUNDING_ORGANIZER_TOPUP',
      payload: {
        fundingId: ctx.id,
        productName: ctx.productName,
        receiverDisplayName: ctx.receiverDisplayName,
        amount: topup.amount,
      },
    })
  }
  await createFundingNotifications(tx, entries)
}

/**
 * topup 상한 초과 → SUCCEEDED → CANCELLED + **전원 고지**의 전이·고지 부분 (clarify Q3). 전이와 같은 트랜잭션에서
 * 주최자·수령자에게 취소 사실을 만든다 — 조건부 전이라 정확히 한 번이다. 참여자 고지(환불 금액 포함)는 환불
 * 단계가 건별로 만든다.
 */
async function cancelExhausted(
  tx: Prisma.TransactionClient,
  ctx: SettleContext,
  row: LockedFundingRow,
  now: Date,
  counters: { attemptCount: number; retryUntil: Date } | null,
): Promise<void> {
  const { transitioned } = await transitionFunding(ctx.id, 'SUCCEEDED', 'CANCELLED', {
    db: tx,
    now,
    data: counters ? { topupAttemptCount: counters.attemptCount, topupRetryUntil: counters.retryUntil } : {},
  })
  if (!transitioned) {
    throw new Error(`상한 초과 취소가 0행이었다 — Funding 행 잠금이 성립하지 않았다: ${ctx.id}`)
  }

  const recipients = new Set<string>([row.organizerId, row.receiverId])
  await createFundingNotifications(
    tx,
    [...recipients].map((userId) => ({
      userId,
      type: 'FUNDING_FAILED_REFUNDED' as const,
      payload: {
        fundingId: ctx.id,
        productName: ctx.productName,
        receiverDisplayName: ctx.receiverDisplayName,
        amount: 0,
        reason: 'CANCELLED' as const,
        cause: 'TOPUP_EXHAUSTED' as const,
      },
    })),
  )
}

/**
 * 결제사 호출. 빌링키 평문은 **이 함수 안에서만** 존재하고 반환·로그 어디에도 남지 않는다 (M3 R10).
 * 수단 부재·비활성·복호화 실패는 예외로 새지 않고 실패 값으로 흐른다 — 잠금 안에서 예외가 나면 판정만 남고
 * 차액 기록이 사라진다.
 */
async function attemptTopupCharge(
  tx: SettleWriteClient,
  ctx: SettleContext,
  row: LockedFundingRow,
  amount: number,
): Promise<ChargeResult> {
  if (row.organizerPaymentMethodId === null) return { ok: false, reason: UNUSABLE_METHOD_REASON }

  const method = await getBillingMethod(tx, row.organizerPaymentMethodId)
  if (method === null || method.status !== 'ACTIVE') return { ok: false, reason: UNUSABLE_METHOD_REASON }

  let billingKey: string
  try {
    billingKey = decryptBillingKey(method.encryptedBillingKey)
  } catch (e) {
    console.error('[funding/settle] 차액 결제 빌링키 복호화 실패 — 실패 경로로 마무리한다', {
      fundingId: ctx.id,
      cause: (e as Error).message,
    })
    return { ok: false, reason: UNUSABLE_METHOD_REASON }
  }

  const client = getPortOneClient()
  return client.chargeBillingKey({
    billingKey,
    // 가맹점이 먼저 만드는 결제 id (contracts §1) — 성공·실패·조회·환불이 전부 이 id 를 쓴다
    paymentId: client.createPaymentId(),
    amount,
    orderName: `${ctx.productName} 펀딩 차액`,
  })
}

// ── ② 환불 ─────────────────────────────────────────────────────────────────

type RefundTag = {
  reason: 'FAILED' | 'CANCELLED' | 'SURPLUS'
  cause?: 'ORGANIZER' | 'TOPUP_EXHAUSTED'
}

/**
 * 환불 미처리 PAID 전부 — 미달·취소의 종착 (FR-017). 잠금 밖에서 건별 선점으로 돈다: N건 × 결제사 왕복을
 * 행 잠금 아래 두지 않는다. 한 건이 실패해도 나머지는 계속 간다 — 실패는 로그로 남기고 다음 재진입이 다시 집는다.
 */
async function refundAllPaid(ctx: SettleContext, tag: RefundTag, now: Date): Promise<void> {
  const rows = await listRefundablePaid(ctx.id)
  for (const row of rows) {
    await refundOne(ctx, row, tag, now, null)
  }
}

/**
 * SETTLED 뒤 잉여 환불 — 성사가 끝난 뒤 늦게 확정된 결제(④ 대사, 예약과 결제 사이에 정산이 지나간 건)로
 * paidTotal 이 목표를 넘은 만큼 되돌린다. 펀딩은 성사했고 이 돈만 필요 없어졌다(reason SURPLUS).
 *
 * **행 잠금 안에서** 돈다: 두 재진입이 각자 잉여를 계산해 서로 다른 행을 돌려주면 목표 아래로 내려간다.
 * 가장 늦게 들어온 결제부터, 잉여 안에 **통째로** 들어가는 행만 돌려준다 — 부분 환불은 없고, 목표 아래로 내려가는
 * 일도 없다. 그래도 남는 잉여는 로그로 남긴다 (수동 대사).
 */
async function refundSurplus(ctx: SettleContext, now: Date): Promise<void> {
  // 잠금 전에 싸게 걸러낸다 — 거의 모든 SETTLED 재진입은 여기서 끝난다
  const paidBefore = await paidTotalOf(ctx.id)
  if (paidBefore <= ctx.goalAmount) return

  await withFundingLock(ctx.id, async (tx, row) => {
    if (row === null || row.status !== 'SETTLED') return

    const paid = await paidTotal(tx, ctx.id)
    let surplus = paid - row.goalAmount
    if (surplus <= 0) return

    const candidates = await listRefundablePaid(ctx.id, tx)
    for (const candidate of candidates) {
      if (surplus <= 0) break
      if (candidate.amount > surplus) continue
      const refunded = await refundOne(ctx, candidate, { reason: 'SURPLUS' }, now, tx)
      if (refunded) surplus -= candidate.amount
    }

    if (surplus > 0) {
      console.error('[funding/settle] SETTLED 뒤 잉여가 남았다 — 통째로 돌려줄 결제가 없어 수동 대사가 필요하다', {
        fundingId: ctx.id,
        goalAmount: row.goalAmount,
        paidTotal: paid,
        remainingSurplus: surplus,
      })
    }
  })
}

/**
 * 환불 한 건: 선점 → 결제사 → (PAID→REFUNDED + Payment REFUNDED + 참여자 고지) 원자적 마무리.
 * 잠금 밖(`lockedTx === null`)이면 마무리를 별도 트랜잭션으로 묶고, 잠금 안이면 그 tx 를 그대로 쓴다.
 * @returns 실제로 환불이 실행됐는지 — 선점 실패(다른 실행이 먼저)·기록 없음·결제사 거절은 false
 */
async function refundOne(
  ctx: SettleContext,
  row: RefundablePaid,
  tag: RefundTag,
  now: Date,
  lockedTx: Prisma.TransactionClient | null,
): Promise<boolean> {
  const db: SettleWriteClient | undefined = lockedTx ?? undefined

  if (row.providerTxId === null || row.paymentId === null) {
    // 결제 기록 없는 PAID — 돌려줄 결제사 id 가 없다. 상태는 그대로 두고 크게 남긴다 (수동 대사)
    console.error('[funding/settle] PAID 참여에 결제 기록이 없어 환불할 수 없다', {
      fundingId: ctx.id,
      contributionId: row.contributionId,
      amount: row.amount,
    })
    return false
  }

  const { claimed } = await claimRefund(row.contributionId, now, db)
  if (!claimed) return false // 다른 정산 실행이 먼저 잡았다 — 두 번 돌려주지 않는다

  const refunded = await getPortOneClient().refund({ providerTxId: row.providerTxId, amount: row.amount })
  if (!refunded.ok) {
    // mock 은 항상 성공한다. 실연동 환불 실패의 후속 처리(재시도·운영 고지)는 R5 가 후행 과제로 남겼다 —
    // 여기서는 선점을 풀어 다음 재진입이 다시 집을 수 있게 하고, 크게 남긴다.
    console.error('[funding/settle] 환불 실패 — 선점을 풀고 다음 재진입에 맡긴다', {
      fundingId: ctx.id,
      contributionId: row.contributionId,
      amount: row.amount,
      reason: refunded.reason,
    })
    await releaseRefundClaim(row.contributionId, db)
    return false
  }

  const finalize = async (tx: Prisma.TransactionClient) => {
    // 선점이 refundedAt 을 먼저 박았으므로 전이는 status 만 옮긴다 — 결제사가 준 시각으로 맞춘다
    const { transitioned } = await transitionContribution(row.contributionId, 'PAID', 'REFUNDED', {
      db: tx,
      now: refunded.refundedAt,
    })
    if (!transitioned) {
      // 선점한 행이 그새 다른 상태가 될 길은 없다 — 일어나면 기록만 남기고 알림은 만들지 않는다
      console.error('[funding/settle] 환불은 됐는데 PAID 가 아니었다 — Payment 만 REFUNDED 로 남긴다', {
        fundingId: ctx.id,
        contributionId: row.contributionId,
      })
      await markPaymentRefunded(tx, { paymentId: row.paymentId!, refundedAt: refunded.refundedAt })
      return
    }
    await markPaymentRefunded(tx, { paymentId: row.paymentId!, refundedAt: refunded.refundedAt })
    await createFundingNotifications(tx, [
      {
        userId: row.contributorId,
        type: 'FUNDING_FAILED_REFUNDED',
        payload: {
          fundingId: ctx.id,
          productName: ctx.productName,
          receiverDisplayName: ctx.receiverDisplayName,
          amount: row.amount,
          reason: tag.reason,
          ...(tag.cause ? { cause: tag.cause } : {}),
        },
      },
    ])
  }

  if (lockedTx) await finalize(lockedTx)
  else await runSettleTransaction(finalize)
  return true
}
