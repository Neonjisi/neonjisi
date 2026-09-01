import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function requireEnv(
  name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} 이 비어 있다. .env.local 을 확인할 것 (tasks.md T006).`)
  }
  return value
}

/**
 * 만료가 임박한 Supabase 세션을 갱신하고 새 쿠키를 요청과 응답 양쪽에 반영한다.
 *
 * 요청 쿠키 갱신은 뒤이어 렌더되는 Server Component가 같은 세션을 보게 하고,
 * 응답 쿠키 갱신은 브라우저가 다음 요청부터 새 세션을 보내게 한다.
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
        },
      },
    },
  )

  // getSession()은 쿠키 값을 신뢰할 뿐 검증하지 않는다. getClaims()가 JWT를 검증하고,
  // 필요하면 refresh token으로 세션을 갱신해 위 setAll()을 호출한다.
  await supabase.auth.getClaims()

  return response
}
