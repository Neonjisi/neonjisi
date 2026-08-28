import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

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
 * 서버(Server Component · Server Action · Route Handler)용 Supabase 클라이언트.
 * 요청마다 새로 만든다 — 요청 간에 공유하면 세션이 섞인다 (T014).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component 렌더 중에는 쿠키를 쓸 수 없다.
            // 토큰 갱신 쿠키 기록은 proxy.ts(T018)의 몫이므로 여기서는 무시해도 안전하다.
          }
        },
      },
    },
  )
}
