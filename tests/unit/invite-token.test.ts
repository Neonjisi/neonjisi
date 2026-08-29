/**
 * T009 — lib/invite/token.ts 단위 테스트
 * 계약: specs/002-friend-taste-sharing/research.md R2
 *
 * FR-001 "추측할 수 없는 링크"의 근거가 이 토큰이다.
 *  - 32바이트(256비트) 랜덤 — 온라인 추측이 불가능한 크기
 *  - base64url — URL 에 인코딩 없이 그대로 쓴다 (`/i/<token>`)
 *  - 길이가 일정 — 43자. 화면·E2E 가 토큰을 형태로 식별한다 (tests/e2e 의 INVITE_PATH)
 */
import { describe, expect, it } from 'vitest'
import { INVITE_TOKEN_BYTES, generateInviteToken } from '@/lib/invite/token'

/** 32바이트를 패딩 없는 base64url 로 인코딩하면 ceil(32×4/3) = 43자다 */
const EXPECTED_LENGTH = 43

describe('generateInviteToken', () => {
  it('URL-safe 하다 — base64url 알파벳(A-Z a-z 0-9 - _)만 쓰고 패딩(=)이 없다', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    // encodeURIComponent 를 거쳐도 그대로다 — 링크에 인코딩 없이 쓸 수 있다는 성질을 못 박는다
    expect(encodeURIComponent(token)).toBe(token)
  })

  it('길이가 일정하다 — 32바이트 base64url 은 43자', () => {
    expect(INVITE_TOKEN_BYTES).toBe(32)
    for (let i = 0; i < 20; i++) {
      expect(generateInviteToken()).toHaveLength(EXPECTED_LENGTH)
    }
  })

  it('매번 다르다 — 1000회 생성에 중복이 없다', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateInviteToken()))
    expect(tokens.size).toBe(1000)
  })
})
