'use server'

import { z } from 'zod'
import { getFunding } from '@/lib/dal/funding'
import {
  finalizeContributionPaid,
  findContributionForCancel,
  getContributionChargeTarget,
  reserveContribution,
  type ContributionChargeTarget,
} from '@/lib/dal/funding-contribute'
import { verifySession } from '@/lib/dal/session'
import { decryptBillingKey } from '@/lib/crypto/billing-key'
import { releaseReservation } from '@/lib/funding/state'
import { settleFunding } from '@/lib/funding/settle'
import { getPortOneClient } from '@/lib/portone/client'
// D 소유 T015 — origin 에 오르기 전까지 이 import 는 미해결이다 (M4-J-BRIEFING 공통 규칙:
// "없으면 import 만 써 두고 대기"). 상대경로가 아닌 별칭인 이유: 테스트가 vi.mock 으로
// 대체하는데 mock 은 별칭 지정자에만 걸린다 (M3 respond.ts 와 같은 자리).
import { guarded, type ActionResult } from '@/app/fundings/actions/shared'

/**
 * 펀딩 참여 Server Action (T025 · US2)
 * 계약: specs/004-group-funding/contracts/server-actions.md §4 `contributeToFunding`·`cancelReservation`
 * 근거: research R2(2단계 예약·지연 해제) · R3(총액 단일 모듈) · R8(알림 경계)
 *
 * **2단계다 — 결제가 외부 호출이라 트랜잭션 안에 넣을 수 없기 때문이다.**
 *   1. 세션 + canViewFunding      아니면 NOT_ALLOWED (부재·형식 불량도 같은 답)
 *   2. [트랜잭션] FOR UPDATE 예약  status=OPEN 확인(FUNDING_CLOSED) → 잔여 검사(OVER_REMAINING)
 *                                 → RESERVED 생성. **예약이 잔여를 선점하는 것이 캡 방어다**
 *   3. [트랜잭션 밖] 결제 실행     PortOne 은 lib/portone/client.ts 만 경유 (M3 R1)
 *   4. 성공 → [트랜잭션] PAID 확정 + Payment + 주최자 알림 → 목표 도달이면 settleFunding() 1회
 *      실패 → 예약 해제 후 PAYMENT_FAILED (화면이 재시도 안내 — SCR-M4-06)
 *
 * 소유 경계(contracts §2): 조기 성사에서 `settleFunding()` 을 **부르기만** 한다. 정산 상태·
 * 환불·정산 알림 3종은 전부 settle.ts(D, T014) 안이다 — 여기서 손대면 알림이 두 번 간다.
 *
 * revalidatePath 를 부르지 않는다: 펀딩 화면은 전부 세션 의존 동적 라우트라 다음 요청에서
 * 새로 읽는다 (M2 accept-invite · M3 respond 와 같은 규약).
 */

export type ContributeErrorCode =
  | 'NOT_ALLOWED'
  | 'FUNDING_CLOSED'
  | 'OVER_REMAINING'
  // contracts §4 의 참여 실패 목록에는 없지만, Server Action 은 임의 페이로드로 호출될 수
  // 있어 금액 형식을 먼저 거른다. 같은 계약의 createFunding 코드를 재사용한다.
  | 'INVALID_AMOUNTS'
  | 'PAYMENT_FAILED'
  | 'STORAGE_FAILED'

export type CancelReservationErrorCode = 'NOT_OWNER' | 'NOT_RESERVED' | 'STORAGE_FAILED'

/**
 * 성공 결과 (contracts §4 `{ contributionId, outcome }`).
 * `GOAL_REACHED` 는 이 참여로 목표에 닿아 조기 성사가 실행됐다는 뜻이다 — 화면(SCR-M4-06)의
 * 완료 변형이 "달성했어요"를 고르는 근거다. 정산 결과 자체는 settle 소유라 여기 싣지 않는다.
 */
export type ContributeOutcome = 'PAID' | 'GOAL_REACHED'

export type ContributeSuccess = { contributionId: string; outcome: ContributeOutcome }

export type CancelReservationSuccess = { ok: true }

const NOT_ALLOWED_MESSAGE = '지금은 이 펀딩에 참여할 수 없어요.'
const FUNDING_CLOSED_MESSAGE = '이미 마감된 펀딩이에요.'
const OVER_REMAINING_MESSAGE = '남은 금액보다 큰 금액은 참여할 수 없어요.'
const INVALID_AMOUNT_MESSAGE = '참여 금액을 다시 확인해주세요.'
const PAYMENT_FAILED_MESSAGE = '결제에 실패했어요. 결제수단을 확인하고 다시 시도해주세요.'
const CONTRIBUTE_FAILED_MESSAGE = '참여를 처리하지 못했어요. 잠시 후 다시 시도해주세요.'

const NOT_OWNER_MESSAGE = '취소할 수 있는 예약이 아니에요.'
const NOT_RESERVED_MESSAGE = '이미 처리된 참여라 취소할 수 없어요.'
const CANCEL_FAILED_MESSAGE = '예약을 취소하지 못했어요. 잠시 후 다시 시도해주세요.'

/** 결제사에 갈 수 없는 상태 — 호출도 하지 않고 실패로 흐른다 (M3 charge.ts 와 같은 규약) */
const UNUSABLE_METHOD_REASON = '등록된 결제수단을 사용할 수 없습니다'

// Server Action 은 클라이언트가 임의 페이로드로 호출할 수 있으므로 형식을 먼저 거른다.
const uuidSchema = z.string().uuid()
const amountSchema = z.number().int().positive()

function fail<T>(code: ContributeErrorCode | CancelReservationErrorCode, message: string): ActionResult<T> {
  return { ok: false, error: { code, message } }
}

export async function contributeToFunding(input: {
  fundingId: string
  amount: number
}): Promise<ActionResult<ContributeSuccess>> {
  // 세션 게이트는 guarded 바깥에 둔다 (redirect 예외를 그대로 Next 에 넘긴다)
  const { userId } = await verifySession()

  return guarded(CONTRIBUTE_FAILED_MESSAGE, async () => {
    const parsedId = uuidSchema.safeParse(input.fundingId)
    if (!parsedId.success) return fail('NOT_ALLOWED', NOT_ALLOWED_MESSAGE)

    const parsedAmount = amountSchema.safeParse(input.amount)
    if (!parsedAmount.success) return fail('INVALID_AMOUNTS', INVALID_AMOUNT_MESSAGE)

    const fundingId = parsedId.data
    const amount = parsedAmount.data

    // 1. 인가 — canViewFunding 판정은 조회 DAL 소유다(R6). null 은 부재·제3자를 같은 답으로
    //    뭉갠다. 이 조회가 정산 트리거(R1)·예약 만료 해제(R2)도 함께 지난다 — 마감이 지난
    //    펀딩은 여기서 정산되어 OPEN 이 아니게 되고, 그래서 뒤늦은 참여가 끼어들지 못한다.
    const view = await getFunding(fundingId)
    if (view === null) return fail('NOT_ALLOWED', NOT_ALLOWED_MESSAGE)
    if (view.status !== 'OPEN') return fail('FUNDING_CLOSED', FUNDING_CLOSED_MESSAGE)

    // 2. 예약 — 잠금 안에서 잔여를 선점한다. 여기 통과분만 결제로 간다 (R2 ①)
    const reserved = await reserveContribution({
      fundingId,
      contributorId: userId,
      amount,
      now: new Date(),
    })
    if (!reserved.ok) {
      if (reserved.reason === 'OVER_REMAINING') return fail('OVER_REMAINING', OVER_REMAINING_MESSAGE)
      if (reserved.reason === 'FUNDING_CLOSED') return fail('FUNDING_CLOSED', FUNDING_CLOSED_MESSAGE)
      return fail('NOT_ALLOWED', NOT_ALLOWED_MESSAGE)
    }

    // 3. 결제 — 트랜잭션 밖 (R2 ②)
    const target = await getContributionChargeTarget(reserved.contributionId)
    if (target === null) {
      // 예약 직후 행이 사라지는 경우(만료 해제·펀딩 삭제) — 결제하지 않고 실패로 끝낸다
      return fail('PAYMENT_FAILED', PAYMENT_FAILED_MESSAGE)
    }

    const paymentId = getPortOneClient().createPaymentId()
    const charged = await attemptCharge(target, paymentId)

    if (!charged.ok) {
      // 4-실패. 예약을 해제해 잔여를 즉시 되돌린다 — 남겨두면 TTL 동안 잔여가 잠긴다.
      // 실패한 시도는 Payment 로 남기지 않는다: 해제가 행 삭제라서, FK
      // (payment_funding_contribution_fk)가 붙은 Payment 가 있으면 삭제가 막혀 예약이
      // 영영 잔여를 잡는다. M3 의 FR-033(실패 시도 기록)은 대상 행이 남는 선물 요청 얘기다.
      await releaseReservation(reserved.contributionId)
      return fail('PAYMENT_FAILED', PAYMENT_FAILED_MESSAGE)
    }

    // 4-성공. 확정·Payment·주최자 알림이 한 트랜잭션이다 (R8)
    const finalized = await finalizeContributionPaid({
      contributionId: reserved.contributionId,
      fundingId,
      contributorId: userId,
      amount,
      reservedUntil: reserved.reservedUntil,
      organizerId: target.organizerId,
      providerTxId: charged.providerTxId,
      paidAt: charged.paidAt,
      notificationPayload: {
        fundingId,
        contributorDisplayName: target.contributorDisplayName,
        productName: target.orderName,
        amount,
      },
    })

    // 조기 성사 (R1·R2 ③) — 확정 잠금 안에서 읽은 합계라 목표에 닿는 확정은 정확히 하나다.
    // 호출 뒤 상태·환불·정산 알림에 손대지 않는다 (contracts §2).
    // goalAmount 0 은 "확정 시점에 펀딩 행이 없었다"는 뜻이다 — 없는 펀딩을 정산시키지 않는다.
    const goalReached = finalized.goalAmount > 0 && finalized.paidTotal >= finalized.goalAmount
    if (goalReached) await settleFunding(fundingId)

    return {
      ok: true,
      data: {
        contributionId: reserved.contributionId,
        outcome: goalReached ? 'GOAL_REACHED' : 'PAID',
      },
    }
  })
}

/**
 * 결제사 호출. 빌링키 평문은 **이 함수 안에서만** 존재하고 반환·로그 어디에도 남지 않는다
 * (M3 R10). 복호화 실패(키 교체 등)도 예외로 새지 않는다 — 예약을 해제해 마무리해야 한다.
 */
async function attemptCharge(
  target: ContributionChargeTarget,
  paymentId: string,
): Promise<{ ok: true; providerTxId: string; paidAt: Date } | { ok: false; reason: string }> {
  if (target.encryptedBillingKey === null || target.paymentMethodStatus !== 'ACTIVE') {
    // 수단이 없거나 만료·삭제된 수단은 결제사에 가지 않는다 (등록 유도는 화면 몫)
    return { ok: false, reason: UNUSABLE_METHOD_REASON }
  }

  let billingKey: string
  try {
    billingKey = decryptBillingKey(target.encryptedBillingKey)
  } catch (e) {
    console.error('[fundings/contribute] 빌링키 복호화 실패 — 실패 경로로 마무리한다', {
      contributionId: target.contributionId,
      cause: (e as Error).message,
    })
    return { ok: false, reason: UNUSABLE_METHOD_REASON }
  }

  return getPortOneClient().chargeBillingKey({
    billingKey,
    paymentId,
    amount: target.amount,
    orderName: target.orderName,
  })
}

/**
 * 예약 취소 (contracts §4). 결제 화면을 떠난 참여자가 잔여를 즉시 되돌려 주는 길이다 —
 * 없으면 TTL(기본 5분) 동안 다른 사람이 그 금액을 참여할 수 없다.
 *
 * 부재·남의 예약은 **같은 NOT_OWNER** 로 뭉갠다 (존재를 흘리면 id 탐색에 힌트가 된다).
 * 해제 자체는 `status: 'RESERVED'` 조건부라, 확정과 경합해도 이미 결제된 건은 지워지지 않는다.
 */
export async function cancelReservation(input: {
  contributionId: string
}): Promise<ActionResult<CancelReservationSuccess>> {
  const { userId } = await verifySession()

  return guarded(CANCEL_FAILED_MESSAGE, async () => {
    const parsed = uuidSchema.safeParse(input.contributionId)
    if (!parsed.success) return fail('NOT_OWNER', NOT_OWNER_MESSAGE)

    const target = await findContributionForCancel(parsed.data)
    if (target === null || target.contributorId !== userId) {
      return fail('NOT_OWNER', NOT_OWNER_MESSAGE)
    }
    if (target.status !== 'RESERVED') return fail('NOT_RESERVED', NOT_RESERVED_MESSAGE)

    const { released } = await releaseReservation(parsed.data)
    // 0행 — 만료 해제나 확정이 먼저 지나갔다. 취소할 예약이 남아 있지 않다는 답은 같다
    if (!released) return fail('NOT_RESERVED', NOT_RESERVED_MESSAGE)

    return { ok: true, data: { ok: true } }
  })
}
