/**
 * 차액 부담 동의 문구 (T018 · US1) — spec.md FR-004 · contracts/server-actions.md §4 검사 5.
 * 확정 문안의 원본(SSOT)은 `specs/004-group-funding/copy.md` §3 이다 (T002).
 *
 * 개설자 ≠ 수령자("친구에게" 분기)일 때만 요구된다 — 개설자=수령자면 C10 이 minAmount 를
 * goalAmount 로 강제해 차액이 구조적으로 생기지 않는다(FR-003). 그래서 개설 3스텝 중
 * 3스텝("시작 전 확인해주세요")에서만 보이고, "나에게" 분기는 2스텝에서 바로 개설된다.
 *
 * 동의는 마감 시 차액 자동 결제(US3 · FR-016)의 권한 위임 증빙이다. 그래서 문구가 코드
 * 상수고, 개설 시점에 `consentVersion` 으로 "어떤 문구에 동의했는지"를 함께 기록한다.
 *
 * ⚠️ 문장을 한 글자라도 고치면 **반드시 FUNDING_CONSENT_VERSION 을 올린다** — M4 신규 리뷰
 *    규칙(M4-J-BRIEFING "전 세션 공통"). 과거 버전의 문구는 이 파일의 git 이력으로 복원한다.
 *    `tests/unit/funding-consent.test.ts` 가 전문을 고정해 이 규칙을 강제한다.
 *
 * 문안이 **다섯 문장인 이유** — 이 문장들이 곧 증빙이므로 한 덩어리로 완결되어야 한다.
 * v1 은 최대 부담액과 환불 조건을 화면(create-form)이 별도 줄로 말했는데, 그 줄들은
 * `fundingConsentStatement()` 밖이라 "미달이면 내 부담이 없다"는 **유리한 조건이 증빙에
 * 들어가지 않았다**. 성사·미달 두 갈래를 여기서 모두 말하고, 화면의 중복 줄은 걷어냈다.
 */

/** v2 — T002 확정문. v1(placeholder)에 동의한 기록이 남아 있어 재정의하지 않고 올렸다 */
export const FUNDING_CONSENT_VERSION = '2'

export type FundingConsentInput = {
  /** 수령자 표시명 — "OO님에게" 자리에 들어간다. 개설자=수령자면 이 동의 자체가 없다 */
  receiverDisplayName: string
  /** 최소 달성 금액 — 성사·미달을 가르는 경계. 화면 용어는 "달성선"이 아니라 이것이다 */
  minAmount: number
  /** 목표 금액 — 차액 계산의 기준 */
  goalAmount: number
  /** 최대 부담액(목표 − 최소 달성 금액) — 상한을 **숫자로** 박는다 (FR-004) */
  maxBurdenAmount: number
}

/**
 * 확정 문안 (T002 · copy.md §3). 각 문장이 한 줄(`<p>`)로 렌더된다.
 *
 * 경계는 **"이상"** 이다 — FR-014 가 `결제 완료 합계 ≥ minAmount` 를 성사로 규정하므로
 * "넘으면"(초과)으로 쓰면 딱 맞게 채운 경우를 틀리게 말한다.
 */
export function fundingConsentSentences({
  receiverDisplayName,
  minAmount,
  goalAmount,
  maxBurdenAmount,
}: FundingConsentInput): string[] {
  return [
    `모인 금액이 최소 달성 금액 ${formatWon(minAmount)} 이상이면 펀딩이 성사되고, ${receiverDisplayName}님에게 선물이 전달됩니다.`,
    `펀딩이 성사되면 목표 금액 ${formatWon(goalAmount)}에서 부족한 금액을 내 결제수단으로 자동 결제하는 데 동의합니다.`,
    `내가 부담하는 금액은 최대 ${formatWon(maxBurdenAmount)}입니다.`,
    `최소 달성 금액 ${formatWon(minAmount)}을 채우지 못하면 펀딩은 취소되고, 참여 금액은 전액 환불되며 추가 부담금은 없습니다.`,
    '차액이 결제되면 결제 결과를 알림으로 알려드립니다.',
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
