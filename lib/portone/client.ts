/**
 * PortOne 관문 (T013) — 계약: specs/003-gift-request-payment/contracts/server-actions.md §1
 * 근거: research.md R1 (clarify Q1 "혼합"의 구현 형태)
 *
 * **결제가 등장하는 모든 경로의 유일한 관문이다.** 다른 파일에서 PortOne API 를 직접 부르지
 * 않는다 — 실·모의 전환이 env 한 줄로 끝나려면 호출 지점이 하나여야 한다.
 *
 * 규약 셋:
 *  ① 실패는 예외가 아니라 **결과 값**이다. 타임아웃·네트워크 예외까지 여기서 정규화한다 —
 *     호출자(chargeGiftRequest, T017)는 분기 두 개만 안다.
 *  ② mock 실패 규약: **카드 뒷자리 `0000`** 으로 발급한 빌링키는 결제가 항상 실패한다.
 *     env 플래그가 아니라 카드 단위라야 한 E2E 안에서 성공과 실패를 섞을 수 있다.
 *  ③ 실연동(`PORTONE_MODE=real`)은 T058 에서 **같은 시그니처 뒤에** 붙인다.
 *
 * 서버 전용. 빌링키 평문은 chargeBillingKey 호출 직전에만 존재한다 (lib/crypto/billing-key.ts).
 */
import { randomBytes } from 'node:crypto'
import { getPortOneMode, getPortOneRealConfig } from '@/lib/config/gift'

export type IssueBillingKeyInput = {
  userId: string
  cardBrand: string
  /** mock: 폼에서 고른 4자리. `0000`이면 이후 결제가 항상 실패한다 (R1) */
  cardLast4: string
}

export type IssueBillingKeyResult =
  | { ok: true; billingKey: string }
  | { ok: false; reason: string }

export type ChargeInput = {
  /** 복호화된 값 — 호출 직전에만 존재한다. 로그·반환값에 남기지 않는다 */
  billingKey: string
  /**
   * **가맹점이 먼저 만드는 결제 id** (createPaymentId). 실 PortOne V2 도 같은 구조다 —
   * 우리가 만든 id 로 결제를 걸고, 그 id 로 조회·환불한다.
   * 시도마다 새로 만든다: 실패한 시도도 이 id 로 기록되어야 한다 (FR-033).
   */
  paymentId: string
  amount: number
  orderName: string
}

export type ChargeResult =
  | { ok: true; providerTxId: string; paidAt: Date }
  | { ok: false; reason: string }

export type RefundInput = { providerTxId: string; amount: number }

export type RefundResult = { ok: true; refundedAt: Date } | { ok: false; reason: string }

export type PortOneClient = {
  /**
   * 결제 시도 하나의 id 를 만든다. **호출 전에** 만들어 두는 이유는 실패한 시도에도
   * 기록할 id 가 있어야 하기 때문이다 — 결제사 응답을 기다렸다 만들면 실패에는 id 가 없다.
   */
  createPaymentId(): string
  issueBillingKey(input: IssueBillingKeyInput): Promise<IssueBillingKeyResult>
  chargeBillingKey(input: ChargeInput): Promise<ChargeResult>
  /** M4(환불·차액 결제)가 처음 실사용한다. 그때 인터페이스를 고치면 M3 mock 테스트가 흔들린다 */
  refund(input: RefundInput): Promise<RefundResult>
}

/** 외부 호출이 이 시간을 넘기면 실패로 끊는다 — 결제 화면이 영영 매달리지 않게 */
export const PORTONE_TIMEOUT_MS = 10_000

/**
 * 예외·타임아웃을 `{ ok: false }` 로 정규화한다 (contracts §1).
 * 실연동(T058)의 fetch 도 이 함수를 거친다.
 *
 * `reason` 은 Payment.failureReason 으로 저장되고 화면에도 닿는다 — 원인 문자열을 그대로
 * 싣지 않는다. 상세는 서버 로그에만 남긴다.
 */
export async function normalizeFailure<T extends { ok: boolean }>(
  label: string,
  run: () => Promise<T>,
  timeoutMs: number = PORTONE_TIMEOUT_MS,
): Promise<T | { ok: false; reason: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      run(),
      new Promise<{ ok: false; reason: string }>((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, reason: '결제사 응답이 없습니다 (타임아웃)' }),
          timeoutMs,
        )
      }),
    ])
  } catch (e) {
    console.error(`[portone] ${label} 호출 중 예외 — { ok: false } 로 정규화`, e)
    return { ok: false, reason: '결제사와 통신하지 못했습니다' }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const MOCK_ALWAYS_FAIL_LAST4 = '0000'
const MOCK_BILLING_KEY_PATTERN = /^mock_bk_(\d{4})_[0-9a-f]{16}$/
const MOCK_TX_PATTERN = /^mock_pay_[0-9a-f]{16}$/

function mockId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

function isChargeableAmount(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0
}

/**
 * mock 구현 — 카드번호·CVC 를 받지 않는다 (FR-008). 브랜드와 뒷자리만으로 빌링키를 만들고,
 * 뒷자리를 키에 실어 둔다: 결제 시점에는 빌링키밖에 없으므로 실패 규약을 키가 들고 있어야 한다.
 */
function createMockClient(): PortOneClient {
  return {
    createPaymentId() {
      return mockId('mock_pay')
    },

    issueBillingKey({ cardBrand, cardLast4 }) {
      return normalizeFailure('issueBillingKey', async () => {
        if (!/^\d{4}$/.test(cardLast4)) {
          return { ok: false, reason: '카드 뒷자리는 숫자 4자리여야 합니다' } as const
        }
        if (cardBrand.trim() === '') {
          return { ok: false, reason: '카드사를 선택해주세요' } as const
        }
        return { ok: true, billingKey: `mock_bk_${cardLast4}_${randomBytes(8).toString('hex')}` } as const
      })
    },

    chargeBillingKey({ billingKey, paymentId, amount }) {
      return normalizeFailure('chargeBillingKey', async () => {
        const matched = MOCK_BILLING_KEY_PATTERN.exec(billingKey)
        if (!matched) {
          // 빌링키 값 자체는 메시지에 싣지 않는다
          return { ok: false, reason: '등록되지 않은 결제수단입니다' } as const
        }
        if (!isChargeableAmount(amount)) {
          return { ok: false, reason: '결제 금액이 올바르지 않습니다' } as const
        }
        if (matched[1] === MOCK_ALWAYS_FAIL_LAST4) {
          // R1 실패 규약 — 결정론적이라 통합 테스트·E2E·시연이 실패 경로를 재현할 수 있다
          return { ok: false, reason: '카드사에서 결제를 거절했습니다' } as const
        }
        // 우리가 만든 id 를 그대로 돌려준다 — 성공·실패가 같은 id 로 조회된다
        return { ok: true, providerTxId: paymentId, paidAt: new Date() } as const
      })
    },

    refund({ providerTxId, amount }) {
      return normalizeFailure('refund', async () => {
        if (!MOCK_TX_PATTERN.test(providerTxId)) {
          return { ok: false, reason: '환불할 결제를 찾지 못했습니다' } as const
        }
        if (!isChargeableAmount(amount)) {
          return { ok: false, reason: '환불 금액이 올바르지 않습니다' } as const
        }
        return { ok: true, refundedAt: new Date() } as const
      })
    },
  }
}

// ---------------------------------------------------------------------------
// 실연동 (T058) — PortOne V2 REST API. mock 과 같은 시그니처 뒤에 붙는다 (R1).
// ---------------------------------------------------------------------------

const PORTONE_API_BASE = 'https://api.portone.io'

type PortOneApiCall = {
  method: 'POST'
  path: string
  body: Record<string, unknown>
  apiSecret: string
}

/**
 * V2 API 호출 한 번. 실패 이유는 화면(Payment.failureReason)에 닿으므로 결제사 원문을
 * 싣지 않는다 — 상세(에러 type·message)는 서버 로그에만 남는다 (contracts §1).
 */
async function callPortOneApi(call: PortOneApiCall): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  const res = await fetch(`${PORTONE_API_BASE}${call.path}`, {
    method: call.method,
    headers: {
      Authorization: `PortOne ${call.apiSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(call.body),
  })

  if (res.ok) {
    // 본문이 비거나 JSON 이 아니어도 성공은 성공이다 — 필요한 필드는 호출자가 방어적으로 읽는다
    const body = await res.json().catch(() => null)
    return { ok: true, body }
  }

  const errorBody = (await res.json().catch(() => null)) as { type?: string; message?: string } | null
  console.error(
    `[portone] ${call.path} 실패 — status=${res.status} type=${errorBody?.type ?? '?'} message=${errorBody?.message ?? '?'}`,
  )

  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: '결제사 인증에 실패했습니다' }
  }
  if (res.status >= 500) {
    return { ok: false, reason: '결제사 오류로 처리하지 못했습니다' }
  }
  return { ok: false, reason: '결제사에서 요청을 거절했습니다' }
}

/** 응답의 시각 문자열을 방어적으로 읽는다 — 형태가 예상과 달라도 결제 성공을 실패로 바꾸지 않는다 */
function readDateField(body: unknown, field: string): Date {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>
    const nested = record.payment ?? record.cancellation ?? record
    const raw = typeof nested === 'object' && nested !== null ? (nested as Record<string, unknown>)[field] : undefined
    if (typeof raw === 'string') {
      const parsed = new Date(raw)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
  }
  return new Date()
}

/**
 * 실연동 구현 (T058) — 빌링키 **결제·환불**만 서버가 한다.
 *
 * 빌링키 **발급**은 실연동에서 서버가 할 수 없다: V2 발급 API 는 카드번호·CVC 를 요구하는데
 * FR-008이 앱이 카드 정보를 만지는 것을 금지한다. 실연동 발급은 결제사 인증 창(브라우저 SDK,
 * SCR-M3-06 의 실연동 변형 — contracts 파일 지도 참고)이 빌링키를 받아온 뒤 서버는 저장만
 * 한다. 그 위젯 전환은 실서비스 시점의 후속 작업이고, 여기서는 실패 값으로 정직하게 알린다.
 */
function createRealClient(): PortOneClient {
  return {
    createPaymentId() {
      // 가맹점이 먼저 만드는 id (contracts §1) — 성공·실패·조회·환불이 전부 이 id 를 쓴다
      return `pay_${randomBytes(16).toString('hex')}`
    },

    issueBillingKey() {
      return normalizeFailure('issueBillingKey', async () => {
        return {
          ok: false,
          reason: '실연동에서는 카드 등록을 결제사 인증 창으로만 할 수 있습니다',
        } as const
      })
    },

    chargeBillingKey({ billingKey, paymentId, amount, orderName }) {
      return normalizeFailure('chargeBillingKey', async () => {
        if (!isChargeableAmount(amount)) {
          return { ok: false, reason: '결제 금액이 올바르지 않습니다' } as const
        }
        const { storeId, apiSecret } = getPortOneRealConfig()
        const called = await callPortOneApi({
          method: 'POST',
          path: `/payments/${encodeURIComponent(paymentId)}/billing-key`,
          body: {
            storeId,
            billingKey,
            orderName,
            amount: { total: amount },
            currency: 'KRW',
          },
          apiSecret,
        })
        if (!called.ok) return called
        // mock 과 같은 규약 — 우리가 만든 id 로 조회·환불한다 (V2 도 paymentId 기준이다)
        return { ok: true, providerTxId: paymentId, paidAt: readDateField(called.body, 'paidAt') } as const
      })
    },

    refund({ providerTxId, amount }) {
      return normalizeFailure('refund', async () => {
        if (!isChargeableAmount(amount)) {
          return { ok: false, reason: '환불 금액이 올바르지 않습니다' } as const
        }
        const { apiSecret } = getPortOneRealConfig()
        const called = await callPortOneApi({
          method: 'POST',
          path: `/payments/${encodeURIComponent(providerTxId)}/cancel`,
          body: { amount, reason: '선물 요청 취소' },
          apiSecret,
        })
        if (!called.ok) return called
        return { ok: true, refundedAt: readDateField(called.body, 'cancelledAt') } as const
      })
    },
  }
}

/**
 * `PORTONE_MODE` 로 mock/실연동을 고른다 (기본 mock).
 * 매 호출마다 모드를 읽는다 — 캐시하면 테스트·운영 전환이 프로세스 재시작에 묶인다.
 */
export function getPortOneClient(): PortOneClient {
  const mode = getPortOneMode()
  if (mode === 'real') {
    // 필수 설정 3종을 관문에서 먼저 검증한다 — 비어 있으면 여기서 던져 원인이 바로 드러난다.
    // (조용히 mock 으로 떨어뜨리지 않는다 — 실연동 스모크가 거짓 성공한다)
    getPortOneRealConfig()
    return createRealClient()
  }
  return createMockClient()
}
