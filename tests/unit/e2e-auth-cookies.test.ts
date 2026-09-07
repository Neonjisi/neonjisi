/**
 * E2E 인증 쿠키의 왕복 (T029).
 *
 * `resetAccount` 는 계정을 DB 로 지우므로 "이 page 가 누구인지"를 알아야 한다. 그 답을
 * 컨텍스트의 쿠키에서 되읽는 것이 `sessionFromSupabaseAuthCookies` 다 —
 * `toSupabaseAuthCookies` 의 역함수이고, 둘이 어긋나면 초기화가 통째로 죽는다.
 *
 * **여기서 미는 건 청크 분기다.** 실제 세션은 인코딩 후 2541자라 상한(3180)에 안 걸려
 * 쿠키 하나로 끝난다. 즉 E2E 를 아무리 돌려도 분할·재조립 경로는 밟히지 않는다.
 * 여유가 25% 뿐이라 JWT 클레임이 조금만 늘면 그날 처음 돌게 되고, 그때 처음 깨진다.
 */
import { describe, expect, it } from 'vitest'

import {
  sessionFromSupabaseAuthCookies,
  supabaseStorageKey,
  toSupabaseAuthCookies,
} from '../e2e/fixtures/auth'
import type { Session } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co'
const SITE_URL = 'http://localhost:3000'
const KEY = supabaseStorageKey(SUPABASE_URL)

function fakeSession(padding = ''): Session {
  return {
    access_token: `header.payload${padding}.signature`,
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: 1_800_000_000,
    token_type: 'bearer',
    user: { id: '11111111-2222-3333-4444-555555555555', email: 'e2e@example.com' },
  } as unknown as Session
}

/** 인코딩 길이가 상한을 넘도록 만든 세션 — 실제 세션은 여기까지 크지 않다 */
function chunkedSession(): Session {
  return fakeSession('x'.repeat(4_000))
}

function toPairs(session: Session): { name: string; value: string }[] {
  return toSupabaseAuthCookies(session, SUPABASE_URL, SITE_URL).map(({ name, value }) => ({
    name,
    value,
  }))
}

describe('sessionFromSupabaseAuthCookies — toSupabaseAuthCookies 의 역함수', () => {
  it('쿠키 하나로 끝나는 세션을 그대로 되읽는다 (실제 E2E 가 밟는 경로)', () => {
    const pairs = toPairs(fakeSession())
    expect(pairs).toHaveLength(1)
    expect(pairs[0].name).toBe(KEY)
    expect(sessionFromSupabaseAuthCookies(pairs, SUPABASE_URL)).toEqual(fakeSession())
  })

  it('상한을 넘어 분할된 세션을 이어 붙여 되읽는다', () => {
    const pairs = toPairs(chunkedSession())
    expect(pairs.length).toBeGreaterThan(1)
    expect(pairs.map((pair) => pair.name)).toEqual([`${KEY}.0`, `${KEY}.1`])
    expect(sessionFromSupabaseAuthCookies(pairs, SUPABASE_URL)).toEqual(chunkedSession())
  })

  it('쿠키 순서가 뒤집혀 들어와도 접미 인덱스 순으로 복원한다', () => {
    // Playwright 의 context.cookies() 는 순서를 보장하지 않는다 — 값 순서에 기대면
    // 이어 붙인 base64 가 깨지고 JSON.parse 가 엉뚱한 곳에서 터진다
    const reversed = [...toPairs(chunkedSession())].reverse()
    expect(sessionFromSupabaseAuthCookies(reversed, SUPABASE_URL)).toEqual(chunkedSession())
  })

  it('다른 계정의 쿠키나 code-verifier 가 섞여 있어도 인증 쿠키만 고른다', () => {
    const noise = [
      { name: `${KEY}-code-verifier`, value: 'pkce-verifier' },
      { name: 'sb-otherproject-auth-token', value: 'base64-bm9wZQ' },
    ]
    const pairs = [...noise, ...toPairs(fakeSession())]
    expect(sessionFromSupabaseAuthCookies(pairs, SUPABASE_URL)).toEqual(fakeSession())
  })

  it('인증 쿠키가 없으면 로그인되지 않은 컨텍스트라고 알린다', () => {
    expect(() => sessionFromSupabaseAuthCookies([], SUPABASE_URL)).toThrow(/로그인되지 않은/)
  })

  it('`base64-` 접두가 사라지면 인코딩이 바뀐 것으로 보고 터진다', () => {
    const pairs = [{ name: KEY, value: '{"user":{"id":"raw-json"}}' }]
    expect(() => sessionFromSupabaseAuthCookies(pairs, SUPABASE_URL)).toThrow(/cookieEncoding/)
  })
})
