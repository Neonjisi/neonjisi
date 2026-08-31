/**
 * 빌링키 앱 레벨 암호화 (T011) — 계약: specs/003-gift-request-payment/research.md R10
 *
 * constitution 데이터 보호: "애플리케이션은 빌링키만 암호화해 보관한다(MUST)."
 * 카드번호·CVC 는 mock·실연동 어느 쪽에서도 이 앱을 지나지 않는다 (FR-008).
 *
 * AES-256-GCM 을 쓴다 — 인증 태그가 있어 **변조가 복호화 실패로 드러난다.** 새 의존성 없이
 * Node 표준 crypto 로 충분하다 (M2 R2 와 같은 판단).
 *
 * 서버 전용이다. 복호화된 값은 PortOne 호출 직전에만 존재하고, 반환값·로그·에러 메시지
 * 어디에도 남기지 않는다 (contracts §1).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12 // GCM 권장 길이
const VERSION = 'v1'
const SEPARATOR = '.' // base64url 알파벳에 없는 문자라야 분해가 안전하다

const ENCRYPTION_KEY_ENV = 'BILLING_KEY_ENCRYPTION_KEY'

/**
 * 키는 호출할 때마다 읽는다 — 모듈 로드 시점에 읽으면 키가 없는 환경에서 import 만으로
 * 앱이 죽고, 테스트가 키를 바꿔도 반영되지 않는다.
 */
function getEncryptionKey(): Buffer {
  const raw = process.env[ENCRYPTION_KEY_ENV]
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      `${ENCRYPTION_KEY_ENV} 가 설정되지 않았다 — 빌링키를 평문으로 저장할 수는 없다. ` +
        '.env.local 에 32바이트 base64 키를 넣는다 (openssl rand -base64 32)',
    )
  }

  const key = Buffer.from(raw.trim(), 'base64')
  if (key.length !== KEY_BYTES) {
    // 값 자체는 절대 메시지에 싣지 않는다 — 길이만 알린다
    throw new Error(
      `${ENCRYPTION_KEY_ENV} 길이가 잘못됐다: ${key.length}바이트 — 32바이트 base64 여야 한다`,
    )
  }
  return key
}

/** 저장 형식: `v1.<iv>.<tag>.<ciphertext>` (전부 base64url) */
export function encryptBillingKey(plain: string): string {
  if (plain === '') {
    throw new Error('빈 빌링키는 암호화하지 않는다 — 청구할 수 없는 결제수단이 저장된다')
  }

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(SEPARATOR)
}

/**
 * 복호화. 변조·키 교체·형식 오류를 전부 예외로 돌려준다 — 호출자는 성공 아니면 실패다.
 * 실패 원인을 세분해 알리지 않는다: 저장값 조작자에게 힌트가 된다.
 */
export function decryptBillingKey(stored: string): string {
  const parts = stored.split(SEPARATOR)
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('빌링키 저장 형식이 아니다 — 암호화되지 않은 값이 저장됐을 수 있다')
  }

  const [, ivPart, tagPart, cipherPart] = parts
  // 키 읽기는 try 밖에 둔다 — 안에 두면 "키 미설정"이 아래 일반 실패 메시지에 묻혀
  // 설정 실수를 데이터 손상으로 오진하게 된다.
  const key = getEncryptionKey()

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(cipherPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // 원인(태그 불일치·IV 길이·키 교체)을 구분해 알리지 않는다. 원본 예외도 싣지 않는다 —
    // 스택에 키 재료가 실릴 여지를 없앤다.
    throw new Error('빌링키 복호화 실패 — 저장값이 손상됐거나 암호화 키가 바뀌었다')
  }
}
