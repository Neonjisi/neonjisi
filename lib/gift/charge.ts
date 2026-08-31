import { getPaymentMaxAttempts, retryUntilFrom } from '@/lib/config/gift'
import { decryptBillingKey } from '@/lib/crypto/billing-key'
import type { GiftNotificationEntry, GiftNotificationPayload } from '@/lib/dal/notification'
import {
  finalizeChargeFailure,
  finalizeChargeSuccess,
  getChargeTarget,
  type ChargeTarget,
} from '@/lib/dal/payment'
import { assertTransition } from '@/lib/gift/state'
import { getPortOneClient } from '@/lib/portone/client'

/**
 * 결제 실행 (T017) — 계약: specs/003-gift-request-payment/contracts/server-actions.md §2
 * 근거: research R7(소유 경계) · R2(잠금) · R1(PortOne) · R10(빌링키) · R11(설정값)
 *
 * **전제**: 호출자가 이미 `PENDING → PAYING`(재시도는 `PAYMENT_FAILED → PAYING`) 조건부
 * UPDATE 로 잠갔다 (R2). 이 함수는 잠긴 요청만 받는다.
 *
 * **소유**: PortOne 호출 → Payment 기록 → 상태 확정(전이 함수 경유) → 결제 알림
 * (GIFT_PAID 양쪽 / GIFT_PAYMENT_FAILED giver / 소진 시 CANCELLED + GIFT_CANCELLED_BY_PAYMENT
 * 양쪽)까지 전부 이 안이다. **호출자는 이 함수 뒤에서 상태를 만지거나 결제 알림을 보내지
 * 않는다** — 양쪽에 두면 알림이 두 번 간다 (분담표 §7).
 *
 * 🔑 잠근 뒤의 모든 경로는 반드시 상태를 확정하고 끝나야 한다. 예외로 빠져나가면 요청이
 *    `PAYING` 에 갇혀 재시도조차 못 한다 — 그래서 복호화·결제사 호출을 전부 실패 경로로
 *    정규화한다.
 */

export type ChargeOutcome =
  | { outcome: 'PAID' }
  | { outcome: 'PAYMENT_FAILED'; attemptCount: number; retryUntil: Date }
  | { outcome: 'CANCELLED' }

/** 결제사에 갈 수 없는 상태 — 호출도 하지 않고 실패로 흐른다 (FR-011 Edge Case) */
const UNUSABLE_METHOD_REASON = '등록된 결제수단을 사용할 수 없습니다'

export async function chargeGiftRequest(giftRequestId: string): Promise<ChargeOutcome> {
  const target = await getChargeTarget(giftRequestId)
  if (target === null) {
    throw new Error(`결제할 선물 요청을 찾지 못했다: ${giftRequestId}`)
  }
  if (target.status !== 'PAYING') {
    // 잠금은 호출자 몫이다 (R2). 여기까지 왔다는 것은 코드의 실수다 —
    // 조용히 넘기면 잠기지 않은 요청에 중복 청구가 난다.
    throw new Error(
      `잠기지 않은 요청에 결제를 시도했다: ${giftRequestId} (현재 ${target.status}, PAYING 이어야 한다)`,
    )
  }

  const charged = await attemptCharge(target)
  const now = new Date()

  if (charged.ok) {
    assertTransition('PAYING', 'PAID')
    await finalizeChargeSuccess({
      giftRequestId,
      amount: target.amount,
      providerTxId: charged.providerTxId,
      paidAt: charged.paidAt,
      // FR-029 — 어느 경로로 확정됐든 양쪽에 알린다
      notifications: [
        notificationFor(target, target.giverId, 'GIFT_PAID'),
        notificationFor(target, target.receiverId, 'GIFT_PAID'),
      ],
    })
    return { outcome: 'PAID' }
  }

  return finalizeFailure(target, now)
}

/**
 * 결제사 호출. 빌링키 평문은 **이 함수 안에서만** 존재하고 반환·로그 어디에도 남지 않는다 (R10).
 * 복호화 실패(키 교체 등)도 예외로 새지 않는다 — 잠긴 요청을 실패로 마무리해야 한다.
 */
async function attemptCharge(
  target: ChargeTarget,
): Promise<{ ok: true; providerTxId: string; paidAt: Date } | { ok: false; reason: string }> {
  if (target.paymentMethodStatus !== 'ACTIVE') {
    // 삭제·만료된 수단은 결제사에 가지 않는다 (FR-011 — 경고 후 삭제를 허용한 결과다)
    return { ok: false, reason: UNUSABLE_METHOD_REASON }
  }

  let billingKey: string
  try {
    billingKey = decryptBillingKey(target.encryptedBillingKey)
  } catch (e) {
    console.error('[gift/charge] 빌링키 복호화 실패 — 실패 경로로 마무리한다', {
      giftRequestId: target.giftRequestId,
      cause: (e as Error).message,
    })
    return { ok: false, reason: UNUSABLE_METHOD_REASON }
  }

  return getPortOneClient().chargeBillingKey({
    billingKey,
    amount: target.amount,
    orderName: target.orderName,
  })
}

/**
 * 실패 마무리 — 재시도를 남길지, 취소로 확정할지 (FR-031·FR-032).
 *
 * 재시도 기한은 **첫 실패 시점 + GIFT_PAYMENT_RETRY_WINDOW** 로 한 번만 박는다 (R11).
 * 실패할 때마다 다시 계산하면 기한이 계속 밀려 영원히 만료되지 않는다.
 */
async function finalizeFailure(target: ChargeTarget, now: Date): Promise<ChargeOutcome> {
  const attemptCount = target.paymentAttemptCount + 1
  const retryUntil = target.paymentRetryUntil ?? retryUntilFrom(now)
  const isExhausted = attemptCount >= getPaymentMaxAttempts() || now.getTime() > retryUntil.getTime()

  const nextStatus = isExhausted ? 'CANCELLED' : 'PAYMENT_FAILED'
  // 소진된 실패는 **두 전이의 합성**이다: PAYING → PAYMENT_FAILED → CANCELLED.
  // 전이표에 PAYING → CANCELLED 직행은 없다 (data-model.md) — 실패는 먼저 실패이고,
  // 그 실패가 마지막 기회였다는 판정이 취소를 만든다. 두 번 쓰지 않고 한 번에 확정하되
  // 허용 여부는 두 단계 모두 확인한다.
  assertTransition('PAYING', 'PAYMENT_FAILED')
  if (isExhausted) assertTransition('PAYMENT_FAILED', 'CANCELLED')

  await finalizeChargeFailure({
    giftRequestId: target.giftRequestId,
    amount: target.amount,
    nextStatus,
    attemptCount,
    retryUntil,
    failedAt: now,
    notifications: isExhausted
      ? [
          // FR-032 — 양쪽 고지. 수령자 고지는 누락될 수 없다:
          // "승인까지 해놓고 소식이 끊기는 것이 최악이다"
          notificationFor(target, target.giverId, 'GIFT_CANCELLED_BY_PAYMENT'),
          notificationFor(target, target.receiverId, 'GIFT_CANCELLED_BY_PAYMENT'),
        ]
      : // FR-030 — 실패 진행 상황은 주는 사람에게만. 수령자에게는 최종 취소 때만 알린다
        [notificationFor(target, target.giverId, 'GIFT_PAYMENT_FAILED')],
  })

  return isExhausted ? { outcome: 'CANCELLED' } : { outcome: 'PAYMENT_FAILED', attemptCount, retryUntil }
}

/** payload 는 받는 사람 기준의 표시용 스냅샷이다 — 목록이 User·Product 를 다시 읽지 않는다 */
function notificationFor(
  target: ChargeTarget,
  userId: string,
  type: GiftNotificationEntry['type'],
): GiftNotificationEntry {
  const payload: GiftNotificationPayload = {
    giftRequestId: target.giftRequestId,
    counterpartDisplayName:
      userId === target.giverId ? target.receiverDisplayName : target.giverDisplayName,
    productName: target.orderName,
    amount: target.amount,
  }
  return { userId, type, payload }
}
