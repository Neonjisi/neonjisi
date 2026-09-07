// @vitest-environment node
/**
 * T018 검증 — 차액 부담 동의 문구 (FR-004). 확정 문안은 T002(`specs/004-group-funding/copy.md` §3).
 * DOM 이 필요 없는 순수 로직이다 — M3 tests/unit/gift-consent.test.ts 와 같은 이유로
 * node 환경으로 돌린다(이 머신에서 jsdom 워커 기동이 느려 타임아웃이 나는 문제 회피).
 *
 * 문구 전문을 그대로 고정한다: 한 글자라도 바뀌면 이 테스트가 깨지고, 그때
 * **FUNDING_CONSENT_VERSION 을 함께 올리는 것**이 리뷰 체크 항목이다(M4-J-BRIEFING
 * "전 세션 공통" — 차액 동의 문구 수정 시 버전 업).
 *
 * v1(placeholder)에 동의한 기록이 이미 남아 있어 v1 을 재정의하지 않고 **v2 로 올렸다** —
 * 버전이 가리키는 문장이 사후에 바뀌면 "무엇에 동의했는가"를 되짚는 장치가 무의미해진다.
 */
import { describe, expect, it } from 'vitest'
import {
  FUNDING_CONSENT_VERSION,
  fundingConsentSentences,
  fundingConsentStatement,
} from '@/lib/funding/consent'

describe('차액 부담 동의 문구 (T018 · T002 확정문)', () => {
  it('v2 전문이 지금 코드 그대로다 — 바꾸려면 FUNDING_CONSENT_VERSION 을 올려라', () => {
    expect(FUNDING_CONSENT_VERSION).toBe('2')
    expect(
      fundingConsentSentences({
        receiverDisplayName: '김민수',
        minAmount: 250_000,
        goalAmount: 400_000,
        maxBurdenAmount: 150_000,
      }),
    ).toEqual([
      '모인 금액이 최소 달성 금액 250,000원 이상이면 펀딩이 성사되고, 김민수님에게 선물이 전달됩니다.',
      '펀딩이 성사되면 목표 금액 400,000원에서 부족한 금액을 내 결제수단으로 자동 결제하는 데 동의합니다.',
      '내가 부담하는 금액은 최대 150,000원입니다.',
      '최소 달성 금액 250,000원을 채우지 못하면 펀딩은 취소되고, 참여 금액은 전액 환불되며 추가 부담금은 없습니다.',
      '차액이 결제되면 결제 결과를 알림으로 알려드립니다.',
    ])
  })

  it('FR-004 의 필수 요소가 담긴다 — 최대 부담액(숫자) · 수령자 표시명', () => {
    const statement = fundingConsentStatement({
      receiverDisplayName: '이서연',
      minAmount: 1_000_000,
      goalAmount: 2_234_567,
      maxBurdenAmount: 1_234_567,
    })
    expect(statement).toContain('1,234,567원')
    expect(statement).toContain('이서연님에게')
    expect(statement).toContain('자동 결제하는 데 동의합니다')
  })

  /**
   * v1 의 결함이 되돌아오지 않게 막는다 (copy.md §3 "왜 고치는가").
   * v1 은 "목표 금액에 못 미치면 … 자동 결제"라고만 해서 **미달인 경우까지 개설자가
   * 부담하는 것처럼** 읽혔다. 차액 자동 결제(FR-016)의 권한 위임 증빙이라, 동의한 범위가
   * 실제 청구 범위와 어긋나면 안 된다.
   */
  it('성사·미달 두 갈래를 모두 말한다 — 미달이면 추가 부담이 없다는 것이 증빙에 들어간다', () => {
    const statement = fundingConsentStatement({
      receiverDisplayName: '이서연',
      minAmount: 250_000,
      goalAmount: 400_000,
      maxBurdenAmount: 150_000,
    })
    expect(statement).toContain('채우지 못하면')
    expect(statement).toContain('전액 환불되며 추가 부담금은 없습니다')
  })

  /**
   * FR-014 는 `결제 완료 합계 >= minAmount` 를 성사로 규정한다.
   * "넘으면"은 초과(`>`)로 읽혀서 딱 맞게 채운 경우를 틀리게 말한다.
   */
  it('경계를 "이상"으로 말한다 — "넘으면"이 아니다 (FR-014)', () => {
    const statement = fundingConsentStatement({
      receiverDisplayName: '이서연',
      minAmount: 250_000,
      goalAmount: 400_000,
      maxBurdenAmount: 150_000,
    })
    expect(statement).toContain('250,000원 이상이면')
    expect(statement).not.toContain('넘으면')
  })
})
