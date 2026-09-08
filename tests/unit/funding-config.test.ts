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
  getMinAmountRatio,
  getReservationTtlMs,
  parseDuration,
  reservedUntilFrom,
  suggestMinAmount,
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

/**
 * 최소 달성 금액 비율 (FR-002) — 통합테스트 피드백: "비율 자동 적용을 고려해볼 필요가 있을 듯,
 * 백엔드에서 로직 짜고 프런트로 넘김".
 *
 * 이전에는 `components/funding/create-form.tsx` 가 `product.price * 0.7` 을 하드코딩해 초기값을
 * 만들었다 — ① 비율이 화면에 박혀 있어 서버가 같은 값을 못 쓰고 ② **상품 가격** 기준이라
 * 사용자가 목표 금액을 바꿔도 최소 달성선이 따라오지 않았다. 비율을 여기로 옮긴다.
 */
describe('getMinAmountRatio — 최소 달성 금액 비율 (FR-002)', () => {
  it('env 가 비면 기본값 0.7 이다 — 기존 화면 하드코딩과 같은 값', () => {
    vi.stubEnv('FUNDING_MIN_AMOUNT_RATIO', '')
    expect(getMinAmountRatio()).toBe(0.7)
    expect(FUNDING_CONFIG_DEFAULTS.minAmountRatio).toBe('0.7')
  })

  it('env 값을 읽는다', () => {
    vi.stubEnv('FUNDING_MIN_AMOUNT_RATIO', '0.5')
    expect(getMinAmountRatio()).toBe(0.5)
  })

  it('1(목표와 동일)까지 허용한다', () => {
    vi.stubEnv('FUNDING_MIN_AMOUNT_RATIO', '1')
    expect(getMinAmountRatio()).toBe(1)
  })

  it('0 이하·1 초과·숫자 아닌 값은 기본값으로 떨어지지 않고 변수 이름과 함께 던진다', () => {
    for (const bad of ['0', '-0.5', '1.5', '70%', 'abc']) {
      vi.stubEnv('FUNDING_MIN_AMOUNT_RATIO', bad)
      expect(() => getMinAmountRatio()).toThrow(/FUNDING_MIN_AMOUNT_RATIO/)
    }
  })
})

describe('suggestMinAmount — 목표 금액에서 최소 달성선을 산출한다', () => {
  it('목표 × 비율을 반올림한 정수다', () => {
    expect(suggestMinAmount(100_000, 0.7)).toBe(70_000)
    expect(suggestMinAmount(33_000, 0.7)).toBe(23_100)
  })

  it('C9 를 절대 깨지 않는다 — 목표를 넘지 않는다', () => {
    expect(suggestMinAmount(10_000, 1)).toBe(10_000)
  })

  it('0 원이 되지 않는다 — createFunding 검사 3(minAmount > 0)을 통과해야 한다', () => {
    expect(suggestMinAmount(1, 0.7)).toBe(1)
  })

  it('목표가 0 이하면 0 — 어차피 INVALID_AMOUNTS 로 걸리는 자리라 만들어내지 않는다', () => {
    expect(suggestMinAmount(0, 0.7)).toBe(0)
    expect(suggestMinAmount(-100, 0.7)).toBe(0)
  })
})
