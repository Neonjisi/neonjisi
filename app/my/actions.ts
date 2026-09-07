'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * 로그아웃 (SCR-M1-06 의 마지막 줄).
 *
 * 마이 탭의 "로그아웃" 은 오래도록 핸들러 없는 `<button type="button">` 이었다 — 눌러도
 * 아무 일이 없었고, 저장소 어디에도 sign-out 구현이 없었다. 공용 기기에서 세션을 끊을
 * 방법이 없다는 뜻이라 그냥 둘 수 없다.
 *
 * Server Action 이라 쿠키 쓰기가 허용된다 (Server Component 렌더 중에는 막혀 있어
 * `lib/supabase/server.ts` 의 setAll 이 조용히 넘어간다) — `signOut()` 이 남기는 만료
 * 쿠키가 여기서는 실제로 응답에 실린다.
 */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  // proxy.ts 가 미인증을 보내는 곳과 같은 자리로 돌려보낸다
  redirect('/login')
}
