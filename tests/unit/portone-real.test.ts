/**
 * T058 — 실연동 클라이언트 단위 테스트
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §1 · research.md R1
 *
 * fetch 는 전부 스텁이다 — 단위 테스트는 네트워크에 나가지 않는다 (실서버 왕복은 T058
 * 스모크 스크립트가 PORTONE_MODE=real 로 따로 한다). 여기서 못 박는 성질:
 *
 *  ① mock 과 **같은 시그니처·같은 규약** — 실패는 결과 값, providerTxId 는 우리가 만든
 *     paymentId 그대로 (성공·실패·환불이 같은 id 로 조회된다).
 *  ② 실패 reason 은 화면(Payment.failureReason)에 닿는다 — API Secret·빌링키·결제사
 *     원문 메시지를 싣지 않는다.
 *  ③ 빌링키 **발급**은 실연동에서 서버가 하지 않는다 (FR-008) — fetch 없이 실패 값.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPortOneClient } from '@/lib/portone/client'

const API_SECRET = 'unit-test-api-secret'
const BILLING_KEY = 'billing-key-unit-test'

beforeEach(() => {
  vi.stubEnv('PORTONE_MODE', 'real')
  vi.stubEnv('PORTONE_STORE_ID', 'store-unit-test')
  vi.stubEnv('PORTONE_CHANNEL_KEY', 'channel-key-unit-test')
  vi.stubEnv('PORTONE_API_SECRET', API_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function stubFetch(status: number, body: unknown) {
  const fetchStub = vi.fn(async (...args: [string, RequestInit]) => {
    void args
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

function stubFetchNetworkError() {
  const fetchStub = vi.fn(async () => {
    throw new Error('ECONNRESET')
  })
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

describe('getPortOneClient (real)', () => {
  it('실연동 env 3종이 차 있으면 real 클라이언트를 돌려준다', () => {
    expect(() => getPortOneClient()).not.toThrow()
  })

  it('createPaymentId — 매번 다른 id, mock 접두사가 아니다', () => {
    const client = getPortOneClient()
    const ids = new Set(Array.from({ length: 100 }, () => client.createPaymentId()))
    expect(ids.size).toBe(100)
    for (const id of ids) expect(id).toMatch(/^pay_/)
  })
})

describe('chargeBillingKey (real)', () => {
  it('성공 — V2 빌링키 결제 API 를 부르고, 우리가 만든 paymentId 가 providerTxId 로 돌아온다', async () => {
    const fetchStub = stubFetch(200, { payment: { paidAt: '2026-09-01T09:30:00.000Z' } })
    const client = getPortOneClient()
    const paymentId = client.createPaymentId()

    const charged = await client.chargeBillingKey({
      billingKey: BILLING_KEY,
      paymentId,
      amount: 32000,
      orderName: '핸드크림 세트',
    })

    expect(charged.ok).toBe(true)
    if (!charged.ok) return
    expect(charged.providerTxId).toBe(paymentId)
    expect(charged.paidAt).toEqual(new Date('2026-09-01T09:30:00.000Z'))

    expect(fetchStub).toHaveBeenCalledTimes(1)
    const [url, init] = fetchStub.mock.calls[0]
    expect(url).toBe(`https://api.portone.io/payments/${paymentId}/billing-key`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`PortOne ${API_SECRET}`)
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      storeId: 'store-unit-test',
      billingKey: BILLING_KEY,
      orderName: '핸드크림 세트',
      amount: { total: 32000 },
      currency: 'KRW',
    })
  })

  it('응답에 paidAt 이 없어도 성공을 실패로 바꾸지 않는다 — 현재 시각으로 방어한다', async () => {
    stubFetch(200, {})
    const client = getPortOneClient()
    const charged = await client.chargeBillingKey({
      billingKey: BILLING_KEY,
      paymentId: client.createPaymentId(),
      amount: 1000,
      orderName: 'x',
    })
    expect(charged.ok).toBe(true)
    if (charged.ok) expect(charged.paidAt).toBeInstanceOf(Date)
  })

  it('401 은 인증 실패 — reason 에 Secret·빌링키·결제사 원문이 실리지 않는다', async () => {
    stubFetch(401, { type: 'UNAUTHORIZED', message: `secret ${API_SECRET} rejected` })
    const client = getPortOneClient()
    const charged = await client.chargeBillingKey({
      billingKey: BILLING_KEY,
      paymentId: client.createPaymentId(),
      amount: 1000,
      orderName: 'x',
    })
    expect(charged.ok).toBe(false)
    if (charged.ok) return
    expect(charged.reason).toBe('결제사 인증에 실패했습니다')
    expect(charged.reason).not.toContain(API_SECRET)
    expect(charged.reason).not.toContain(BILLING_KEY)
  })

  it('4xx 거절·5xx 장애는 실패 **값**으로 돌아온다 — 던지지 않는다', async () => {
    stubFetch(400, { type: 'BILLING_KEY_NOT_FOUND', message: 'upstream detail' })
    const client = getPortOneClient()
    const rejected = await client.chargeBillingKey({
      billingKey: BILLING_KEY,
      paymentId: client.createPaymentId(),
      amount: 1000,
      orderName: 'x',
    })
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.reason).not.toContain('upstream detail')

    stubFetch(502, null)
    const failed = await client.chargeBillingKey({
      billingKey: BILLING_KEY,
      paymentId: client.createPaymentId(),
      amount: 1000,
      orderName: 'x',
    })
    expect(failed.ok).toBe(false)
  })

  it('네트워크 예외도 { ok: false } 로 정규화된다 (contracts §1)', async () => {
    stubFetchNetworkError()
    const client = getPortOneClient()
    const charged = await client.chargeBillingKey({
      billingKey: BILLING_KEY,
      paymentId: client.createPaymentId(),
      amount: 1000,
      orderName: 'x',
    })
    expect(charged.ok).toBe(false)
  })

  it('잘못된 금액은 API 호출 없이 실패한다', async () => {
    const fetchStub = stubFetch(200, {})
    const client = getPortOneClient()
    for (const amount of [0, -1000, 1000.5]) {
      const charged = await client.chargeBillingKey({
        billingKey: BILLING_KEY,
        paymentId: client.createPaymentId(),
        amount,
        orderName: 'x',
      })
      expect(charged.ok).toBe(false)
    }
    expect(fetchStub).not.toHaveBeenCalled()
  })
})

describe('issueBillingKey (real)', () => {
  it('서버 발급은 하지 않는다 (FR-008) — API 호출 없이 실패 값으로 알린다', async () => {
    const fetchStub = stubFetch(200, {})
    const issued = await getPortOneClient().issueBillingKey({
      userId: '11111111-1111-4111-8111-111111111111',
      cardBrand: '신한',
      cardLast4: '4821',
    })
    expect(issued.ok).toBe(false)
    if (!issued.ok) expect(issued.reason).toBeTruthy()
    expect(fetchStub).not.toHaveBeenCalled()
  })
})

describe('refund (real) — M4 가 처음 실사용한다', () => {
  it('V2 취소 API 를 부른다 — providerTxId(= paymentId) 기준', async () => {
    const fetchStub = stubFetch(200, { cancellation: { cancelledAt: '2026-09-01T10:00:00.000Z' } })
    const refunded = await getPortOneClient().refund({ providerTxId: 'pay_abc123', amount: 32000 })

    expect(refunded.ok).toBe(true)
    if (refunded.ok) expect(refunded.refundedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'))

    const [url, init] = fetchStub.mock.calls[0]
    expect(url).toBe('https://api.portone.io/payments/pay_abc123/cancel')
    expect(JSON.parse(init.body as string)).toMatchObject({ amount: 32000 })
  })

  it('결제사 거절은 실패 값으로 돌아온다', async () => {
    stubFetch(409, { type: 'CANCEL_AMOUNT_EXCEEDS_CANCELLABLE_AMOUNT' })
    const refunded = await getPortOneClient().refund({ providerTxId: 'pay_abc123', amount: 32000 })
    expect(refunded.ok).toBe(false)
  })
})
