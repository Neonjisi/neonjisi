import type { NotificationView } from '@/lib/dal/notification'
import { formatRelativeTime } from '@/lib/format/time'

/**
 * 알림 표시 매핑 (T056) — 계약: data-model.md "NotificationType — 6종 추가"
 *
 * 종류마다 **문구와 갈 곳**이 다르다. 그 매핑을 화면이 아니라 여기 한 곳에 둔다 —
 * 목록·배지·홈이 각자 분기하면 종류가 늘 때마다 세 곳을 고쳐야 하고, 한 곳을 빠뜨리면
 * 알림을 눌렀는데 아무 데도 가지 않는다.
 *
 * 문구는 payload 의 **스냅샷만** 쓴다 (M2 와 같은 원칙) — 목록을 그릴 때 User·Product 를
 * 다시 읽지 않는다. 관계가 해제돼도, 상품이 내려가도 지난 알림이 그대로 읽힌다.
 *
 * ⚠️ 최종 문안은 S 몫이다 (분담표 §4-S②). 여기 있는 것은 계약을 만족하는 초안이다 —
 *    특히 만료 문구는 **수령자를 탓하지 않는 사실 서술**이어야 한다.
 */

export type NotificationItem = {
  id: string
  /** 누르면 갈 곳 */
  href: string
  message: string
  createdAtLabel: string
  /** <time datetime> 용 — 기계가 읽는 정확한 값 */
  createdAtISO: string
  isRead: boolean
}

function messageAndHref(view: NotificationView): { message: string; href: string } {
  if (view.type === 'FRIEND_JOINED_VIA_LINK') {
    return {
      message: `${view.payload.friendDisplayName}님이 링크로 친구가 되었습니다`,
      href: `/friends/${view.payload.friendUserId}`,
    }
  }

  const { giftRequestId, counterpartDisplayName, productName } = view.payload
  const giftHref = `/gifts/${giftRequestId}`

  switch (view.type) {
    case 'GIFT_REQUEST_RECEIVED':
      return {
        message: `${counterpartDisplayName}님이 ${productName} 선물을 보내려고 해요`,
        href: giftHref,
      }
    case 'GIFT_COUNTERED':
      return {
        message: `${counterpartDisplayName}님이 다른 상품을 골랐어요`,
        href: giftHref,
      }
    case 'GIFT_PAID':
      return {
        message: `${counterpartDisplayName}님 선물의 결제가 완료되었어요`,
        href: `${giftHref}/result`,
      }
    case 'GIFT_PAYMENT_FAILED':
      // 이 알림은 주는 사람에게만 간다 (FR-030) — 갈 곳은 복구 화면이다
      return {
        message: '결제가 완료되지 않았어요. 다시 시도해주세요',
        href: `${giftHref}/recover`,
      }
    case 'GIFT_CANCELLED_BY_PAYMENT':
      // FR-032 — 수령자에게 닿는 유일한 실패 고지다. 무엇이 끝났는지 분명히 말한다
      return {
        message: `결제가 완료되지 않아 ${counterpartDisplayName}님 선물이 취소되었어요`,
        href: `${giftHref}/result`,
      }
    case 'GIFT_EXPIRED':
      // 수령자를 탓하지 않는 사실 서술 (분담표 §4-S② 만료 문구 지침)
      return {
        message: `${counterpartDisplayName}님에게 보낸 선물 요청의 응답 시간이 지났어요`,
        href: `${giftHref}/result`,
      }
  }
}

/** 상대 시각 문자열은 **서버에서** 만든다 — 클라이언트가 다시 계산하면 hydration 이 어긋난다 */
export function toNotificationItem(view: NotificationView, now: Date): NotificationItem {
  return {
    id: view.id,
    ...messageAndHref(view),
    createdAtLabel: formatRelativeTime(view.createdAt, now),
    createdAtISO: view.createdAt.toISOString(),
    isRead: view.readAt !== null,
  }
}
