'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { failure, guarded, type ActionResult } from '@/app/gifts/actions/shared'
import { getPaymentMaxAttempts } from '@/lib/config/gift'
import { isMyActivePaymentMethod } from '@/lib/dal/payment-method'
import { getRetryTarget, lockForRetry } from '@/lib/dal/payment'
import { verifySession } from '@/lib/dal/session'
import { chargeGiftRequest, type ChargeOutcome } from '@/lib/gift/charge'
import { assertTransition } from '@/lib/gift/state'

/**
 * 결제 재시도 Server Action — US5 (T053)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4 `retryGiftPayment`
 *
 * 검사 순서 (바꾸면 오답):
 *   1. 세션 + **giver 본인** — 아니면 NOT_OWNER (수령자에게는 실패 진행을 노출하지 않는다, FR-030)
 *   2. 재시도 가능 검사 — status=PAYMENT_FAILED · 횟수 미소진 · 기한 이내
 *                        아니면 NOT_RETRYABLE / RETRY_EXPIRED
 *   3. (수단 변경 시) 본인 소유·ACTIVE 검증
 *   4. **PAYMENT_FAILED → PAYING 재잠금** (R2). 0행이면 이미 진행 중 → NOT_RETRYABLE
 *   5. chargeGiftRequest() — 이후는 전부 T017 소유다. 상태도 결제 알림도 여기서 만지지 않는다
 *
 * 2를 4 뒤로 옮기면 기한이 지난 요청도 일단 잠긴 뒤 실패로 처리되어 **시도 횟수만 축난다.**
 */

const RETRY_FAILED_MESSAGE = '결제를 다시 시도하지 못했어요. 잠시 후 다시 시도해주세요.'
const NOT_OWNER_MESSAGE = '이 선물의 결제를 다시 시도할 수 없어요.'
const NOT_RETRYABLE_MESSAGE = '지금은 다시 시도할 수 없는 상태예요.'
const RETRY_EXPIRED_MESSAGE = '재시도 기한이 지나 취소되었어요.'

export async function retryGiftPayment(input: {
  giftRequestId: string
  paymentMethodId?: string
}): Promise<ActionResult<{ outcome: ChargeOutcome['outcome'] }>> {
  const { userId } = await verifySession()

  return guarded(RETRY_FAILED_MESSAGE, async () => {
    const giftRequestId = input?.giftRequestId
    // uuid 가 아니면 그런 요청이 있을 수 없다 — DB 까지 가지 않고 같은 답을 준다
    if (!z.uuid().safeParse(giftRequestId).success) {
      return failure({ code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE })
    }

    const target = await getRetryTarget(giftRequestId)
    // 남의 요청과 없는 요청을 **같은 응답으로** 뭉갠다 — 존재 여부가 id 탐색의 힌트가 된다
    if (target === null || target.giverId !== userId) {
      return failure({ code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE })
    }

    if (target.status !== 'PAYMENT_FAILED') {
      return failure({ code: 'NOT_RETRYABLE', message: NOT_RETRYABLE_MESSAGE })
    }
    if (target.paymentAttemptCount >= getPaymentMaxAttempts()) {
      return failure({ code: 'NOT_RETRYABLE', message: NOT_RETRYABLE_MESSAGE })
    }
    if (target.paymentRetryUntil !== null && Date.now() > target.paymentRetryUntil.getTime()) {
      return failure({ code: 'RETRY_EXPIRED', message: RETRY_EXPIRED_MESSAGE })
    }

    const nextPaymentMethodId = input.paymentMethodId
    if (nextPaymentMethodId !== undefined && nextPaymentMethodId !== target.paymentMethodId) {
      const isUsable =
        z.uuid().safeParse(nextPaymentMethodId).success &&
        (await isMyActivePaymentMethod(userId, nextPaymentMethodId))
      if (!isUsable) {
        return failure({ code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE })
      }
    }

    assertTransition('PAYMENT_FAILED', 'PAYING')
    const { locked } = await lockForRetry(giftRequestId, nextPaymentMethodId)
    if (!locked) {
      // 이미 다른 시도가 진행 중이다 — 조용히 중단하는 대신 상태를 알린다 (R2)
      return failure({ code: 'NOT_RETRYABLE', message: NOT_RETRYABLE_MESSAGE })
    }

    // 잠금 이후는 전부 T017 소유다 (contracts §2) — 여기서 상태·알림에 손대면 이중 확정이 난다
    const result = await chargeGiftRequest(giftRequestId)

    revalidatePath(`/gifts/${giftRequestId}`)
    revalidatePath('/notifications')
    revalidatePath('/')
    return { ok: true, data: { outcome: result.outcome } }
  })
}
