import type { ActionResult } from '@/app/taste/actions'
import { isRedirectError } from '@/lib/actions/redirect-error'

/**
 * 클라이언트에서 Server Action 을 부를 때 감싸는 헬퍼 (FR-016).
 *
 * Action 은 예상 가능한 실패를 결과 값으로 돌려주지만, 호출 자체가 throw 할 수 있다 —
 * 네트워크 단절, 서버의 게이트 밖 예외 등. startTransition 안에서 await 가 거부되면
 * unhandled 로 번져 error.tsx 가 화면을 갈아치우고 폼 입력이 전부 사라진다.
 * 그런 throw 를 STORAGE_FAILED 결과로 바꿔 호출부가 같은 경로(오류 문구 + 입력 보존)로
 * 처리하게 한다. Next 의 redirect 예외만은 React 가 처리해야 하므로 다시 던진다.
 */

export const SAVE_FAILED_MESSAGE = '저장하지 못했어요. 잠시 후 다시 시도해주세요.'
export const DELETE_FAILED_MESSAGE = '삭제하지 못했어요. 잠시 후 다시 시도해주세요.'

type ActionFailure = Extract<ActionResult<never>, { ok: false }>

export async function callAction<R extends ActionResult<unknown>>(
  run: () => Promise<R>,
  message: string = SAVE_FAILED_MESSAGE,
): Promise<R | ActionFailure> {
  try {
    return await run()
  } catch (error) {
    if (isRedirectError(error)) throw error
    console.error('[callAction] Server Action 호출 실패 — STORAGE_FAILED 로 변환', error)
    return { ok: false, error: { code: 'STORAGE_FAILED', message } }
  }
}
