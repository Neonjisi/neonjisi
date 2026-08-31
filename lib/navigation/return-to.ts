/**
 * 강제 진입 복귀 경로 정리 (T032 — SCR-M3-06 · SCR-M3-08 이 재사용)
 *
 * 결제수단이 없으면 요청 플로우가 등록 화면으로 **강제 진입**시키고, 등록이 끝나면 원래
 * 있던 곳으로 돌아와야 한다 (FR-013 ②). 그 경로는 쿼리(`?returnTo=`)로 오므로 **주소를
 * 만든 사람이 정한 값**이다 — 그대로 믿고 이동하면 외부 사이트로 튕기는 열린 리다이렉트가 된다.
 * 등록 직후는 사용자가 "앱이 시킨 대로" 움직이는 순간이라 특히 눈치채기 어렵다.
 *
 * 앱 안의 절대 경로 하나만 통과시킨다. 나머지는 전부 기본 경로로 떨어뜨린다.
 */

export const DEFAULT_RETURN_TO = '/payment-methods'

const SPACE_CODE = 0x20
const DELETE_CODE = 0x7f

/**
 * 제어문자(개행·탭 등)와 역슬래시 — 브라우저마다 다르게 정규화된다.
 * 정규식 리터럴 대신 코드 포인트로 본다: 소스에 제어문자를 직접 적으면 편집기·도구를
 * 지나는 동안 눈에 보이지 않게 망가진다.
 */
function hasUnsafeCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < SPACE_CODE || code === DELETE_CODE) return true
  }
  return value.includes('\\')
}

export function safeReturnTo(
  value: string | undefined | null,
  fallback: string = DEFAULT_RETURN_TO,
): string {
  if (typeof value !== 'string' || value === '') return fallback

  // `/` 로 시작하지 않으면 상대 경로거나 스킴이 붙은 외부 주소다 (javascript: 포함)
  if (!value.startsWith('/')) return fallback
  // `//evil.com` 은 프로토콜 상대 URL — 브라우저가 외부 주소로 읽는다
  if (value.startsWith('//')) return fallback
  if (hasUnsafeCharacter(value)) return fallback

  return value
}
