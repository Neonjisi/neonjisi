/**
 * T012 — lib/portone/client.ts 단위 테스트
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §1 · research.md R1
 *
 * 결제가 등장하는 모든 경로의 유일한 관문이다. 여기서 못 박는 성질 셋:
 *
 *  ① **실패는 예외가 아니라 결과 값이다** — 호출자(chargeGiftRequest)는 분기 두 개만 안다.
 *     타임아웃·네트워크 예외까지 클라이언트 안에서 { ok: false } 로 정규화한다.
 *  ② **mock 실패 규약은 카드 뒷자리 `0000`** — env 플래그가 아니라 카드 단위라야
 *     한 E2E 안에서 성공과 실패를 섞을 수 있다 (R1 Alternatives).
 *  ③ **PORTONE_MODE 오타가 mock 으로 떨어지지 않는다** — 실연동 스모크가 거짓 성공한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPortOneClient, normalizeFailure } from '@/lib/portone/client'

const USER_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.stubEnv('PORTONE_MODE', 'mock')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** 시도 id 는 호출 전에 만든다 — 실패한 시도도 이 id 로 기록되어야 한다 (FR-033) */
function newPaymentId(): string {
  return getPortOneClient().createPaymentId()
}

async function issueMockBillingKey(cardLast4: string): Promise<string> {
  const issued = await getPortOneClient().issueBillingKey({
    userId: USER_ID,
    cardBrand: '신한',
    cardLast4,
  })
  if (!issued.ok) throw new Error(`발급이 실패했다: ${issued.reason}`)
  return issued.billingKey
}

describe('issueBillingKey (mock)', () => {
  it('빌링키를 발급한다 — 매번 다른 값이다', async () => {
    const first = await issueMockBillingKey('4821')
    const second = await issueMockBillingKey('4821')
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThan(8)
  })

  it('카드번호·CVC 를 입력으로 받지 않는다 — 브랜드와 뒷자리 4자리뿐이다 (FR-008)', async () => {
    const client = getPortOneClient()
    const issued = await client.issueBillingKey({ userId: USER_ID, cardBrand: '신한', cardLast4: '4821' })
    expect(issued.ok).toBe(true)
  })

  it('뒷자리가 4자리 숫자가 아니면 실패를 돌려준다 — 던지지 않는다', async () => {
    const client = getPortOneClient()
    for (const cardLast4 of ['48', '482a', '']) {
      const issued = await client.issueBillingKey({ userId: USER_ID, cardBrand: '신한', cardLast4 })
      expect(issued.ok).toBe(false)
    }
  })

  it('브랜드가 비면 실패를 돌려준다', async () => {
    const issued = await getPortOneClient().issueBillingKey({
      userId: USER_ID,
      cardBrand: '   ',
      cardLast4: '4821',
    })
    expect(issued.ok).toBe(false)
  })
})

describe('chargeBillingKey (mock)', () => {
  it('정상 카드는 성공한다 — providerTxId 와 paidAt 이 온다', async () => {
    const billingKey = await issueMockBillingKey('4821')
    const paymentId = newPaymentId()
    const charged = await getPortOneClient().chargeBillingKey({
      billingKey,
      paymentId,
      amount: 32000,
      orderName: '핸드크림 세트',
    })

    expect(charged.ok).toBe(true)
    if (!charged.ok) return
    // 우리가 만든 id 가 그대로 돌아온다 — 성공·실패가 같은 id 로 조회된다
    expect(charged.providerTxId).toBe(paymentId)
    expect(charged.paidAt).toBeInstanceOf(Date)
  })

  it('뒷자리 0000 카드는 **항상** 실패한다 — 실패 경로를 결정론적으로 재현한다 (R1)', async () => {
    const billingKey = await issueMockBillingKey('0000')
    const client = getPortOneClient()

    for (let attempt = 0; attempt < 3; attempt++) {
      const charged = await client.chargeBillingKey({
        billingKey,
        paymentId: newPaymentId(),
        amount: 32000,
        orderName: '핸드크림 세트',
      })
      expect(charged.ok).toBe(false)
      if (!charged.ok) expect(charged.reason).toBeTruthy()
    }
  })

  it('시도마다 다른 결제 id 를 만든다 — 멱등성은 PAYING 잠금이 맡는다 (R2)', async () => {
    const billingKey = await issueMockBillingKey('4821')
    const client = getPortOneClient()
    const first = await client.chargeBillingKey({
      billingKey,
      paymentId: newPaymentId(),
      amount: 1000,
      orderName: 'x',
    })
    const second = await client.chargeBillingKey({
      billingKey,
      paymentId: newPaymentId(),
      amount: 1000,
      orderName: 'x',
    })

    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.providerTxId).not.toBe(second.providerTxId)
  })

  it('알 수 없는 빌링키·잘못된 금액은 실패 **값**으로 돌아온다 — 던지지 않는다', async () => {
    const client = getPortOneClient()
    const billingKey = await issueMockBillingKey('4821')

    const unknown = await client.chargeBillingKey({
      billingKey: 'not_a_billing_key',
      paymentId: newPaymentId(),
      amount: 1000,
      orderName: 'x',
    })
    expect(unknown.ok).toBe(false)

    for (const amount of [0, -1000, 1000.5]) {
      const charged = await client.chargeBillingKey({
        billingKey,
        paymentId: newPaymentId(),
        amount,
        orderName: 'x',
      })
      expect(charged.ok).toBe(false)
    }
  })
})

describe('refund (mock) — M4 가 처음 실사용하지만 지금 만든다 (R1)', () => {
  it('결제한 거래를 환불한다', async () => {
    const billingKey = await issueMockBillingKey('4821')
    const client = getPortOneClient()
    const charged = await client.chargeBillingKey({
      billingKey,
      paymentId: newPaymentId(),
      amount: 32000,
      orderName: 'x',
    })
    expect(charged.ok).toBe(true)
    if (!charged.ok) return

    const refunded = await client.refund({ providerTxId: charged.providerTxId, amount: 32000 })
    expect(refunded.ok).toBe(true)
    if (refunded.ok) expect(refunded.refundedAt).toBeInstanceOf(Date)
  })

  it('알 수 없는 거래 번호는 실패를 돌려준다', async () => {
    const refunded = await getPortOneClient().refund({ providerTxId: 'unknown_tx', amount: 1000 })
    expect(refunded.ok).toBe(false)
  })
})

describe('normalizeFailure — 예외·타임아웃 정규화 (contracts §1)', () => {
  it('던져진 예외를 { ok: false } 로 바꾼다', async () => {
    const result = await normalizeFailure('chargeBillingKey', async () => {
      throw new Error('ECONNRESET')
    })
    expect(result.ok).toBe(false)
  })

  it('응답이 없으면 타임아웃으로 끊는다 — 결제 화면이 영영 매달리지 않는다', async () => {
    const hangs = () => new Promise<{ ok: true }>(() => {})
    const result = await normalizeFailure('chargeBillingKey', hangs, 10)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/타임아웃/)
  })

  it('성공은 그대로 통과시킨다', async () => {
    const result = await normalizeFailure('refund', async () => ({ ok: true, value: 1 }) as const)
    expect(result).toEqual({ ok: true, value: 1 })
  })

  it('원인 문자열에 빌링키가 실리지 않는다 — 로그가 유출 경로가 된다', async () => {
    const secret = 'mock_bk_4821_deadbeef'
    const result = await normalizeFailure('chargeBillingKey', async () => {
      throw new Error(`upstream said: ${secret}`)
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).not.toContain(secret)
  })
})

describe('PORTONE_MODE 스위치', () => {
  it('env 가 비면 mock 이다 — 실결제는 명시적으로만 켜진다', async () => {
    vi.stubEnv('PORTONE_MODE', '')
    const issued = await getPortOneClient().issueBillingKey({
      userId: USER_ID,
      cardBrand: '신한',
      cardLast4: '4821',
    })
    expect(issued.ok).toBe(true)
  })

  it('real 은 아직 구현이 없다 — 조용히 mock 으로 떨어지지 않고 던진다 (T058)', () => {
    vi.stubEnv('PORTONE_MODE', 'real')
    expect(() => getPortOneClient()).toThrow(/T058|실연동/)
  })

  it('오타는 거부한다', () => {
    vi.stubEnv('PORTONE_MODE', 'mokc')
    expect(() => getPortOneClient()).toThrow(/PORTONE_MODE/)
  })
})

describe('createPaymentId — 시도마다 하나 (FR-033)', () => {
  it('매번 다른 id 를 만든다 — 시도 하나가 기록 하나다', () => {
    const client = getPortOneClient()
    const ids = new Set(Array.from({ length: 100 }, () => client.createPaymentId()))
    expect(ids.size).toBe(100)
  })

  it('실패한 결제도 그 id 로 기록할 수 있다 — 호출 전에 만들기 때문이다', async () => {
    const billingKey = await issueMockBillingKey('0000')
    const paymentId = newPaymentId()
    const charged = await getPortOneClient().chargeBillingKey({
      billingKey,
      paymentId,
      amount: 1000,
      orderName: 'x',
    })
    // 실패 결과에는 거래 번호가 없지만, 호출자는 자기가 만든 paymentId 를 남길 수 있다
    expect(charged.ok).toBe(false)
    expect(paymentId).toMatch(/^mock_pay_/)
  })
})
