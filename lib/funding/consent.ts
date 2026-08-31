/**
 * 차액 부담 동의 문구 (T018 · US1) — spec.md FR-004 · contracts/server-actions.md §4 검사 5.
 *
 * 개설자 ≠ 수령자("친구에게" 분기)일 때만 요구된다 — 개설자=수령자면 C10 이 minAmount 를
 * goalAmount 로 강제해 차액이 구조적으로 생기지 않는다(FR-003).
 *
 * 동의는 마감 시 차액 자동 결제(US3 · FR-016)의 권한 위임 증빙이다. 그래서 문구가 코드
 * 상수고, 개설 시점에 `consentVersion` 으로 "어떤 문구에 동의했는지"를 함께 기록한다.
 *
 * ⚠️ 문장을 한 글자라도 고치면 **반드시 FUNDING_CONSENT_VERSION 을 올린다** — M4 신규 리뷰
 *    규칙(M4-J-BRIEFING "전 세션 공통"). 과거 버전의 문구는 이 파일의 git 이력으로 복원한다.
 *
 * ⚠️ **placeholder** — S 의 T002(문구 세트 확정)가 아직이다. 최종 문안은 T002 확정 뒤
 *    이 파일에서 교체하고 버전을 올린다. M3 `lib/gift/consent.ts`(CONSENT_VERSION)와는
 *    **독립 버전**이다 — 같은 상수를 공유하지 않는다(동의 대상이 다르다: 재결제 상한 동의 vs
 *    차액 자동 결제 동의).
 */

/** placeholder v1 — S 의 T002 확정 전. 문구 수정 시 버전 업 — 위 경고 참조 */
export const FUNDING_CONSENT_VERSION = '1'

export type FundingConsentInput = {
  /** 수령자 표시명 — "OO님에게" 자리에 들어간다. 개설자=수령자면 이 동의 자체가 없다 */
  receiverDisplayName: string
  /** 최대 부담액(목표 − 달성선) — 상한을 **숫자로** 박는다 (FR-004) */
  maxBurdenAmount: number
}

/**
 * v1 문구(placeholder) — 최대 부담액(숫자) · 결제 시점 · 고지 예고가 전부 담긴다 (FR-004).
 * 이름·금액은 개설마다 삽입되는 템플릿이다.
 */
export function fundingConsentSentences({
  receiverDisplayName,
  maxBurdenAmount,
}: FundingConsentInput): string[] {
  return [
    `마감까지 목표 금액에 못 미치면, 모자란 만큼 최대 ${formatWon(maxBurdenAmount)}까지 제 카드로 자동 결제됩니다.`,
    `${receiverDisplayName}님에게 선물이 정상적으로 전달됩니다.`,
    '결제 결과는 별도로 알려드립니다.',
  ]
}

/** 문장 전체를 한 덩어리로 — 로그·증빙 표시용 */
export function fundingConsentStatement(input: FundingConsentInput): string {
  return fundingConsentSentences(input).join('\n')
}

/** "89,000원" — 한국어 로케일 천 단위 구분 (M3 lib/gift/consent.ts 와 동일한 표기) */
function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}
