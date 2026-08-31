/**
 * 선물 요청 상태 전이 — 단일 모듈 (research R6 · data-model.md "상태 전이")
 *
 * ⚠️ **임시본이다.** 이 모듈은 J 의 T014·T015 소유다 (전이 전수 단위 테스트 + `evaluateExpiry()`).
 *    D 가 T017(charge)을 선행하느라 **charge 가 쓰는 전이 판정만** 먼저 옮겨 뒀다.
 *    J 의 정본이 오면 이 파일을 버리고 그쪽으로 갈아끼운다 — 만료 지연 평가(R3)는 여기 없다.
 *
 * 협업 규칙 §6: **상태를 직접 UPDATE 하지 않는다 — 전이 함수를 경유한다.**
 * 전이가 파일마다 흩어지면 조합 버그가 경계에서 샌다.
 */

export type GiftStatusValue =
  | 'PENDING'
  | 'PAYING'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'EXPIRED'
  | 'CANCELLED'

/**
 * data-model.md 의 전이표 그대로다. 표 밖의 전이는 전부 거부한다.
 * `DECLINED` 는 없다 (FR-020) — 수령자에게 거절 버튼을 주지 않는다.
 */
const ALLOWED_TRANSITIONS: Record<GiftStatusValue, readonly GiftStatusValue[]> = {
  PENDING: ['PAYING', 'EXPIRED', 'CANCELLED'],
  PAYING: ['PAID', 'PAYMENT_FAILED'],
  PAYMENT_FAILED: ['PAYING', 'CANCELLED'],
  PAID: [],
  EXPIRED: [],
  CANCELLED: [],
}

/** 종착 상태 — 여기서 나가는 전이는 없다 */
export function isTerminal(status: GiftStatusValue): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0
}

export function canTransition(from: GiftStatusValue, to: GiftStatusValue): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/**
 * 전이가 표에 없으면 던진다. 사용자 입력이 아니라 **코드의 실수**를 잡는 장치다 —
 * 예상 가능한 실패(이미 응답됨 등)는 호출자가 조건부 UPDATE 의 0행으로 판정한다 (R2).
 */
export function assertTransition(from: GiftStatusValue, to: GiftStatusValue): void {
  if (!canTransition(from, to)) {
    throw new Error(`허용되지 않은 상태 전이다: ${from} → ${to} (data-model.md 전이표)`)
  }
}
