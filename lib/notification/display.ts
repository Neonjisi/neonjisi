import type { FundingNotificationView, NotificationView } from '@/lib/dal/notification'
import { formatRelativeTime } from '@/lib/format/time'

/**
 * 알림 표시 매핑 (T056 · M4 T032) — 계약: 003 data-model "NotificationType — 6종 추가" · 004 data-model "4종 추가"
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
 *    M4 환불 안내는 "영업일 3~5일" 로 고정한다 (004 clarify Q4 · T002) — 종류마다 달라지면 안 된다.
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

/** 금액 표기 — "30,000원". '원' 은 받침이 있어 뒤따르는 조사가 늘 '이'·'을' 이다 (josa 불필요) */
function won(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}

/** 환불 안내는 한 문장으로 고정한다 (clarify Q4) — 미달·취소·잉여 어느 경로든 같은 말이어야 한다 */
const REFUND_NOTICE = '영업일 3~5일이 걸릴 수 있어요'

const FUNDING_TYPES: ReadonlySet<string> = new Set([
  'FUNDING_CONTRIBUTION_RECEIVED',
  'FUNDING_SUCCEEDED',
  'FUNDING_FAILED_REFUNDED',
  'FUNDING_ORGANIZER_TOPUP',
])

function isFundingView(view: NotificationView): view is FundingNotificationView {
  return FUNDING_TYPES.has(view.type)
}

function messageAndHref(view: NotificationView): { message: string; href: string } {
  if (view.type === 'FRIEND_JOINED_VIA_LINK') {
    return {
      message: `${view.payload.friendDisplayName}님이 링크로 친구가 되었습니다`,
      href: `/friends/${view.payload.friendUserId}`,
    }
  }

  if (isFundingView(view)) return fundingMessageAndHref(view)

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

/**
 * 펀딩 알림 4종 (004 data-model "탭 시 이동" — 참여 발생은 상세 SCR-M4-04, 나머지 셋은 결과 SCR-M4-07).
 * payload 의 뜻은 lib/dal/notification.ts `FundingNotificationPayload` 주석에 있다 — `amount` 가 종류마다 다르다.
 * 미달과 취소는 문구에서 갈라야 한다 (FR-018) — 같은 종류(FUNDING_FAILED_REFUNDED)를 reason·cause 로 나눈다.
 */
function fundingMessageAndHref(view: FundingNotificationView): { message: string; href: string } {
  const { fundingId, productName, amount } = view.payload
  const detailHref = `/fundings/${fundingId}`
  const resultHref = `${detailHref}/result`

  switch (view.type) {
    case 'FUNDING_CONTRIBUTION_RECEIVED':
      return {
        message: `${view.payload.contributorDisplayName ?? '친구'}님이 ${productName} 펀딩에 ${won(amount)}을 보탰어요`,
        href: detailHref,
      }
    case 'FUNDING_SUCCEEDED':
      return {
        message: view.payload.receiverDisplayName
          ? `${view.payload.receiverDisplayName}님을 위한 ${productName} 펀딩이 성사되었어요`
          : `${productName} 펀딩이 성사되었어요`,
        href: resultHref,
      }
    case 'FUNDING_ORGANIZER_TOPUP':
      // "동의를 받았어도 고지는 별개다" — 얼마가 어디서 빠졌는지 분명히 말한다 (FR-016)
      return {
        message: `${productName} 펀딩 차액 ${won(amount)}이 내 결제수단으로 결제되었어요`,
        href: resultHref,
      }
    case 'FUNDING_FAILED_REFUNDED': {
      const refundTail = amount > 0 ? ` ${won(amount)}이 환불돼요. ${REFUND_NOTICE}` : ''
      if (view.payload.reason === 'SURPLUS') {
        return { message: `${productName} 펀딩이 이미 목표를 채워${refundTail}`, href: resultHref }
      }
      if (view.payload.reason === 'CANCELLED') {
        if (view.payload.cause === 'TOPUP_EXHAUSTED') {
          return {
            message: `차액 결제가 완료되지 않아 ${productName} 펀딩이 취소되었어요.${refundTail}`,
            href: resultHref,
          }
        }
        // 주최자 취소 — 미달과 다른 문구 (FR-018 · quickstart V5-2)
        return { message: `주최자가 ${productName} 펀딩을 취소했어요.${refundTail}`, href: resultHref }
      }
      // 미달 — 달성선을 탓하지 않는 사실 서술
      return { message: `${productName} 펀딩이 달성선에 못 미쳤어요.${refundTail}`, href: resultHref }
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
