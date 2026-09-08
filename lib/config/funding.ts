/**
 * M4 설정값 읽기 — 계약: specs/004-group-funding/research.md R2
 *
 * M3 선례(`lib/config/gift.ts`)와 같은 패턴(env + 기본값 + 단위 테스트, 캐시 없이 매번 읽는다)
 * 이되, funding 전용 값은 이 파일 하나로 모은다 — gift.ts 는 고치지 않는다(컨트롤러 재정).
 * 지금 이 값을 쓰는 코드(④ `contributeToFunding`, R2 예약 생성)는 이 세션 소유가 아니다 —
 * 여기서는 설정 해석만 준비해 둔다.
 *
 * 값은 호출할 때마다 읽는다(모듈 상단 캐시 금지) — 테스트가 env 를 바꿔도 먼저 import 한
 * 모듈이 낡은 값을 쥐지 않게 한다. 잘못된 값은 기본값으로 흡수하지 않고 던진다 — 오타가
 * 조용히 기본값이 되면 "TTL 을 바꿨는데 왜 그대로지"를 아무도 눈치채지 못한다.
 */

/** .env.example 과 같은 값 — env 가 비어도 개발·테스트가 그대로 돈다 */
export const FUNDING_CONFIG_DEFAULTS = {
  reservationTtl: '5m',
  /** 이전에 create-form.tsx 가 하드코딩하던 값과 같다 — 옮기는 것이지 정책을 바꾸는 게 아니다 */
  minAmountRatio: '0.7',
} as const

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
}

const DURATION_PATTERN = /^(\d+)([smhd])$/

/** '5m' · '24h' 같은 기간 문자열을 밀리초로. 단위 없는 숫자는 거부한다(gift.ts 와 동일 규칙) */
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

/** 예약 유효 시간 (R2) — 기본 5분. 잔여를 얼마나 오래 선점하는지가 여기서 정해진다 */
export function getReservationTtlMs(): number {
  const raw = readEnv('FUNDING_RESERVATION_TTL') ?? FUNDING_CONFIG_DEFAULTS.reservationTtl
  try {
    return parseDuration(raw)
  } catch (e) {
    throw new Error(`FUNDING_RESERVATION_TTL 값이 잘못됐다 — ${(e as Error).message}`)
  }
}

/** 0 < ratio ≤ 1 인 소수만 — '70%' 같은 표기는 거부한다(단위 없는 숫자를 거부하는 것과 같은 이유) */
function parseRatio(value: string): number {
  const ratio = Number(value.trim())
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1) {
    throw new Error(`비율은 0 초과 1 이하의 소수여야 한다: "${value}" (예: 0.7)`)
  }
  return ratio
}

/**
 * 최소 달성 금액 비율 (FR-002) — 기본 0.7. 개설 화면의 초기값과 `createFunding` 의
 * minAmount 생략 시 기본값이 **같은 값**을 쓰도록 여기 한 곳에 둔다.
 */
export function getMinAmountRatio(): number {
  const raw = readEnv('FUNDING_MIN_AMOUNT_RATIO') ?? FUNDING_CONFIG_DEFAULTS.minAmountRatio
  try {
    return parseRatio(raw)
  } catch (e) {
    throw new Error(`FUNDING_MIN_AMOUNT_RATIO 값이 잘못됐다 — ${(e as Error).message}`)
  }
}

/**
 * 목표 금액에서 최소 달성선을 산출한다 — **순수 함수**다(env 를 읽지 않는다).
 * 클라이언트 컴포넌트(개설 폼)도 목표 금액이 바뀔 때마다 이 함수로 다시 계산하므로,
 * 비율은 인자로 받는다 — 서버에서 `getMinAmountRatio()` 로 읽어 넘긴다.
 *
 * 결과는 항상 `0 < 반환값 ≤ goalAmount` 를 만족한다(C9·검사 3과 이중 방어) — 비율이 1 이어도
 * 목표를 넘지 않고, 목표가 1 원이어도 0 으로 내려가지 않는다. 목표가 0 이하면 산출하지 않는다.
 */
export function suggestMinAmount(goalAmount: number, ratio: number): number {
  if (!Number.isFinite(goalAmount) || goalAmount <= 0) return 0
  return Math.min(goalAmount, Math.max(1, Math.round(goalAmount * ratio)))
}

/**
 * 예약 만료 시각을 **절대 시각으로** 스냅샷한다(R2·R11 과 같은 이유) — 운영 중 TTL 을
 * 바꿔도 이미 만든 예약의 만료 시각은 흔들리지 않는다. 기준 시각은 변형하지 않는다.
 */
export function reservedUntilFrom(now: Date): Date {
  return new Date(now.getTime() + getReservationTtlMs())
}
