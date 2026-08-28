import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// 로그인 성공 후 돌아갈 기본 위치. 온보딩 여부는 여기서 판정하지 않는다 —
// /taste 진입 시 requireOnboarded() 가 권위 있게 판정한다 (FR-018, research R1).
const DEFAULT_NEXT_PATH = '/taste'

/**
 * Supabase Auth 콜백 (T020). 소셜 로그인 후 authorization code 를 세션으로 교환한다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextPath = sanitizeNextPath(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  return NextResponse.redirect(`${origin}${nextPath}`)
}

// 외부 도메인으로 나가는 open redirect 를 막는다 — 같은 사이트의 경로만 허용한다.
function sanitizeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return DEFAULT_NEXT_PATH
  }
  return raw
}
