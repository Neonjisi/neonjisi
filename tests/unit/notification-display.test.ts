/**
 * T056 — 알림 표시 매핑 단위 테스트
 * 계약: data-model.md "NotificationType — 6종 추가" (탭 시 이동 표)
 *
 * 종류가 6개 늘었다. 여기서 판정하는 것 둘:
 *  ① **모든 종류가 갈 곳을 가진다** — 매핑이 빠지면 알림을 눌렀는데 아무 일도 안 일어난다
 *  ② 문구가 **payload 스냅샷만** 쓴다 — 목록이 User·Product 를 다시 읽지 않는다는 뜻이다
 *
 * 실패 고지의 목적지가 특히 중요하다: 주는 사람은 복구 화면(SCR-M3-16)으로, 수령자의
 * 취소 고지는 결과 화면(SCR-M3-15)으로 간다 — 수령자에게 복구 화면을 열어주면 FR-030
 * ("수령자에게 실패 진행 상황을 노출하지 않는다")이 깨진다.
 */
import { describe, expect, it } from 'vitest'
import type {
  FundingNotificationView,
  GiftNotificationView,
  NotificationView,
} from '@/lib/dal/notification'
import { toNotificationItem } from '@/lib/notification/display'

const NOW = new Date('2026-08-31T12:00:00.000Z')
const CREATED_AT = new Date('2026-08-31T11:57:00.000Z')
const GIFT_ID = '33333333-3333-4333-8333-333333333333'

function giftView(type: GiftNotificationView['type']): NotificationView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type,
    payload: {
      giftRequestId: GIFT_ID,
      counterpartDisplayName: '민수',
      productName: '핸드크림 세트',
      amount: 32000,
    },
    readAt: null,
    createdAt: CREATED_AT,
  }
}

describe('toNotificationItem — 공통', () => {
  it('상대 시각을 서버에서 문자열로 만든다', () => {
    const item = toNotificationItem(giftView('GIFT_PAID'), NOW)
    expect(item.createdAtLabel).toBe('3분 전')
    expect(item.createdAtISO).toBe(CREATED_AT.toISOString())
  })

  it('readAt 이 있으면 읽은 것이다', () => {
    const view = { ...giftView('GIFT_PAID'), readAt: NOW }
    expect(toNotificationItem(view, NOW).isRead).toBe(true)
    expect(toNotificationItem(giftView('GIFT_PAID'), NOW).isRead).toBe(false)
  })
})

describe('친구 알림 (M2)', () => {
  it('친구 상세로 간다 — M2 동작이 그대로다', () => {
    const view: NotificationView = {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'FRIEND_JOINED_VIA_LINK',
      payload: {
        friendshipId: '44444444-4444-4444-8444-444444444444',
        friendUserId: '55555555-5555-4555-8555-555555555555',
        friendDisplayName: '김민수',
      },
      readAt: null,
      createdAt: CREATED_AT,
    }
    const item = toNotificationItem(view, NOW)
    expect(item.message).toBe('김민수님이 링크로 친구가 되었습니다')
    expect(item.href).toBe('/friends/55555555-5555-4555-8555-555555555555')
  })
})

describe('선물 알림 6종 (M3)', () => {
  const types: GiftNotificationView['type'][] = [
    'GIFT_REQUEST_RECEIVED',
    'GIFT_COUNTERED',
    'GIFT_PAID',
    'GIFT_PAYMENT_FAILED',
    'GIFT_CANCELLED_BY_PAYMENT',
    'GIFT_EXPIRED',
  ]

  it('6종 모두 문구와 갈 곳을 가진다 — 빠지면 눌러도 아무 일이 없다', () => {
    for (const type of types) {
      const item = toNotificationItem(giftView(type), NOW)
      expect(item.message.length).toBeGreaterThan(0)
      expect(item.href).toContain(`/gifts/${GIFT_ID}`)
    }
  })

  it('요청 도착은 상품명을 담아 상세로 보낸다', () => {
    const item = toNotificationItem(giftView('GIFT_REQUEST_RECEIVED'), NOW)
    expect(item.message).toContain('민수')
    expect(item.message).toContain('핸드크림 세트')
    expect(item.href).toBe(`/gifts/${GIFT_ID}`)
  })

  it('결제 실패는 **복구 화면**으로 — 주는 사람만 받는 알림이다 (FR-030)', () => {
    const item = toNotificationItem(giftView('GIFT_PAYMENT_FAILED'), NOW)
    expect(item.href).toBe(`/gifts/${GIFT_ID}/recover`)
  })

  it('결제 실패 취소는 결과 화면으로 — 수령자에게 닿는 유일한 실패 고지다 (FR-032)', () => {
    const item = toNotificationItem(giftView('GIFT_CANCELLED_BY_PAYMENT'), NOW)
    expect(item.href).toBe(`/gifts/${GIFT_ID}/result`)
    expect(item.message).toContain('취소')
  })

  it('만료 문구는 수령자를 탓하지 않는다 — 사실만 서술한다', () => {
    const item = toNotificationItem(giftView('GIFT_EXPIRED'), NOW)
    expect(item.message).not.toMatch(/거절|무시|응답하지 않아/)
  })
})

// ---------------------------------------------------------------------------
// M4 — 펀딩 알림 4종 (T032) · 계약: 004 data-model "NotificationType — 4종 추가" (탭 시 이동 표)
//
// 판정하는 것 둘: ① 4종 모두 문구와 갈 곳을 가진다 — 참여 발생은 상세, 나머지는 결과 화면.
// ② 같은 종류(FUNDING_FAILED_REFUNDED)라도 미달·주최자 취소·차액 상한 초과·잉여가 문구에서 갈린다 (FR-018).
// 환불 안내는 "영업일 3~5일" 로 고정한다 (clarify Q4).
// ---------------------------------------------------------------------------

const FUNDING_ID = '66666666-6666-4666-8666-666666666666'

function fundingView(
  type: FundingNotificationView['type'],
  payload: Partial<FundingNotificationView['payload']> = {},
): NotificationView {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    type,
    payload: {
      fundingId: FUNDING_ID,
      productName: '무선 이어폰',
      amount: 30000,
      ...payload,
    },
    readAt: null,
    createdAt: CREATED_AT,
  }
}

describe('펀딩 알림 4종 (M4)', () => {
  it('4종 모두 문구와 갈 곳을 가진다 — 참여 발생은 상세(SCR-M4-04), 나머지는 결과(SCR-M4-07)', () => {
    const detail = `/fundings/${FUNDING_ID}`
    const result = `${detail}/result`

    expect(toNotificationItem(fundingView('FUNDING_CONTRIBUTION_RECEIVED'), NOW).href).toBe(detail)
    expect(toNotificationItem(fundingView('FUNDING_SUCCEEDED'), NOW).href).toBe(result)
    expect(toNotificationItem(fundingView('FUNDING_FAILED_REFUNDED', { reason: 'FAILED' }), NOW).href).toBe(result)
    expect(toNotificationItem(fundingView('FUNDING_ORGANIZER_TOPUP'), NOW).href).toBe(result)
  })

  it('참여 발생 — 누가 얼마를 보탰는지 스냅샷만으로 말한다 (J 의 확정 트랜잭션 payload 형태)', () => {
    const item = toNotificationItem(
      fundingView('FUNDING_CONTRIBUTION_RECEIVED', { contributorDisplayName: '지수', amount: 20000 }),
      NOW,
    )
    expect(item.message).toBe('지수님이 무선 이어폰 펀딩에 20,000원을 보탰어요')
  })

  it('성사 — 수령자 이름이 있으면 누구를 위한 펀딩인지 말한다', () => {
    const item = toNotificationItem(
      fundingView('FUNDING_SUCCEEDED', { receiverDisplayName: '서연', amount: 100000 }),
      NOW,
    )
    expect(item.message).toBe('서연님을 위한 무선 이어폰 펀딩이 성사되었어요')
  })

  it('차액 — "동의를 받았어도 고지는 별개다": 금액을 숫자로 말한다 (FR-016)', () => {
    const item = toNotificationItem(fundingView('FUNDING_ORGANIZER_TOPUP', { amount: 30000 }), NOW)
    expect(item.message).toBe('무선 이어폰 펀딩 차액 30,000원이 내 결제수단으로 결제되었어요')
  })

  it('환불 — 미달·주최자 취소·차액 상한 초과·잉여가 문구에서 갈린다 (FR-018), 환불 안내는 한 문장 고정 (clarify Q4)', () => {
    const failed = toNotificationItem(fundingView('FUNDING_FAILED_REFUNDED', { reason: 'FAILED' }), NOW).message
    const byOrganizer = toNotificationItem(
      fundingView('FUNDING_FAILED_REFUNDED', { reason: 'CANCELLED', cause: 'ORGANIZER' }),
      NOW,
    ).message
    const byTopup = toNotificationItem(
      fundingView('FUNDING_FAILED_REFUNDED', { reason: 'CANCELLED', cause: 'TOPUP_EXHAUSTED' }),
      NOW,
    ).message
    const surplus = toNotificationItem(fundingView('FUNDING_FAILED_REFUNDED', { reason: 'SURPLUS' }), NOW).message

    expect(failed).toContain('달성선에 못 미쳤어요')
    expect(byOrganizer).toContain('주최자가 무선 이어폰 펀딩을 취소했어요')
    expect(byTopup).toContain('차액 결제가 완료되지 않아')
    expect(surplus).toContain('이미 목표를 채워')

    for (const message of [failed, byOrganizer, byTopup, surplus]) {
      expect(message).toContain('30,000원이 환불돼요')
      expect(message).toContain('영업일 3~5일')
    }
    expect(new Set([failed, byOrganizer, byTopup, surplus]).size).toBe(4)
  })

  it('환불 금액 0 — 참여 없는 전원 고지(주최자·수령자)는 환불 문장 없이 취소 사실만 말한다', () => {
    const item = toNotificationItem(
      fundingView('FUNDING_FAILED_REFUNDED', { reason: 'CANCELLED', cause: 'TOPUP_EXHAUSTED', amount: 0 }),
      NOW,
    )
    expect(item.message).toBe('차액 결제가 완료되지 않아 무선 이어폰 펀딩이 취소되었어요.')
    expect(item.message).not.toContain('환불')
  })
})
