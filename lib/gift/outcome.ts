import type { GiftStatus } from '@prisma/client'

/**
 * 종착 판정 — 결과 화면(SCR-M3-15)과 복구 화면(SCR-M3-16)이 함께 쓴다 (T054·T055)
 *
 * 화면과 Server Action 이 **같은 기준**을 봐야 한다. 화면이 "재시도할 수 있어요"를 보여주는데
 * 액션이 NOT_RETRYABLE 을 돌려주면 사용자는 버튼을 누르고 나서야 안 된다는 걸 안다 —
 * 그래서 판정을 여기 한 곳에 두고 양쪽이 부른다.
 *
 * 순수 함수만 둔다. DB·세션을 모르므로 단위 테스트가 전 경우를 훑을 수 있다.
 */

/** 결과 화면의 3변형 + "아직 안 끝났다" */
export type ResultVariant = 'PAID' | 'EXPIRED' | 'CANCELLED' | 'IN_PROGRESS'

/**
 * 만료는 **지연 평가**다 (R3) — 상태가 아직 PENDING 이어도 마감이 지났으면 만료로 보인다.
 *
 * ⚠️ 여기서는 **표시만** 한다. 상태 확정과 `GIFT_EXPIRED` 알림은 J 의 `evaluateExpiry()`(T015)
 *    소유다. 그것이 붙기 전까지 결과 화면은 만료를 보여주되 DB 는 PENDING 으로 남는다.
 */
export function resultVariantOf(
  status: GiftStatus,
  respondDueAt: Date,
  now: Date,
): ResultVariant {
  if (status === 'PAID') return 'PAID'
  if (status === 'EXPIRED') return 'EXPIRED'
  if (status === 'CANCELLED') return 'CANCELLED'
  if (status === 'PENDING' && now.getTime() > respondDueAt.getTime()) return 'EXPIRED'
  return 'IN_PROGRESS'
}

/** 재시도가 막힌 이유 — 화면 문구와 액션 오류 코드가 같은 값에서 갈린다 */
export type RetryBlockedReason = 'NOT_FAILED' | 'ATTEMPTS_EXHAUSTED' | 'WINDOW_EXPIRED'

export type RetryAvailability =
  | { canRetry: true; attemptsLeft: number }
  | { canRetry: false; reason: RetryBlockedReason }

/**
 * 재시도 가능 판정 (FR-031). 검사 순서가 곧 문구의 정확성이다 —
 * 기한이 지난 요청을 "횟수 소진"이라고 말하면 사용자는 카드를 바꾸면 될 줄 안다.
 */
export function retryAvailabilityOf(
  input: {
    status: GiftStatus
    attemptCount: number
    maxAttempts: number
    retryUntil: Date | null
  },
  now: Date,
): RetryAvailability {
  if (input.status !== 'PAYMENT_FAILED') return { canRetry: false, reason: 'NOT_FAILED' }
  if (input.attemptCount >= input.maxAttempts) {
    return { canRetry: false, reason: 'ATTEMPTS_EXHAUSTED' }
  }
  if (input.retryUntil !== null && now.getTime() > input.retryUntil.getTime()) {
    return { canRetry: false, reason: 'WINDOW_EXPIRED' }
  }
  return { canRetry: true, attemptsLeft: input.maxAttempts - input.attemptCount }
}
