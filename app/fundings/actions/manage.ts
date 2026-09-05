'use server'

import { z } from 'zod'
import { failure, guarded, type ActionResult } from '@/app/fundings/actions/shared'
import { getPaymentMaxAttempts } from '@/lib/config/gift'
import { findFundingForManage, setOrganizerPaymentMethod } from '@/lib/dal/funding-settle'
import { isMyActivePaymentMethod } from '@/lib/dal/payment-method'
import { verifySession } from '@/lib/dal/session'
import { settleFunding, type SettleOutcome } from '@/lib/funding/settle'
import { transitionFunding } from '@/lib/funding/state'

/**
 * 펀딩 관리 Server Action (T031 · US3) — 주최자만 부른다.
 * 계약: specs/004-group-funding/contracts/server-actions.md §4 `cancelFunding` · `retryFundingTopup`
 *
 * 둘 다 **정산을 부르기만 한다.** 환불·차액 결제·정산 알림은 전부 `settleFunding()`(contracts §2) 안이다 —
 * 여기서 상태·환불·알림에 손대면 두 번 나간다. 이 파일이 하는 일은 소유자·상태 검사와, 취소의 경우
 * OPEN→CANCELLED 조건부 전이 한 줄, 재시도의 경우 결제수단 변경 한 줄이다.
 *
 * revalidatePath 를 부르지 않는다: 펀딩 화면은 전부 세션 의존 동적 라우트라 다음 요청에서 새로 읽는다
 * (④ contribute.ts 와 같은 규약).
 */

export type ManageOutcome = SettleOutcome['outcome']

export type CancelFundingErrorCode = 'NOT_ORGANIZER' | 'NOT_OPEN' | 'STORAGE_FAILED'
export type RetryTopupErrorCode = 'NOT_ORGANIZER' | 'NOT_RETRYABLE' | 'RETRY_EXPIRED' | 'STORAGE_FAILED'

const CANCEL_FAILED_MESSAGE = '펀딩을 취소하지 못했어요. 잠시 후 다시 시도해주세요.'
const RETRY_FAILED_MESSAGE = '차액 결제를 다시 시도하지 못했어요. 잠시 후 다시 시도해주세요.'
const NOT_ORGANIZER_MESSAGE = '이 펀딩을 관리할 수 없어요.'
const NOT_OPEN_MESSAGE = '진행 중인 펀딩만 취소할 수 있어요.'
const NOT_RETRYABLE_MESSAGE = '지금은 차액 결제를 다시 시도할 수 없어요.'
const RETRY_EXPIRED_MESSAGE = '재시도 기한이 지나 펀딩이 취소되었어요.'
const UNUSABLE_METHOD_MESSAGE = '사용할 수 있는 결제수단이 아니에요.'

// Server Action 은 클라이언트가 임의 페이로드로 호출할 수 있으므로 형식을 먼저 거른다 (④ 와 같은 스키마)
const uuidSchema = z.string().uuid()

/**
 * 주최자 취소 — 검사 순서 (바꾸면 오답):
 *   1. 세션 + **주최자 본인** — 부재·남의 펀딩·형식 불량은 같은 NOT_ORGANIZER (존재를 흘리면 id 탐색에 힌트가 된다)
 *   2. status = OPEN — 아니면 NOT_OPEN
 *   3. 마감이 지난 OPEN 은 취소 대상이 아니라 **정산 대상**이다 (R1 — 조회가 트리거). 먼저 정산시키고 NOT_OPEN.
 *      없으면 최소 달성 금액을 넘긴 펀딩을 주최자가 마감 뒤에 뒤집을 수 있다.
 *   4. OPEN→CANCELLED 조건부 전이 (state.ts 관문) — 0행이면 다른 흐름(정산)이 먼저 지나갔다 → NOT_OPEN
 *   5. settleFunding() — 환불·구분 고지는 전부 그 안 (FR-017·FR-018)
 */
export async function cancelFunding(input: {
  fundingId: string
}): Promise<ActionResult<{ outcome: ManageOutcome }>> {
  const { userId } = await verifySession()

  return guarded(CANCEL_FAILED_MESSAGE, async () => {
    const parsed = uuidSchema.safeParse(input?.fundingId)
    if (!parsed.success) return failure({ code: 'NOT_ORGANIZER', message: NOT_ORGANIZER_MESSAGE })
    const fundingId = parsed.data

    const target = await findFundingForManage(fundingId)
    if (target === null || target.organizerId !== userId) {
      return failure({ code: 'NOT_ORGANIZER', message: NOT_ORGANIZER_MESSAGE })
    }
    if (target.status !== 'OPEN') return failure({ code: 'NOT_OPEN', message: NOT_OPEN_MESSAGE })

    if (target.deadline.getTime() < Date.now()) {
      await settleFunding(fundingId)
      return failure({ code: 'NOT_OPEN', message: NOT_OPEN_MESSAGE })
    }

    const { transitioned } = await transitionFunding(fundingId, 'OPEN', 'CANCELLED')
    if (!transitioned) return failure({ code: 'NOT_OPEN', message: NOT_OPEN_MESSAGE })

    // 전이 이후는 전부 settle 소유다 (contracts §2) — 여기서 환불·알림에 손대면 두 번 나간다
    const result = await settleFunding(fundingId)
    return { ok: true, data: { outcome: result.outcome } }
  })
}

/**
 * 차액 결제 재시도 — 검사 순서 (바꾸면 오답):
 *   1. 세션 + **주최자 본인** — 아니면 NOT_ORGANIZER
 *   2. status = SUCCEEDED — 아니면 NOT_RETRYABLE (끝난 펀딩엔 차액이 없다)
 *   3. 기한·횟수 — 기한이 지났으면 RETRY_EXPIRED, 횟수가 다 찼으면 NOT_RETRYABLE. 둘 다 **정산을 먼저 태워**
 *      취소·환불로 확정한다 (지연 평가 — 그대로 두면 참여자 돈이 영영 묶인다, M3 evaluateRetryExpiry 와 같은 자리)
 *   4. (수단 변경 시) 본인 소유·ACTIVE 검증 → SUCCEEDED 조건부 반영
 *   5. settleFunding({ retryTopup: true }) — **명시적 재시도만** 다음 시도를 쓴다. 이후는 전부 settle 소유
 *
 * 3을 5 뒤로 옮기면 기한이 지난 펀딩도 카드를 한 번 더 긁고 나서야 취소된다.
 */
export async function retryFundingTopup(input: {
  fundingId: string
  paymentMethodId?: string
}): Promise<ActionResult<{ outcome: ManageOutcome }>> {
  const { userId } = await verifySession()

  return guarded(RETRY_FAILED_MESSAGE, async () => {
    const parsed = uuidSchema.safeParse(input?.fundingId)
    if (!parsed.success) return failure({ code: 'NOT_ORGANIZER', message: NOT_ORGANIZER_MESSAGE })
    const fundingId = parsed.data

    const target = await findFundingForManage(fundingId)
    if (target === null || target.organizerId !== userId) {
      return failure({ code: 'NOT_ORGANIZER', message: NOT_ORGANIZER_MESSAGE })
    }
    if (target.status !== 'SUCCEEDED') {
      return failure({ code: 'NOT_RETRYABLE', message: NOT_RETRYABLE_MESSAGE })
    }

    const now = Date.now()
    if (target.topupRetryUntil !== null && now > target.topupRetryUntil.getTime()) {
      await settleFunding(fundingId)
      return failure({ code: 'RETRY_EXPIRED', message: RETRY_EXPIRED_MESSAGE })
    }
    if (target.topupAttemptCount >= getPaymentMaxAttempts()) {
      await settleFunding(fundingId)
      return failure({ code: 'NOT_RETRYABLE', message: NOT_RETRYABLE_MESSAGE })
    }

    const nextMethodId = input.paymentMethodId
    if (nextMethodId !== undefined && nextMethodId !== target.organizerPaymentMethodId) {
      const isUsable =
        uuidSchema.safeParse(nextMethodId).success && (await isMyActivePaymentMethod(userId, nextMethodId))
      if (!isUsable) return failure({ code: 'NOT_RETRYABLE', message: UNUSABLE_METHOD_MESSAGE })

      const { updated } = await setOrganizerPaymentMethod(fundingId, nextMethodId)
      // 0행 — 그새 정산이 끝났거나 취소됐다. 수단만 바꿔 놓고 카드를 긁지 않는다
      if (!updated) return failure({ code: 'NOT_RETRYABLE', message: NOT_RETRYABLE_MESSAGE })
    }

    const result = await settleFunding(fundingId, { retryTopup: true })
    return { ok: true, data: { outcome: result.outcome } }
  })
}
