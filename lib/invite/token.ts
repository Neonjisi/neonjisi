/**
 * 초대 링크 토큰 (T010) — 계약: specs/002-friend-taste-sharing/research.md R2
 *
 * FR-001 "추측할 수 없는 링크". UUIDv4(122비트)는 형식이 알려져 있어 스캔 대상이 되기 쉽다 —
 * 32바이트(256비트) 랜덤을 base64url 로 인코딩한다 (도메인 모델 §4). 길이 43자.
 * Node 표준 crypto 만 쓴다 — nanoid 등 의존성을 더하지 않는다.
 */

export const INVITE_TOKEN_BYTES = 32

/** 서버 전용 — 토큰 발급은 DAL(lib/dal/invite.ts)만 부른다 (R2) */
export function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_TOKEN_BYTES))
  // Node 의 'base64url' 은 패딩(=)을 붙이지 않는다 — URL 에 인코딩 없이 그대로 쓴다
  return Buffer.from(bytes).toString('base64url')
}
