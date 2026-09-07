import nextEnv from '@next/env'
import { createClient, type Session } from '@supabase/supabase-js'
import { chromium, type Browser, type Page } from '@playwright/test'

nextEnv.loadEnvConfig(process.cwd())

const SITE = 'http://localhost:3000'
const MAX_CHUNK_SIZE = 3180
const BASE64_PREFIX = 'base64-'

function storageKey(url: string) {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

export function authCookies(session: Session) {
  const key = storageKey(process.env.NEXT_PUBLIC_SUPABASE_URL!)
  const encoded = BASE64_PREFIX + Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  const expires = Math.floor(Date.now() / 1000) + 400 * 24 * 3600
  const chunks = encoded.length <= MAX_CHUNK_SIZE
    ? [{ name: key, value: encoded }]
    : Array.from({ length: Math.ceil(encoded.length / MAX_CHUNK_SIZE) }, (_, i) => ({
        name: `${key}.${i}`,
        value: encoded.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE),
      }))
  return chunks.map(c => ({ ...c, url: SITE, sameSite: 'Lax' as const, httpOnly: false, expires }))
}

export async function signIn(email: string, password: string): Promise<Session> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`${email} 로그인 실패: ${error?.message}`)
  return data.session
}

export type Actor = { label: string; page: Page; userId: string }

export async function openActors(browser: Browser, scale: number, defs: readonly (readonly [string, string, string])[]) {
  const actors: Record<string, Actor> = {}
  for (const [label, email, password] of defs) {
    if (!email || !password) continue
    const session = await signIn(email, password)
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: scale,
      isMobile: true,
      hasTouch: true,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      colorScheme: 'light',
    })
    await ctx.addCookies(authCookies(session))
    actors[label] = { label, page: await ctx.newPage(), userId: session.user.id }
  }
  return actors
}

export async function shoot(page: Page, path: string, file: string, opts: { full?: boolean; wait?: number } = {}) {
  const res = await page.goto(SITE + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
  await page.waitForLoadState('load').catch(() => {})
  await page.waitForTimeout(opts.wait ?? 1200)
  for (let i = 0; i < 3; i++) {
    try { await page.screenshot({ path: file, fullPage: opts.full ?? false, animations: 'disabled' }); break }
    catch { await page.waitForTimeout(800) }
  }
  const status = res?.status() ?? 0
  console.log(`  ${status} ${path} → ${file.split(/[\/]/).pop()}  (${page.url().replace(SITE, '')})`)
  return status
}

export { chromium, SITE }
