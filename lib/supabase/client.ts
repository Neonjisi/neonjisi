import { createBrowserClient } from '@supabase/ssr'

/**
 * 브라우저('use client' 컴포넌트)용 Supabase 클라이언트 (T014).
 * 세션은 쿠키에 유지되므로 서버 클라이언트와 같은 세션을 본다.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 비어 있다. .env.local 을 확인할 것 (tasks.md T006).',
    )
  }

  return createBrowserClient(url, anonKey)
}
