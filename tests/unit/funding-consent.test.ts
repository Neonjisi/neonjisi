// @vitest-environment node
/**
 * T018 검증 — 차액 부담 동의 문구 v1 placeholder (FR-004)
 * DOM 이 필요 없는 순수 로직이다 — M3 tests/unit/gift-consent.test.ts 와 같은 이유로
 * node 환경으로 돌린다(이 머신에서 jsdom 워커 기동이 느려 타임아웃이 나는 문제 회피).
 *
 * 문구 전문을 그대로 고정한다: 한 글자라도 바뀌면 이 테스트가 깨지고, 그때
 * **FUNDING_CONSENT_VERSION 을 함께 올리는 것**이 리뷰 체크 항목이다(M4-J-BRIEFING
 * "전 세션 공통" — 차액 동의 문구 수정 시 버전 업). S 의 T002 확정 전 placeholder 이므로,
 * 문구·버전·이 테스트를 T002 확정 시 함께 갱신한다.
 */
import { describe, expect, it } from 'vitest'
import {
  FUNDING_CONSENT_VERSION,
  fundingConsentSentences,
  fundingConsentStatement,
} from '@/lib/funding/consent'

describe('차액 부담 동의 문구 (T018 · placeholder)', () => {
  it('v1 전문이 지금 코드 그대로다 — 바꾸려면 FUNDING_CONSENT_VERSION 을 올려라', () => {
    expect(FUNDING_CONSENT_VERSION).toBe('1')
    expect(
      fundingConsentSentences({ receiverDisplayName: '김민수', maxBurdenAmount: 100_000 }),
    ).toEqual([
      '마감까지 목표 금액에 못 미치면, 모자란 만큼 최대 100,000원까지 제 카드로 자동 결제됩니다.',
      '김민수님에게 선물이 정상적으로 전달됩니다.',
      '결제 결과는 별도로 알려드립니다.',
    ])
  })

  it('FR-004 의 필수 요소가 담긴다 — 최대 부담액(숫자) · 수령자 표시명', () => {
    const statement = fundingConsentStatement({
      receiverDisplayName: '이서연',
      maxBurdenAmount: 1_234_567,
    })
    expect(statement).toContain('1,234,567원')
    expect(statement).toContain('이서연님에게')
    expect(statement).toContain('자동 결제됩니다')
  })
})
