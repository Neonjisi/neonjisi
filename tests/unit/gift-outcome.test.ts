/**
 * T054·T055 — lib/gift/outcome.ts 단위 테스트
 * 계약: 화면 명세 SCR-M3-15 · SCR-M3-16 · FR-031
 *
 * 화면과 Server Action 이 같은 판정을 봐야 한다. 어긋나면 사용자는 "재시도" 버튼을 누르고
 * 나서야 안 된다는 걸 알게 된다 — 결제 실패 화면에서 가장 하면 안 되는 일이다.
 *
 * 막힌 이유를 구분하는 것도 문구의 정확성이다: 기한이 지난 요청을 "횟수 소진"이라고 말하면
 * 사용자는 카드를 바꾸면 될 줄 안다.
 */
import { describe, expect, it } from 'vitest'
import { resultVariantOf, retryAvailabilityOf } from '@/lib/gift/outcome'

const NOW = new Date('2026-08-31T12:00:00.000Z')
const FUTURE = new Date('2026-08-31T12:05:00.000Z')
const PAST = new Date('2026-08-31T11:55:00.000Z')

describe('resultVariantOf — 결과 화면 3변형', () => {
  it('종착 상태는 그대로 변형이 된다', () => {
    expect(resultVariantOf('PAID', PAST, NOW)).toBe('PAID')
    expect(resultVariantOf('EXPIRED', PAST, NOW)).toBe('EXPIRED')
    expect(resultVariantOf('CANCELLED', PAST, NOW)).toBe('CANCELLED')
  })

  it('마감이 지난 PENDING 은 만료로 보인다 — 만료는 지연 평가다 (R3)', () => {
    expect(resultVariantOf('PENDING', PAST, NOW)).toBe('EXPIRED')
  })

  it('아직 마감 전이거나 진행 중이면 결과 화면이 아니다', () => {
    expect(resultVariantOf('PENDING', FUTURE, NOW)).toBe('IN_PROGRESS')
    expect(resultVariantOf('PAYING', FUTURE, NOW)).toBe('IN_PROGRESS')
    // 결제 실패는 아직 끝이 아니다 — 복구 화면(SCR-M3-16)의 몫이다
    expect(resultVariantOf('PAYMENT_FAILED', PAST, NOW)).toBe('IN_PROGRESS')
  })
})

describe('retryAvailabilityOf — 재시도 가능 판정 (FR-031)', () => {
  const base = { status: 'PAYMENT_FAILED' as const, attemptCount: 1, maxAttempts: 3, retryUntil: FUTURE }

  it('실패 상태 · 횟수 남음 · 기한 이내면 재시도할 수 있다', () => {
    const availability = retryAvailabilityOf(base, NOW)
    expect(availability.canRetry).toBe(true)
    if (!availability.canRetry) return
    expect(availability.attemptsLeft).toBe(2)
  })

  it('실패 상태가 아니면 NOT_FAILED — 이미 결제된 건을 다시 긁지 않는다', () => {
    for (const status of ['PENDING', 'PAYING', 'PAID', 'EXPIRED', 'CANCELLED'] as const) {
      const availability = retryAvailabilityOf({ ...base, status }, NOW)
      expect(availability).toEqual({ canRetry: false, reason: 'NOT_FAILED' })
    }
  })

  it('횟수를 다 쓰면 ATTEMPTS_EXHAUSTED', () => {
    expect(retryAvailabilityOf({ ...base, attemptCount: 3 }, NOW)).toEqual({
      canRetry: false,
      reason: 'ATTEMPTS_EXHAUSTED',
    })
  })

  it('기한이 지나면 WINDOW_EXPIRED — 횟수가 남아 있어도', () => {
    expect(retryAvailabilityOf({ ...base, attemptCount: 1, retryUntil: PAST }, NOW)).toEqual({
      canRetry: false,
      reason: 'WINDOW_EXPIRED',
    })
  })

  it('횟수와 기한이 둘 다 소진되면 **횟수**를 이유로 든다 — 검사 순서가 문구를 정한다', () => {
    expect(retryAvailabilityOf({ ...base, attemptCount: 3, retryUntil: PAST }, NOW)).toEqual({
      canRetry: false,
      reason: 'ATTEMPTS_EXHAUSTED',
    })
  })

  it('기한이 아직 박히지 않았으면(첫 실패 직후) 기한으로 막지 않는다', () => {
    const availability = retryAvailabilityOf({ ...base, retryUntil: null }, NOW)
    expect(availability.canRetry).toBe(true)
  })
})
