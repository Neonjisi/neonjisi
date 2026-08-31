/**
 * T010 — lib/crypto/billing-key.ts 단위 테스트
 * 계약: specs/003-gift-request-payment/research.md R10
 *
 * constitution 데이터 보호: "애플리케이션은 빌링키만 암호화해 보관한다(MUST)."
 * 빌링키는 카드 없이도 청구를 일으킬 수 있는 값이다 — DB 유출이 곧 결제 권한 유출이 된다.
 *
 * GCM 을 고른 이유가 여기 있다: 인증 태그가 붙어 **변조가 복호화 실패로 드러난다.**
 * CBC 였다면 조작된 저장값이 조용히 다른 평문으로 풀려 엉뚱한 곳에 청구가 간다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptBillingKey, encryptBillingKey } from '@/lib/crypto/billing-key'

/** 테스트 전용 고정 키 — 실키가 아니다 (32바이트 base64) */
const TEST_KEY = Buffer.alloc(32, 7).toString('base64')
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64')

const PLAIN = 'billing_key_live_abcdef0123456789'

beforeEach(() => {
  vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', TEST_KEY)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('암호화 왕복', () => {
  it('암호화한 값을 복호화하면 원래 빌링키가 나온다', () => {
    expect(decryptBillingKey(encryptBillingKey(PLAIN))).toBe(PLAIN)
  })

  it('저장값에 평문이 남지 않는다', () => {
    expect(encryptBillingKey(PLAIN)).not.toContain(PLAIN)
  })

  it('같은 값을 두 번 암호화해도 저장값이 다르다 — IV 가 매번 새로 난다', () => {
    const first = encryptBillingKey(PLAIN)
    const second = encryptBillingKey(PLAIN)
    expect(first).not.toBe(second)
    expect(decryptBillingKey(first)).toBe(PLAIN)
    expect(decryptBillingKey(second)).toBe(PLAIN)
  })

  it('빈 문자열은 암호화 대상이 아니다 — 빌링키 없는 결제수단이 저장되면 안 된다', () => {
    expect(() => encryptBillingKey('')).toThrow()
  })
})

describe('변조 검출 (GCM 인증 태그)', () => {
  it('암호문 한 글자를 바꾸면 복호화가 실패한다', () => {
    const stored = encryptBillingKey(PLAIN)
    const parts = stored.split('.')
    const cipher = parts[parts.length - 1]
    parts[parts.length - 1] = (cipher[0] === 'A' ? 'B' : 'A') + cipher.slice(1)
    expect(() => decryptBillingKey(parts.join('.'))).toThrow()
  })

  it('인증 태그를 바꾸면 복호화가 실패한다', () => {
    const parts = encryptBillingKey(PLAIN).split('.')
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1)
    expect(() => decryptBillingKey(parts.join('.'))).toThrow()
  })

  it('IV 를 바꾸면 복호화가 실패한다', () => {
    const parts = encryptBillingKey(PLAIN).split('.')
    parts[1] = (parts[1][0] === 'A' ? 'B' : 'A') + parts[1].slice(1)
    expect(() => decryptBillingKey(parts.join('.'))).toThrow()
  })

  it('다른 키로는 복호화되지 않는다 — 키 교체는 기존 저장값을 무효화한다', () => {
    const stored = encryptBillingKey(PLAIN)
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', OTHER_KEY)
    expect(() => decryptBillingKey(stored)).toThrow()
  })

  it('형식이 아닌 저장값을 거부한다 — 평문이 그대로 들어와 있으면 특히', () => {
    expect(() => decryptBillingKey(PLAIN)).toThrow()
    expect(() => decryptBillingKey('')).toThrow()
    expect(() => decryptBillingKey('v9.aaa.bbb.ccc')).toThrow()
  })
})

describe('키 설정', () => {
  it('키가 없으면 변수 이름과 함께 던진다 — 평문 저장으로 떨어지지 않는다', () => {
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', '')
    expect(() => encryptBillingKey(PLAIN)).toThrow(/BILLING_KEY_ENCRYPTION_KEY/)
  })

  it('32바이트가 아닌 키를 거부한다', () => {
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', Buffer.alloc(16, 1).toString('base64'))
    expect(() => encryptBillingKey(PLAIN)).toThrow(/BILLING_KEY_ENCRYPTION_KEY/)
  })

  it('오류 메시지에 평문·키가 실리지 않는다 — 로그가 유출 경로가 된다', () => {
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', TEST_KEY)
    let message = ''
    try {
      decryptBillingKey('v1.aaaa.bbbb.cccc')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).not.toBe('')
    expect(message).not.toContain(TEST_KEY)
    expect(message).not.toContain(PLAIN)
  })
})

describe('복호화 시 키 미설정', () => {
  it('키가 없으면 변수 이름과 함께 던진다 — 데이터 손상으로 오진하지 않게', () => {
    const stored = encryptBillingKey(PLAIN)
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', '')
    expect(() => decryptBillingKey(stored)).toThrow(/BILLING_KEY_ENCRYPTION_KEY/)
  })
})
