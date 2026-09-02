/**
 * lib/config/funding.ts 단위 테스트 — 계약: specs/004-group-funding/research.md R2
 * M3 gift-config.test.ts 와 같은 패턴(env + 기본값 + 절대 시각 스냅샷).
 *
 * FUNDING_RESERVATION_TTL 오타가 기본값(5분)으로 조용히 흡수되면 "TTL 을 1분으로 줄였는데
 * 왜 여전히 5분이지" 를 아무도 눈치채지 못한 채 캡 동시성 시연에 들어간다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FUNDING_CONFIG_DEFAULTS,
  getReservationTtlMs,
  parseDuration,
  reservedUntilFrom,
} from '@/lib/config/funding'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseDuration', () => {
  it('s·m·h·d 네 단위를 밀리초로 바꾼다', () => {
    expect(parseDuration('30s')).toBe(30 * SECOND)
    expect(parseDuration('5m')).toBe(5 * MINUTE)
    expect(parseDuration('24h')).toBe(24 * HOUR)
    expect(parseDuration('2d')).toBe(2 * DAY)
  })

  it('앞뒤 공백은 허용한다', () => {
    expect(parseDuration(' 5m ')).toBe(5 * MINUTE)
  })

  it('단위 없는 숫자·0 이하·형식 오류를 거부한다', () => {
    expect(() => parseDuration('300')).toThrow()
    expect(() => parseDuration('0m')).toThrow()
    expect(() => parseDuration('-5m')).toThrow()
    expect(() => parseDuration('')).toThrow()
  })
})

describe('getReservationTtlMs', () => {
  it('env 가 비면 기본값 5분이다', () => {
    vi.stubEnv('FUNDING_RESERVATION_TTL', '')
    expect(getReservationTtlMs()).toBe(5 * MINUTE)
    expect(FUNDING_CONFIG_DEFAULTS.reservationTtl).toBe('5m')
  })

  it('env 값을 읽는다', () => {
    vi.stubEnv('FUNDING_RESERVATION_TTL', '10m')
    expect(getReservationTtlMs()).toBe(10 * MINUTE)
  })

  it('잘못된 값이면 기본값으로 떨어지지 않고 변수 이름과 함께 던진다', () => {
    vi.stubEnv('FUNDING_RESERVATION_TTL', '5분')
    expect(() => getReservationTtlMs()).toThrow(/FUNDING_RESERVATION_TTL/)
  })
})

describe('reservedUntilFrom — 절대 시각 스냅샷 (R2)', () => {
  it('기준 시각 + TTL 을 돌려준다', () => {
    vi.stubEnv('FUNDING_RESERVATION_TTL', '5m')
    const now = new Date('2026-08-31T12:00:00.000Z')
    expect(reservedUntilFrom(now).toISOString()).toBe('2026-08-31T12:05:00.000Z')
  })

  it('기준 시각을 변형하지 않는다', () => {
    const now = new Date('2026-08-31T12:00:00.000Z')
    reservedUntilFrom(now)
    expect(now.toISOString()).toBe('2026-08-31T12:00:00.000Z')
  })
})
