/**
 * 재결제 동의 문구 (T037 · US3) — spec.md Clarifications Q4 로 확정된 v1.
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4 · FR-014 · FR-015
 *
 * 동의는 자동 결제 권한 위임의 증빙이다. 그래서 문구가 코드 상수고, 요청은 생성 시점에
 * `consentVersion` 으로 "어떤 문구에 동의했는지"를 함께 기록한다 (SC-007).
 *
 * ⚠️ 문장을 한 글자라도 고치면 **반드시 CONSENT_VERSION 을 올린다** (도메인 모델 §10,
 *    리뷰 체크 항목 — team-assignment §8). 과거 버전의 문구는 이 파일의 git 이력으로
 *    복원한다 — 버전을 안 올리면 "그때 무엇에 동의했는지"가 복원 불가가 된다.
 *
 * 화면(SCR-M3-09, T040)은 `consentSentences()` 를 문단 단위로 렌더하고, 서버 액션(T038)은
 * `CONSENT_VERSION` 만 기록한다 — 문구 원문을 행마다 복사해 두지 않는 이유는 위 이력 규칙이
 * 원문 복원을 보장하기 때문이다.
 */

/** clarify Q4 v1. 문구 수정 시 버전 업 — 위 경고 참조 */
export const CONSENT_VERSION = '1'

export type ConsentInput = {
  /** 수령자 표시명 — "OO님이" 자리에 들어간다 */
  receiverDisplayName: string
  /** 요청 금액(원) — 상한을 **숫자로** 박는다 (FR-014) */
  requestedAmount: number
}

/**
 * v1 문구 — 금액 상한(숫자) · 차액 미청구·미환급 · 결제 결과 고지가 전부 담긴다 (FR-014).
 * 이름·금액은 요청마다 삽입되는 템플릿이다 (clarify Q4).
 */
export function consentSentences({ receiverDisplayName, requestedAmount }: ConsentInput): string[] {
  return [
    `${receiverDisplayName}님이 다른 상품을 고를 수 있습니다.`,
    `그 경우 ${formatWon(requestedAmount)} 이하의 상품으로 결제됩니다.`,
    '차액은 청구하지도, 돌려드리지도 않습니다.',
    '결제 결과는 알려드립니다.',
  ]
}

/** 문장 전체를 한 덩어리로 — 로그·증빙 표시용 */
export function consentStatement(input: ConsentInput): string {
  return consentSentences(input).join('\n')
}

/** "89,000원" — 한국어 로케일 천 단위 구분 (SCR-M3-09 표기) */
function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`
}
