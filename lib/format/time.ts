/**
 * 시간 표기 (US3 · SCR-M2-03 · SCR-M3-02)
 *
 * 알림 목록은 "3분 전", 링크 관리는 "5일 후 만료"로 읽는다. 둘 다 **서버에서** 문자열로
 * 만들어 화면에 내려보낸다 — 클라이언트가 다시 계산하면 서버 렌더와 1분 차이로 어긋나
 * hydration 경고가 난다.
 *
 * 순수 함수라 `now` 를 인자로 받는다. 기본값을 쓰는 쪽은 렌더 시점이 곧 기준 시각이다.
 */

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** 이보다 오래된 알림은 상대 시각 대신 날짜로 적는다 — "37일 전"은 읽히지 않는다 */
const RELATIVE_LIMIT_DAYS = 7

/**
 * 지난 시각을 상대 표기로 (FR-029 목록 정렬의 표시용).
 * 미래(시계 오차)는 '방금 전'으로 뭉갠다 — 사용자에게 보일 값이 아니다.
 */
export function formatRelativeTime(target: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - target.getTime()
  if (elapsed < MINUTE_MS) return '방금 전'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}분 전`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}시간 전`

  const days = Math.floor(elapsed / DAY_MS)
  if (days === 1) return '어제'
  if (days < RELATIVE_LIMIT_DAYS) return `${days}일 전`
  return `${target.getFullYear()}. ${target.getMonth() + 1}. ${target.getDate()}.`
}

/**
 * 남은 기간 표기 (FR-006 · SCR-M2-03의 "5일 후 만료").
 * @returns 이미 지났으면 `null` — 호출부가 "만료됨"으로 갈린다
 */
export function formatTimeUntil(target: Date, now: Date = new Date()): string | null {
  const remaining = target.getTime() - now.getTime()
  if (remaining <= 0) return null
  // 하루가 채 안 남았으면 시간 단위로 쪼개지 않는다 — "오늘 끝난다"가 필요한 전부다
  if (remaining < DAY_MS) return '오늘'
  return `${Math.floor(remaining / DAY_MS)}일 후`
}
