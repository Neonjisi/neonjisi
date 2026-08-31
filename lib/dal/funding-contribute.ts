import type { ContributionStatus, FundingStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { reservedUntilFrom } from '@/lib/config/funding'
import { evaluateReservationExpiry, transitionContribution } from '@/lib/funding/state'
import { capTotal, paidTotal } from '@/lib/funding/totals'

/**
 * 참여 액션 전용 쓰기·잠금 DAL (T025 · US2) — M3 `lib/dal/gift-respond.ts` 와 같은 자리다.
 * 계약: specs/004-group-funding/contracts/server-actions.md §4 `contributeToFunding` · research R2
 *
 * 조회 View 는 `lib/dal/funding.ts`(T016, ② 소유) 소유다 — 이 파일은 수정하지 않고 import 만
 * 한다. 여기 함수는 View 를 만들지 않고 **잠금과 원시 행**만 다룬다(인가 판정은 액션의 검사
 * 순서 1이 `getFunding` 으로 한다).
 *
 * 🔒 **이 파일이 M4 의 캡 방어선이다.** 잔여 검사와 예약 생성이 같은 트랜잭션 안에 있고,
 *    그 트랜잭션이 `SELECT ... FOR UPDATE` 로 `Funding` 행을 먼저 잠근다. 잠금 없이 검사하고
 *    INSERT 하면 두 참여가 같은 잔여를 보고 둘 다 통과해 합계가 목표를 넘는다 (SC-001).
 *    총액 합산은 `lib/funding/totals.ts` 만 쓴다 — 여기서 다시 합산하지 않는다 (R3).
 */

/** 잔여 캡 계산의 기준 행 — 잠근 뒤 읽는 값이라 트랜잭션 안에서만 유효하다 */
type LockedFunding = { id: string; status: FundingStatus; goalAmount: number; organizerId: string }

/** 원격 DB 왕복이 트랜잭션당 네다섯 번이라 기본 5초로는 경합 시 부족하다 */
const TX_OPTIONS = { timeout: 20_000, maxWait: 15_000 } as const

/**
 * `Funding` 행 하나를 잠근다 (R2 ①). Prisma 에 행 잠금 API 가 없어 raw SQL 이다 — 그래서
 * DAL 안에 가둔다. 같은 펀딩에 대한 다른 예약·확정 트랜잭션은 여기서 줄을 선다.
 */
async function lockFunding(
  tx: Prisma.TransactionClient,
  fundingId: string,
): Promise<LockedFunding | null> {
  const rows = await tx.$queryRaw<LockedFunding[]>`
    SELECT "id", "status", "goalAmount", "organizerId"
    FROM "Funding"
    WHERE "id" = ${fundingId}::uuid
    FOR UPDATE
  `
  return rows[0] ?? null
}

export type ReserveContributionResult =
  | { ok: true; contributionId: string; reservedUntil: Date }
  | { ok: false; reason: 'NOT_FOUND' | 'FUNDING_CLOSED' | 'OVER_REMAINING'; remaining: number }

/**
 * 2단계 참여의 ① — 잠금 안에서 잔여를 선점한다 (contracts §4 · R2).
 *
 * 순서가 곧 방어다: 잠금 → 상태 확인 → **만료 예약 해제(R2)** → capTotal 로 잔여 계산 →
 * 초과 거부 → `RESERVED` 생성. 만료 해제를 잔여 계산 앞에 두지 않으면 이미 죽은 예약이
 * 잔여를 계속 잡아 정상 참여가 거부된다.
 */
export async function reserveContribution(input: {
  fundingId: string
  contributorId: string
  amount: number
  now: Date
}): Promise<ReserveContributionResult> {
  return prisma.$transaction(async (tx) => {
    const funding = await lockFunding(tx, input.fundingId)
    if (funding === null) return { ok: false as const, reason: 'NOT_FOUND' as const, remaining: 0 }
    if (funding.status !== 'OPEN') {
      return { ok: false as const, reason: 'FUNDING_CLOSED' as const, remaining: 0 }
    }

    // 지연 해제 (R2) — 잠금 안에서 하므로 다른 예약과 교차하지 않는다
    await evaluateReservationExpiry(input.fundingId, input.now, tx)

    const cap = await capTotal(tx, input.fundingId)
    const remaining = funding.goalAmount - cap
    if (input.amount > remaining) {
      return { ok: false as const, reason: 'OVER_REMAINING' as const, remaining }
    }

    const created = await tx.fundingContribution.create({
      data: {
        fundingId: input.fundingId,
        contributorId: input.contributorId,
        amount: input.amount,
        status: 'RESERVED',
        reservedUntil: reservedUntilFrom(input.now),
      },
      select: { id: true, reservedUntil: true },
    })

    return { ok: true as const, contributionId: created.id, reservedUntil: created.reservedUntil }
  }, TX_OPTIONS)
}

/** 결제 실행에 필요한 것 전부 — 빌링키를 포함하므로 부르는 곳은 참여 액션 하나뿐이어야 한다 */
export type ContributionChargeTarget = {
  contributionId: string
  /** 알림 payload 의 표시용 스냅샷 (R8) */
  contributorDisplayName: string
  /** FUNDING_CONTRIBUTION_RECEIVED 수신자 */
  organizerId: string
  amount: number
  /** 결제사에 보낼 주문명 — 펀딩의 상품 스냅샷에서 읽는다 */
  orderName: string
  /** 암호화된 채로 낸다 — 복호화는 결제사 호출 직전 한 곳에서만 (M3 R10) */
  encryptedBillingKey: string | null
  paymentMethodStatus: 'ACTIVE' | 'EXPIRED' | 'DELETED' | null
}

function snapshotName(snapshot: unknown): string | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null
  const name = (snapshot as { name?: unknown }).name
  return typeof name === 'string' && name !== '' ? name : null
}

/**
 * 예약된 참여 건의 결제 대상 조회. `FundingContribution` 에는 결제수단 컬럼이 없다 —
 * 참여자의 **활성 결제수단 최신 1건**을 쓴다(M3 `getActivePaymentMethod` 와 같은 규칙).
 * 수단이 없거나 활성이 아니면 결제사에 가지 않고 실패 경로로 흐른다 (contracts §4 — 수단
 * 등록 강제 진입은 화면이 처리한다).
 */
export async function getContributionChargeTarget(
  contributionId: string,
): Promise<ContributionChargeTarget | null> {
  const row = await prisma.fundingContribution.findUnique({
    where: { id: contributionId },
    select: {
      id: true,
      contributorId: true,
      amount: true,
      contributor: { select: { displayName: true } },
      funding: { select: { organizerId: true, productSnapshot: true } },
    },
  })
  if (row === null) return null

  const method = await prisma.paymentMethod.findFirst({
    where: { userId: row.contributorId, status: 'ACTIVE' },
    select: { billingKey: true, status: true },
    orderBy: { createdAt: 'desc' },
  })

  return {
    contributionId: row.id,
    contributorDisplayName: row.contributor.displayName,
    organizerId: row.funding.organizerId,
    amount: row.amount,
    orderName: snapshotName(row.funding.productSnapshot) ?? '펀딩 참여',
    encryptedBillingKey: method?.billingKey ?? null,
    paymentMethodStatus: method?.status ?? null,
  }
}

/**
 * 주최자 알림 payload (R8) — 발생 시점의 **표시용 스냅샷**이다. 목록이 User·Funding 을 다시
 * 읽지 않는다 (M2·M3 와 같은 원칙). 표시 문구·이동 매핑은 화면(H) 몫이다.
 */
export type FundingContributionNotificationPayload = {
  fundingId: string
  contributorDisplayName: string
  productName: string
  amount: number
}

export type FinalizeContributionResult = {
  /** 예약이 만료 해제된 뒤 결제가 성공해 같은 id 로 되살렸다 (대사) */
  restored: boolean
  /** 이미 확정된 건이었다 — 결제 기록·알림을 다시 만들지 않았다 */
  alreadyPaid: boolean
  paidTotal: number
  goalAmount: number
}

/**
 * 2단계 참여의 ③ — 확정 (contracts §4 · R8).
 *
 * `Funding` 행을 **예약과 같은 자리에서 다시 잠근다.** 이유는 두 가지다:
 *  ① 조기 성사 판정(`paidTotal`)이 다른 확정과 교차하면 두 확정이 서로를 못 보고 **아무도**
 *     목표 도달을 알아채지 못한다(둘 다 목표 미만을 읽는다) — 조기 성사가 통째로 누락된다.
 *  ② 잠금이 있으면 목표에 닿는 확정은 정확히 하나이므로 `settleFunding()` 도 1회다.
 *
 * 🔑 **대사(reconcile)**: 결제가 나가는 사이 예약이 만료 해제(행 삭제)됐을 수 있다. 이때
 *    `RESERVED → PAID` 조건부 UPDATE 는 0행이다. 여기서 실패로 되돌리면 **돈은 나갔는데
 *    기록이 없다** — M3 `lib/dal/payment.ts` 의 판단("결제는 이미 일어났으므로 기록을 잃는
 *    편이 훨씬 나쁘다")을 그대로 따라 같은 id 로 `PAID` 행을 되살리고 기록을 남긴다.
 *    되살린 사실은 로그로 남긴다 — 잔여가 잠시 목표를 넘을 수 있고, 그 정리는 정산(D) 몫이다.
 */
export async function finalizeContributionPaid(input: {
  contributionId: string
  fundingId: string
  contributorId: string
  amount: number
  reservedUntil: Date
  organizerId: string
  providerTxId: string
  paidAt: Date
  notificationPayload: FundingContributionNotificationPayload
}): Promise<FinalizeContributionResult> {
  return prisma.$transaction(async (tx) => {
    const funding = await lockFunding(tx, input.fundingId)

    const { transitioned } = await transitionContribution(input.contributionId, 'RESERVED', 'PAID', {
      db: tx,
      data: { paidAt: input.paidAt },
    })

    let restored = false
    let alreadyPaid = false

    if (!transitioned) {
      const existing = await tx.fundingContribution.findUnique({
        where: { id: input.contributionId },
        select: { status: true },
      })

      if (existing === null) {
        console.error(
          '[dal/funding-contribute] 결제 성공 뒤 예약이 사라져 있었다 — 같은 id 로 PAID 복원(대사)',
          input.contributionId,
        )
        await tx.fundingContribution.create({
          data: {
            id: input.contributionId,
            fundingId: input.fundingId,
            contributorId: input.contributorId,
            amount: input.amount,
            status: 'PAID',
            reservedUntil: input.reservedUntil,
            paidAt: input.paidAt,
          },
        })
        restored = true
      } else if (existing.status === 'PAID') {
        // 같은 확정이 이미 지나갔다 — 기록·알림을 두 번 만들지 않는다
        alreadyPaid = true
      } else {
        console.error(
          '[dal/funding-contribute] 확정 시점 상태가 RESERVED 가 아니었다 — 상태는 그대로 두고 기록만 남긴다',
          { contributionId: input.contributionId, status: existing.status },
        )
      }
    }

    if (!alreadyPaid) {
      await tx.payment.create({
        data: {
          // 명시적으로 넣는다 — @default 에 기대면 default 없는 정본에서 NOT NULL 위반이 난다
          provider: 'portone',
          fundingContributionId: input.contributionId,
          amount: input.amount,
          status: 'PAID',
          providerTxId: input.providerTxId,
          paidAt: input.paidAt,
        },
      })

      // R8 — 주최자 알림은 **확정 트랜잭션 안**이다. 밖에 두면 "확정은 됐는데 알림이 없다"가 난다
      await tx.notification.create({
        data: {
          userId: input.organizerId,
          type: 'FUNDING_CONTRIBUTION_RECEIVED',
          payload: input.notificationPayload,
        },
      })
    }

    return {
      restored,
      alreadyPaid,
      paidTotal: await paidTotal(tx, input.fundingId),
      goalAmount: funding?.goalAmount ?? 0,
    }
  }, TX_OPTIONS)
}

/** `cancelReservation` 의 소유자·상태 판정용 원시 행 (contracts §4) */
export type CancelTarget = { contributorId: string; status: ContributionStatus }

export async function findContributionForCancel(contributionId: string): Promise<CancelTarget | null> {
  return prisma.fundingContribution.findUnique({
    where: { id: contributionId },
    select: { contributorId: true, status: true },
  })
}
