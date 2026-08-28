/**
 * Next 의 redirect()/permanentRedirect() 가 던지는 예외 판별.
 * `next/navigation` 은 isRedirectError 를 공개하지 않으므로 digest 형식
 * (`NEXT_REDIRECT;<push|replace>;<url>;<status>;`)으로 판별한다 — 서버(Action)와
 * 클라이언트(호출 헬퍼) 양쪽에서 쓰이며, 이 예외만은 삼키지 않고 Next 에 넘겨야 한다.
 */
const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT'

export function isRedirectError(error: unknown): error is Error & { digest: string } {
  if (typeof error !== 'object' || error === null) return false
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === 'string' && digest.startsWith(`${REDIRECT_ERROR_CODE};`)
}
