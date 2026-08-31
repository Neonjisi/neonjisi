import { isRedirectError } from '@/lib/actions/redirect-error'

/**
 * M3 Server Action 공통 기반 (T018)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4
 *
 * M2 app/friends/actions/shared.ts 를 그대로 이식한다. Action 파일 다섯
 * (gifts/actions/request·respond·payment · payment-methods/actions · events/actions)이
 * 함께 쓴다 — **기반 단계에서 먼저 만들고 그 뒤로는 아무도 고치지 않는다**
 * (team-assignment §1). 스토리 중에 여기를 고치면 US 셋이 같은 파일에서 부딪힌다.
 * 'use server' 를 붙이지 않는다: use server 파일은 async 함수만 export 할 수 있다.
 *
 * 예상 가능한 실패는 예외가 아니라 결과 값으로 돌려준다. 결제 경로에서 특히 중요하다 —
 * 예외로 새면 error.tsx 가 화면을 갈아치우고, 사용자는 결제가 됐는지 안 됐는지 알 수 없다.
 */

export type ActionErrorCode =
  // createGiftRequest (T038)
  | 'NOT_FRIENDS'
  | 'NO_PAYMENT_METHOD'
  | 'PRODUCT_UNWANTED'
  | 'PRODUCT_UNAVAILABLE'
  | 'SELF_GIFT'
  | 'CONSENT_REQUIRED'
  // cancelGiftRequest (T038)
  | 'NOT_CANCELLABLE'
  // approveGift · counterGift (T046)
  | 'NOT_RECEIVER'
  | 'GIFT_EXPIRED'
  | 'GIFT_CANCELLED'
  | 'ALREADY_RESPONDED'
  | 'COUNTER_OVER_LIMIT'
  // retryGiftPayment (T053)
  | 'NOT_RETRYABLE'
  | 'RETRY_EXPIRED'
  // registerPaymentMethod (T031)
  | 'ISSUE_FAILED'
  // events/actions (T060)
  | 'VALIDATION_FAILED'
  // 공통 — 소유자 확인 실패
  | 'NOT_OWNER'
  // 공통 — 예상 못 한 예외
  | 'STORAGE_FAILED'

export type ActionError = { code: ActionErrorCode; message: string }

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError }

export function failure<T>(error: ActionError): ActionResult<T> {
  return { ok: false, error }
}

/**
 * 게이트(세션) 이후의 본문을 감싸는 방어선 — DAL 조회·PortOne 호출을 포함해 예상 못 한
 * 예외를 STORAGE_FAILED 로 바꿔 돌려준다. 원인은 서버 로그에 남긴다.
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
    console.error('[gifts/actions] 예상 못 한 예외 — STORAGE_FAILED 로 변환', e)
    return failure({ code: 'STORAGE_FAILED', message })
  }
}
