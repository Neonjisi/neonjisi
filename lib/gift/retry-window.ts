import { getPaymentMaxAttempts } from '@/lib/config/gift'
import type { GiftNotificationEntry, GiftNotificationPayload } from '@/lib/dal/notification'
import { cancelExpiredRetry, getChargeTarget, type ChargeTarget } from '@/lib/dal/payment'
import { retryAvailabilityOf } from '@/lib/gift/outcome'
import { assertTransition } from '@/lib/gift/state'

/**
 * 재시도 기한의 **지연 평가** (FR-031·FR-032) — 만료(research R3)와 같은 방식이다.
 *
 * **왜 필요한가.** 취소 확정은 원래 "실패한 시도가 마지막이었을 때"만 일어났다. 그래서 주는
 * 사람이 재시도를 **하지 않으면** 요청이 `PAYMENT_FAILED` 로 영영 남고, 수령자는 FR-032 의
 * 취소 고지를 받지 못한다 — 승인까지 해놓고 소식이 끊기는, 도메인 모델이 최악이라고 부른
 * 그 상황이다. 배치를 두지 않기로 한 이상(R3), 판정은 **조회·시도 시점**에 해야 한다.
 *
 * 부르는 곳: 결과·복구 화면의 조회(lib/dal/gift-outcome.ts)와 재시도 액션.
 * 확정은 조건부 UPDATE 라서 동시에 여러 번 불려도 고지는 한 번씩이다.
 *
 * ⚠️ J 의 `evaluateExpiry()`(T015)가 응답 마감을 맡는 것과 짝이다. 둘 다 "조회가 판정
 *    트리거"라는 같은 규칙 위에 있다 — T021 이 오면 선물 조회 진입점에서 함께 불러야 한다.
 */

export type RetryExpiryOutcome = 'CANCELLED' | 'UNCHANGED'

export async function evaluateRetryExpiry(giftRequestId: string): Promise<RetryExpiryOutcome> {
  const target = await getChargeTarget(giftRequestId)
  // 조회 경로에서 불리므로 던지지 않는다 — 없는 요청은 화면이 404 로 처리한다
  if (target === null || target.status !== 'PAYMENT_FAILED') return 'UNCHANGED'

  const availability = retryAvailabilityOf(
    {
      status: target.status,
      attemptCount: target.paymentAttemptCount,
      maxAttempts: getPaymentMaxAttempts(),
      retryUntil: target.paymentRetryUntil,
    },
    new Date(),
  )
  if (availability.canRetry) return 'UNCHANGED'

  assertTransition('PAYMENT_FAILED', 'CANCELLED')
  const { cancelled } = await cancelExpiredRetry({
    giftRequestId,
    cancelledAt: new Date(),
    // FR-032 — 양쪽 고지. 수령자 고지는 누락될 수 없다
    notifications: [
      notificationFor(target, target.giverId),
      notificationFor(target, target.receiverId),
    ],
  })

  return cancelled ? 'CANCELLED' : 'UNCHANGED'
}

/** payload 는 받는 사람 기준의 표시용 스냅샷이다 (charge 와 같은 형태) */
function notificationFor(target: ChargeTarget, userId: string): GiftNotificationEntry {
  const payload: GiftNotificationPayload = {
    giftRequestId: target.giftRequestId,
    counterpartDisplayName:
      userId === target.giverId ? target.receiverDisplayName : target.giverDisplayName,
    productName: target.orderName,
    amount: target.amount,
  }
  return { userId, type: 'GIFT_CANCELLED_BY_PAYMENT', payload }
}
