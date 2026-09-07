import nextEnv from '@next/env'
import { chromium, signIn, authCookies } from './lib.mjs'
nextEnv.loadEnvConfig(process.cwd())
const SITE = 'http://localhost:3000'
const b = await chromium.launch()
const s = await signIn(process.env.E2E_USER5_EMAIL!, process.env.E2E_USER5_PASSWORD!)
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: 'light' })
await ctx.addCookies(authCookies(s))
const p = await ctx.newPage()
for (const [path, file] of [['/friends', 'M2-01-친구목록'], ['/friends/invite', 'M2-03-초대링크']] as const) {
  await p.goto(SITE + path, { waitUntil: 'domcontentloaded' })
  await p.waitForLoadState('load').catch(() => {})
  await p.waitForTimeout(1800)
  await p.screenshot({ path: `pt-shots/${file}.png`, animations: 'disabled' })
  console.log('✓', file)
}
await b.close()
