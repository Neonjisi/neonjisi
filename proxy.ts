import { NextResponse, type NextRequest } from 'next/server'
import { updateSupabaseSession } from '@/lib/supabase/proxy'

/**
 * T018 — 미인증 요청의 optimistic 리다이렉트 (research R1).
 *
 * 여기서는 Supabase 세션 쿠키의 **존재 여부만** 본다. DB 조회 금지 —
 * Proxy 는 prefetch 를 포함한 모든 매칭 라우트에서 실행되고, Next.js 16 문서가
 * 세션 관리·인가 용도로 쓰지 말라고 명시한다. 권위 있는 판정(온보딩 여부 포함)은
 * DAL 의 verifySession()/requireOnboarded() 가 맡는다 (FR-018, FR-019).
 */

// @supabase/ssr 은 `sb-<project-ref>-auth-token`(청크 시 `.0`, `.1` 접미) 쿠키를 쓴다.
function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'))
}

export async function proxy(request: NextRequest) {
  // 로컬 화면 프리뷰용 우회 — 인증 연동 전까지만 쓴다.
  // development + 명시적 플래그 이중 게이트라 프로덕션 빌드에는 영향이 없다.
  if (process.env.NODE_ENV === 'development' && process.env.PREVIEW_BYPASS_AUTH === '1') {
    return NextResponse.next()
  }

  if (hasSupabaseAuthCookie(request)) {
    return updateSupabaseSession(request)
  }

  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = ''
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // 인증이 필요한 영역만 매칭한다. /, /login, /auth/callback 은 공개다.
  // M2 (T012): /friends·/notifications 추가. **/i/:path* 는 넣지 않는다** —
  // matcher 는 화이트리스트라 목록에 없으면 자동 공개이고, 미리보기는 비가입자가
  // 로그인 없이 봐야 한다 (FR-008, M2 research R1). 넣으면 링크가 무용지물이 된다.
  matcher: [
    '/onboarding/:path*',
    '/taste/:path*',
    '/my/:path*',
    '/signup/:path*',
    '/friends/:path*',
    '/notifications/:path*',
  ],
}
