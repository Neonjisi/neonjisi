import { isRedirectError } from '@/lib/actions/redirect-error'

/**
 * M2 Server Action 공통 기반 (T015)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2
 *
 * Action 파일 4개(accept-invite·invite-link·notification·friendship)가 함께 쓴다 —
 * 기반 단계에서 먼저 만들고 그 뒤로는 고치지 않는다 (team-assignment §1).
 * 'use server' 를 붙이지 않는다: use server 파일은 async 함수만 export 할 수 있다.
 *
 * 예상 가능한 실패는 예외가 아니라 결과 값으로 돌려준다 — 예외로 던지면 error.tsx 가
 * 화면을 갈아치우면서 입력 내용이 사라진다 (M1 app/taste/actions.ts 와 같은 규약).
 */

export type ActionErrorCode =
  // acceptInvite
  | 'LINK_INVALID'
  | 'SELF_INVITE'
  | 'ALREADY_FRIENDS'
  // revokeInviteLink
  | 'NOT_OWNER'
  | 'ALREADY_REVOKED'
  // removeFriend
  | 'NOT_FRIENDS'
  // 공통 — 예상 못 한 예외
  | 'STORAGE_FAILED'

export type ActionError = { code: ActionErrorCode; message: string }

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError }

export function failure<T>(error: ActionError): ActionResult<T> {
  return { ok: false, error }
}

/**
 * 게이트(세션) 이후의 본문을 감싸는 방어선 — DAL 조회를 포함해 예상 못 한 예외(DB 단절 등)를
 * STORAGE_FAILED 로 바꿔 돌려준다. 원인은 서버 로그에 남긴다.
 * redirect 예외만은 Next 가 처리해야 하므로 그대로 다시 던진다.
 */
export async function guarded<T>(
  message: string,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run()
  } catch (e) {
    if (isRedirectError(e)) throw e
    console.error('[friends/actions] 예상 못 한 예외 — STORAGE_FAILED 로 변환', e)
    return failure({ code: 'STORAGE_FAILED', message })
  }
}
