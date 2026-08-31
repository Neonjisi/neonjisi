/**
 * T009 — lib/config/gift.ts 단위 테스트
 * 계약: specs/003-gift-request-payment/research.md R11
 *
 * PRD: "설정 가능해야 하며 실서비스 배포 시 조정" — 협업 규칙 §6 이 하드코딩을 금지한다.
 * 값을 읽는 곳이 흩어지면 기본값이 파일마다 달라진다. 읽기는 이 헬퍼 하나로 모은다.
 *
 * 잘못된 값은 조용히 기본값으로 떨어지지 않는다 — TTL 오타가 기본값으로 흡수되면
 * "5분이라고 설정했는데 왜 5분이지"를 아무도 눈치채지 못한 채 시연에 들어간다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GIFT_CONFIG_DEFAULTS,
  getPaymentMaxAttempts,
  getPaymentRetryWindowMs,
  getPortOneMode,
  getRespondTtlMs,
  parseDuration,
  respondDueAtFrom,
  retryUntilFrom,
} from '@/lib/config/gift'

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

  it('앞뒤 공백은 허용한다 — .env 편집 중에 흔히 붙는다', () => {
    expect(parseDuration(' 5m ')).toBe(5 * MINUTE)
  })

  it('단위 없는 숫자를 거부한다 — 초인지 밀리초인지가 읽는 사람마다 다르다', () => {
    expect(() => parseDuration('300')).toThrow()
  })

  it('0 이하와 형식 오류를 거부한다', () => {
    expect(() => parseDuration('0m')).toThrow()
    expect(() => parseDuration('-5m')).toThrow()
    expect(() => parseDuration('5분')).toThrow()
    expect(() => parseDuration('')).toThrow()
  })
})

describe('getRespondTtlMs', () => {
  it('env 가 비면 기본값 5분이다', () => {
    vi.stubEnv('GIFT_RESPOND_TTL', '')
    expect(getRespondTtlMs()).toBe(5 * MINUTE)
    expect(GIFT_CONFIG_DEFAULTS.respondTtl).toBe('5m')
  })

  it('env 값을 읽는다', () => {
    vi.stubEnv('GIFT_RESPOND_TTL', '30m')
    expect(getRespondTtlMs()).toBe(30 * MINUTE)
  })

  it('잘못된 값이면 기본값으로 떨어지지 않고 변수 이름과 함께 던진다', () => {
    vi.stubEnv('GIFT_RESPOND_TTL', '5분')
    expect(() => getRespondTtlMs()).toThrow(/GIFT_RESPOND_TTL/)
  })
})

describe('getPaymentRetryWindowMs', () => {
  it('env 가 비면 기본값 24시간이다', () => {
    vi.stubEnv('GIFT_PAYMENT_RETRY_WINDOW', '')
    expect(getPaymentRetryWindowMs()).toBe(24 * HOUR)
  })

  it('env 값을 읽는다', () => {
    vi.stubEnv('GIFT_PAYMENT_RETRY_WINDOW', '1d')
    expect(getPaymentRetryWindowMs()).toBe(DAY)
  })
})

describe('getPaymentMaxAttempts', () => {
  it('env 가 비면 기본값 3회다', () => {
    vi.stubEnv('GIFT_PAYMENT_MAX_ATTEMPTS', '')
    expect(getPaymentMaxAttempts()).toBe(3)
  })

  it('env 값을 읽는다', () => {
    vi.stubEnv('GIFT_PAYMENT_MAX_ATTEMPTS', '5')
    expect(getPaymentMaxAttempts()).toBe(5)
  })

  it('1 미만·정수가 아닌 값을 거부한다 — 0 이면 첫 시도조차 못 한다', () => {
    vi.stubEnv('GIFT_PAYMENT_MAX_ATTEMPTS', '0')
    expect(() => getPaymentMaxAttempts()).toThrow(/GIFT_PAYMENT_MAX_ATTEMPTS/)
    vi.stubEnv('GIFT_PAYMENT_MAX_ATTEMPTS', '2.5')
    expect(() => getPaymentMaxAttempts()).toThrow(/GIFT_PAYMENT_MAX_ATTEMPTS/)
  })
})

describe('getPortOneMode', () => {
  it('env 가 비면 mock 이다 — 실결제는 명시적으로만 켜진다', () => {
    vi.stubEnv('PORTONE_MODE', '')
    expect(getPortOneMode()).toBe('mock')
  })

  it('real 을 읽는다', () => {
    vi.stubEnv('PORTONE_MODE', 'real')
    expect(getPortOneMode()).toBe('real')
  })

  it('오타를 거부한다 — mock 으로 조용히 떨어지면 실연동 스모크(T058)가 거짓 성공한다', () => {
    vi.stubEnv('PORTONE_MODE', 'production')
    expect(() => getPortOneMode()).toThrow(/PORTONE_MODE/)
  })
})

describe('절대 시각 스냅샷 (R11)', () => {
  it('respondDueAtFrom 은 기준 시각 + TTL 을 돌려준다', () => {
    vi.stubEnv('GIFT_RESPOND_TTL', '5m')
    const now = new Date('2026-08-31T12:00:00.000Z')
    expect(respondDueAtFrom(now).toISOString()).toBe('2026-08-31T12:05:00.000Z')
  })

  it('retryUntilFrom 은 기준 시각 + 재시도 기간을 돌려준다', () => {
    vi.stubEnv('GIFT_PAYMENT_RETRY_WINDOW', '24h')
    const now = new Date('2026-08-31T12:00:00.000Z')
    expect(retryUntilFrom(now).toISOString()).toBe('2026-09-01T12:00:00.000Z')
  })

  it('기준 시각을 변형하지 않는다 — 호출자의 now 가 밀려나면 스냅샷 3종이 어긋난다', () => {
    const now = new Date('2026-08-31T12:00:00.000Z')
    respondDueAtFrom(now)
    retryUntilFrom(now)
    expect(now.toISOString()).toBe('2026-08-31T12:00:00.000Z')
  })
})
