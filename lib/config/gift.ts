/**
 * M3 설정값 읽기 (T009) — 계약: specs/003-gift-request-payment/research.md R11
 *
 * 도메인 모델 §9 의 설정값 5종 중 M3 가 쓰는 셋 + 결제 모드(R1) 를 여기 모은다.
 * PRD: "설정 가능해야 하며 실서비스 배포 시 조정" — 협업 규칙 §6 이 하드코딩을 금지한다.
 * 읽는 곳이 흩어지면 파일마다 기본값이 달라지고, 그 차이는 시연 중에야 드러난다.
 *
 * 값은 호출할 때마다 읽는다(모듈 상단 캐시 금지) — 캐시하면 테스트가 env 를 바꿔도
 * 먼저 import 한 모듈이 낡은 값을 쥔다.
 *
 * 잘못된 값은 기본값으로 흡수하지 않고 던진다. 오타가 조용히 기본값이 되면
 * "설정했는데 왜 안 바뀌지"를 아무도 눈치채지 못한다 (M1 lib/supabase/server.ts 와 같은 규약).
 */

export type PortOneMode = 'mock' | 'real'

/** .env.example 과 같은 값을 둔다 — env 가 비어도 개발·테스트가 그대로 돈다 */
export const GIFT_CONFIG_DEFAULTS = {
  respondTtl: '5m',
  paymentRetryWindow: '24h',
  paymentMaxAttempts: 3,
  portOneMode: 'mock',
} as const

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
}

const DURATION_PATTERN = /^(\d+)([smhd])$/

/**
 * '5m' · '24h' 같은 기간 문자열을 밀리초로. 단위 없는 숫자는 거부한다 —
 * 초인지 밀리초인지가 읽는 사람마다 달라진다.
 */
export function parseDuration(value: string): number {
  const matched = DURATION_PATTERN.exec(value.trim())
  if (!matched) {
    throw new Error(`기간 형식이 아니다: "${value}" — 숫자 + 단위(s·m·h·d) 형태여야 한다 (예: 5m, 24h)`)
  }

  const amount = Number(matched[1])
  if (amount <= 0) {
    throw new Error(`기간은 0보다 커야 한다: "${value}"`)
  }

  return amount * DURATION_UNIT_MS[matched[2]]
}

/** 비어 있으면(미설정·빈 문자열) undefined — 공백만 있는 값도 미설정으로 본다 */
function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? undefined : value
}

function readDuration(name: string, fallback: string): number {
  const raw = readEnv(name) ?? fallback
  try {
    return parseDuration(raw)
  } catch (e) {
    throw new Error(`${name} 값이 잘못됐다 — ${(e as Error).message}`)
  }
}

/** 수령자 응답 제한 시간 (FR-016) — 기본 5분 */
export function getRespondTtlMs(): number {
  return readDuration('GIFT_RESPOND_TTL', GIFT_CONFIG_DEFAULTS.respondTtl)
}

/** 결제 실패 후 재시도를 받아주는 기간 (FR-030) — 기본 24시간 */
export function getPaymentRetryWindowMs(): number {
  return readDuration('GIFT_PAYMENT_RETRY_WINDOW', GIFT_CONFIG_DEFAULTS.paymentRetryWindow)
}

/** 결제 최대 시도 횟수 (FR-031) — 기본 3회. 초과하면 요청이 취소된다 */
export function getPaymentMaxAttempts(): number {
  const raw = readEnv('GIFT_PAYMENT_MAX_ATTEMPTS')
  if (raw === undefined) return GIFT_CONFIG_DEFAULTS.paymentMaxAttempts

  const parsed = Number(raw.trim())
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`GIFT_PAYMENT_MAX_ATTEMPTS 값이 잘못됐다: "${raw}" — 1 이상의 정수여야 한다`)
  }
  return parsed
}

/**
 * 결제 모드 (R1) — 기본 mock. 실결제는 명시적으로만 켜진다.
 * 오타를 mock 으로 흡수하지 않는다: 실연동 스모크(T058)가 거짓 성공한다.
 */
export function getPortOneMode(): PortOneMode {
  const raw = readEnv('PORTONE_MODE') ?? GIFT_CONFIG_DEFAULTS.portOneMode
  const mode = raw.trim()
  if (mode !== 'mock' && mode !== 'real') {
    throw new Error(`PORTONE_MODE 값이 잘못됐다: "${raw}" — mock 또는 real 이어야 한다`)
  }
  return mode
}

/**
 * 응답 마감을 **절대 시각으로** 스냅샷한다 (R11) — 운영 중 TTL 을 바꿔도
 * 이미 뜬 요청의 마감은 흔들리지 않는다. 기준 시각은 변형하지 않는다.
 */
export function respondDueAtFrom(now: Date): Date {
  return new Date(now.getTime() + getRespondTtlMs())
}

/** 재시도 기한도 같은 이유로 절대 시각 스냅샷이다 (R11) */
export function retryUntilFrom(now: Date): Date {
  return new Date(now.getTime() + getPaymentRetryWindowMs())
}
