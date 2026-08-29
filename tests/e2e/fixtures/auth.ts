/**
 * E2E 인증 fixture — 모든 수용 시나리오는 로그인부터 시작한다 (FR-019).
 *
 * 실 로그인은 Google OAuth 한 종류라 브라우저 자동화가 불가능하다. 대신 Supabase
 * 이메일/비밀번호 **테스트 전용 계정**으로 `signInWithPassword` 해서 받은 세션을,
 * `@supabase/ssr` 가 읽는 쿠키 형식 그대로 브라우저 컨텍스트에 심는다. 그 뒤로는
 * proxy.ts(쿠키 존재 여부) → DAL verifySession()(getClaims) 이 실제 로그인과 똑같이 동작한다.
 *
 * 준비 — Supabase 대시보드 (한 번만):
 *   1. Authentication → Sign In / Providers → **Email** 을 켠다
 *   2. Authentication → Users → Add user → Create new user 로 테스트 계정을 만든다
 *      (**Auto Confirm User** 체크 — 미확인 계정은 signInWithPassword 가 거부된다)
 *   3. `.env.local` 에 `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` 를 채운다 (.env.example 참조)
 *
 * M2 (T017) — 두 번째 계정. M2 의 모든 시나리오가 "A가 링크를 만들고 B가 받는" 두 주체
 * 구조라 계정 하나로는 검증이 안 된다 (research R10, FR-016). `.env.local` 에
 * `E2E_USER2_EMAIL` / `E2E_USER2_PASSWORD` 를 채우면 `friendPage` 가 **별도 브라우저
 * 컨텍스트**에 B 세션을 주입한다 — A(authedPage)와 쿠키가 섞이지 않는다.
 *
 * env 가 없으면 `authedPage`(·`friendPage`) 를 쓰는 테스트는 실패가 아니라 **skip** 된다.
 * 테스트 계정의 취향 데이터는 매 테스트마다 UI 로 지우고 다시 만든다 (taste-ui.ts) —
 * e2e 에서는 `@/lib/prisma` · DAL 을 직접 import 하지 않는다.
 *
 * 쿠키 직렬화는 `node_modules/@supabase/ssr/dist/main/cookies.js` 와
 * `utils/chunker.js` (v0.12.5) 의 구현을 그대로 옮긴 것이다:
 *   - 이름: `sb-<project-ref>-auth-token` (supabase-js: `sb-${hostname.split('.')[0]}-auth-token`)
 *   - 값:   `base64-` + base64url(JSON.stringify(session))  (cookieEncoding 기본값 'base64url')
 *   - 청크: encodeURIComponent 한 길이가 3180 을 넘으면 `.0`, `.1`, … 접미로 분할
 */
import { loadEnvConfig } from '@next/env'
import { test as base, type Page } from '@playwright/test'
import { createClient, type Session } from '@supabase/supabase-js'

// Playwright 는 Next 와 달리 .env.local 을 읽지 않는다. @next/env 는 NODE_ENV=test 에서
// .env.local 을 의도적으로 건너뛰므로 그 경우만 로드하는 동안 우회한다.
{
  const nodeEnv = process.env.NODE_ENV
  if (nodeEnv === 'test') Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd(), true)
  if (nodeEnv === 'test') Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

export const E2E_SKIP_REASON =
  'E2E_USER_EMAIL/E2E_USER_PASSWORD 미설정 — 인증이 필요한 E2E 를 건너뛴다 (.env.example 참조)'

export const E2E_USER2_SKIP_REASON =
  'E2E_USER2_EMAIL/E2E_USER2_PASSWORD 미설정 — 두 계정이 필요한 E2E 를 건너뛴다 (.env.example 참조)'

// ── @supabase/ssr 쿠키 직렬화 (cookies.js · utils/chunker.js) ────────────────────

/** utils/chunker.js `MAX_CHUNK_SIZE` */
const MAX_CHUNK_SIZE = 3180
/** cookies.js `BASE64_PREFIX` */
const BASE64_PREFIX = 'base64-'
/** utils/constants.js `DEFAULT_COOKIE_OPTIONS.maxAge` — 400일 */
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

export type AuthCookie = {
  name: string
  value: string
  url: string
  sameSite: 'Lax'
  httpOnly: false
  expires: number
}

/** supabase-js 가 쓰는 기본 storageKey — `sb-<project-ref>-auth-token` */
export function supabaseStorageKey(supabaseUrl: string): string {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  return `sb-${projectRef}-auth-token`
}

/**
 * `createChunks(key, value)` 와 동일한 분할. 값이 base64url 알파벳(A-Z a-z 0-9 - _)과
 * `base64-` 접두로만 이루어져 encodeURIComponent 가 길이를 바꾸지 않으므로,
 * 원본의 이스케이프 경계 처리는 단순 slice 와 동치다 — 그 전제를 검사로 못 박는다.
 */
export function chunkCookieValue(key: string, value: string): { name: string; value: string }[] {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('쿠키 값이 base64url 알파벳을 벗어났다 — chunkCookieValue 의 전제가 깨졌다')
  }
  if (value.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }]
  }
  const chunkCount = Math.ceil(value.length / MAX_CHUNK_SIZE)
  return Array.from({ length: chunkCount }, (_, index) => ({
    name: `${key}.${index}`,
    value: value.slice(index * MAX_CHUNK_SIZE, (index + 1) * MAX_CHUNK_SIZE),
  }))
}

/** auth-js `_saveSession` → `setItemAsync` 가 저장하는 형태(JSON.stringify(session))를 쿠키로 */
export function toSupabaseAuthCookies(
  session: Session,
  supabaseUrl: string,
  siteUrl: string,
): AuthCookie[] {
  const key = supabaseStorageKey(supabaseUrl)
  // Node 의 'base64url' 은 패딩(=)을 붙이지 않는다 — ssr 의 stringToBase64URL 과 같은 출력
  const encoded =
    BASE64_PREFIX + Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  const expires = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS

  return chunkCookieValue(key, encoded).map(({ name, value }) => ({
    name,
    value,
    url: siteUrl,
    sameSite: 'Lax',
    httpOnly: false,
    expires,
  }))
}

// ── fixture ───────────────────────────────────────────────────────────────────

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} 이 비어 있다. .env.local 을 확인할 것 (tasks.md T006).`)
  }
  return value
}

/** 이메일/비밀번호로 테스트 계정에 로그인해 세션을 받는다 — 두 계정 fixture 가 함께 쓴다 */
async function signInTestAccount(label: string, email: string, password: string): Promise<Session> {
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(
      `${label} 로그인 실패: ${error?.message ?? '세션 없음'} — ` +
        'Supabase 대시보드에서 Email provider 가 켜져 있고 계정이 confirmed 상태인지 확인 (.env.example 참조)',
    )
  }
  return data.session
}

type WorkerFixtures = {
  /** 워커당 한 번만 로그인한 세션. env 가 없으면 null (→ authedPage 가 skip) */
  e2eSession: Session | null
  /** 두 번째 계정(B)의 세션. env 가 없으면 null (→ friendPage 가 skip) */
  e2eSession2: Session | null
}

type TestFixtures = {
  /** 테스트 계정으로 로그인된 상태의 page. env 가 없으면 테스트를 skip 한다 */
  authedPage: Page
  /** B 계정으로 로그인된 **별도 브라우저 컨텍스트**의 page — A(authedPage)와 쿠키가 섞이지 않는다 */
  friendPage: Page
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // fixture 의 두 번째 인자는 Playwright 관례상 `use` 지만, 그 이름이면 react-hooks 린트가
  // React 의 use() 로 오인하므로 provide 로 받는다.
  e2eSession: [
    async ({}, provide) => {
      const email = process.env.E2E_USER_EMAIL
      const password = process.env.E2E_USER_PASSWORD
      if (!email || !password) {
        await provide(null)
        return
      }
      await provide(await signInTestAccount('E2E 테스트 계정', email, password))
    },
    { scope: 'worker' },
  ],

  e2eSession2: [
    async ({}, provide) => {
      const email = process.env.E2E_USER2_EMAIL
      const password = process.env.E2E_USER2_PASSWORD
      if (!email || !password) {
        await provide(null)
        return
      }
      // 같은 계정이면 두 주체 시나리오가 성립하지 않는다 — 자기 자신과는 친구가 될 수 없다 (FR-016)
      if (email === process.env.E2E_USER_EMAIL) {
        throw new Error(
          'E2E_USER2_EMAIL 이 E2E_USER_EMAIL 과 같다 — 서로 다른 계정 둘이 필요하다 (.env.example 참조)',
        )
      }
      await provide(await signInTestAccount('두 번째 E2E 테스트 계정(E2E_USER2)', email, password))
    },
    { scope: 'worker' },
  ],

  authedPage: async ({ page, context, baseURL, e2eSession }, provide) => {
    if (!e2eSession) {
      test.skip(true, E2E_SKIP_REASON)
      return
    }
    await context.addCookies(
      toSupabaseAuthCookies(
        e2eSession,
        requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        baseURL ?? 'http://localhost:3000',
      ),
    )
    await provide(page)
  },

  friendPage: async ({ browser, contextOptions, baseURL, e2eSession2 }, provide) => {
    if (!e2eSession2) {
      test.skip(true, E2E_USER2_SKIP_REASON)
      return
    }
    // 프로젝트 설정(뷰포트 등)을 그대로 이어받은 **별도 컨텍스트** — mobile-360 에서도 같은 화면 폭
    const context = await browser.newContext(contextOptions)
    await context.addCookies(
      toSupabaseAuthCookies(
        e2eSession2,
        requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        baseURL ?? 'http://localhost:3000',
      ),
    )
    const page = await context.newPage()
    await provide(page)
    await context.close()
  },
})

export { expect } from '@playwright/test'
