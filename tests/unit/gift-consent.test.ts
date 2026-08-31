// @vitest-environment node
/**
 * T037 검증 — 재결제 동의 문구 v1 (FR-014 · FR-015 · clarify Q4)
 * DOM 이 필요 없는 순수 로직이다 — 이 머신에서 jsdom 워커 기동이 느려 타임아웃이 나는
 * 문제(베이스라인부터 존재)를 피해 node 환경으로 돌린다.
 *
 * 문구 전문을 그대로 고정한다: 한 글자라도 바뀌면 이 테스트가 깨지고, 그때
 * **CONSENT_VERSION 을 함께 올리는 것**이 리뷰 체크 항목이다 (도메인 모델 §10).
 * 버전만 올리고 문구를 안 바꾸는 것은 되지만, 문구를 바꾸고 버전을 안 올리는 것은 안 된다.
 */
import { describe, expect, it } from 'vitest'
import { CONSENT_VERSION, consentSentences, consentStatement } from '@/lib/gift/consent'

describe('재결제 동의 문구 (T037)', () => {
  it('v1 전문이 clarify Q4 확정 문구 그대로다 — 바꾸려면 CONSENT_VERSION 을 올려라', () => {
    expect(CONSENT_VERSION).toBe('1')
    expect(consentSentences({ receiverDisplayName: '김민수', requestedAmount: 89_000 })).toEqual([
      '김민수님이 다른 상품을 고를 수 있습니다.',
      '그 경우 89,000원 이하의 상품으로 결제됩니다.',
      '차액은 청구하지도, 돌려드리지도 않습니다.',
      '결제 결과는 알려드립니다.',
    ])
  })

  it('FR-014 의 필수 3요소가 담긴다 — 금액 상한(숫자) · 차액 미청구·미환급 · 결제 결과 고지', () => {
    const statement = consentStatement({ receiverDisplayName: '이서연', requestedAmount: 1_234_567 })
    expect(statement).toContain('1,234,567원 이하')
    expect(statement).toContain('차액은 청구하지도, 돌려드리지도 않습니다')
    expect(statement).toContain('결제 결과는 알려드립니다')
    expect(statement).toContain('이서연님이')
  })
})
