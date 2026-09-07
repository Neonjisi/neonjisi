/**
 * 보정 패스 — 남은 E2E 기념일을 데모 문구로 고치고, 이서준이 받는 선물 하나를
 * 5분 응답 기한(제품 기본값)으로 새로 만들어 곧바로 촬영한다.
 */
import nextEnv from '@next/env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { chromium, signIn, authCookies } from './lib.mjs'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

nextEnv.loadEnvConfig(process.cwd())
const SITE = 'http://localhost:3000'
const OUT = 'pt-shots'
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const state = JSON.parse(readFileSync('.pt-tmp/demo-state.json', 'utf8'))
const uids = state.uids as Record<string, string>

const step = (n: string) => console.log(`\n▶ ${n}`)
const ok = (n: string) => console.log(`   ✓ ${n}`)

const TEA = await prisma.product.findFirstOrThrow({ where: { name: 'TWG 티백 15종 세트' }, select: { id: true, name: true } })

const browser = await chromium.launch()
const ctxOpts = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  colorScheme: 'light' as const,
}
const pages: Record<string, Page> = {}
for (const [key, email, pw] of [
  ['host', process.env.E2E_USER5_EMAIL!, process.env.E2E_USER5_PASSWORD!],
  ['recv', process.env.E2E_USER4_EMAIL!, process.env.E2E_USER4_PASSWORD!],
  ['p2', process.env.E2E_USER2_EMAIL!, process.env.E2E_USER2_PASSWORD!],
] as const) {
  const session = await signIn(email, pw)
  const ctx = await browser.newContext(ctxOpts)
  await ctx.addCookies(authCookies(session))
  pages[key] = await ctx.newPage()
}

async function shot(page: Page, path: string, file: string, prepare?: (p: Page) => Promise<void>) {
  const res = await page.goto(SITE + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
  await page.waitForLoadState('load').catch(() => {})
  await page.waitForTimeout(1400)
  if (prepare) await prepare(page)
  await page.waitForTimeout(400)
  for (let i = 0; i < 3; i++) {
    try {
      await page.screenshot({ path: `${OUT}/${file}.png`, animations: 'disabled' })
      break
    } catch {
      await page.waitForTimeout(800)
    }
  }
  console.log(`  ${res?.status() === 200 ? '✓' : '✗'} ${res?.status()} ${file}`)
}

// ── A. 정민서의 E2E 기념일을 데모 문구로 고친다 ───────────────────────────────
step('A. 정민서의 E2E 기념일을 고친다 (/events)')
{
  const p = pages.p2
  await p.goto(`${SITE}/events`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  const junk = p.getByRole('button', { name: /E2E 기념일/ }).first()
  if (await junk.isVisible().catch(() => false)) {
    await junk.click({ timeout: 15000 })
    const sheet = p.getByRole('dialog')
    await sheet.waitFor({ state: 'visible', timeout: 15000 })
    await sheet.getByLabel('일정 이름').fill('결혼기념일')
    await sheet.getByLabel('날짜').fill('2026-10-05')
    await sheet.getByText('기념일', { exact: true }).click().catch(() => {})
    await sheet.getByRole('button', { name: '저장', exact: true }).click()
    await sheet.waitFor({ state: 'hidden', timeout: 20000 })
    ok('결혼기념일 2026-10-05')
  } else ok('E2E 기념일 없음 (이미 고쳐짐)')
}

// ── B. 박지우 → 이서준 선물 요청 (5분 응답 기한) ──────────────────────────────
step('B. 박지우가 이서준에게 선물을 보낸다 — 응답 기한 5분')
{
  const p = pages.recv
  await p.goto(`${SITE}/products/${TEA.id}?for=${uids.host}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  await p.getByRole('link', { name: '선물하기', exact: true }).first().click({ timeout: 20000 })
  await p.waitForTimeout(1500)
  await p.getByRole('link', { name: '다음', exact: true }).or(p.getByRole('button', { name: '다음', exact: true })).first().click({ timeout: 20000 })
  await p.waitForTimeout(1500)
  await p.getByRole('checkbox').first().check({ timeout: 20000 })
  await p.getByRole('button', { name: /선물 요청 보내기|보내기|전송/ }).first().click({ timeout: 20000 })
  await p.waitForTimeout(2500)
  ok(`요청 전송 — ${p.url().replace(SITE, '')}`)
}

const fresh = await prisma.giftRequest.findFirstOrThrow({
  where: { giverId: uids.recv, receiverId: uids.host, status: 'PENDING' },
  orderBy: { createdAt: 'desc' },
  select: { id: true },
})
console.log('   새 선물 id:', fresh.id)

// ── C. 곧바로 촬영 (카운트다운이 살아 있는 동안) ──────────────────────────────
step('C. 촬영')
await shot(pages.host, '/', 'HUB-01-홈-보내는사람')
await shot(pages.host, `/gifts/${fresh.id}`, 'M3-07-받은선물-응답대기')
await shot(pages.host, `/gifts/${fresh.id}/respond/shipping`, 'M3-08-배송지-입력', async (p) => {
  await p.getByLabel('받는 분').fill('이서준').catch(() => {})
  await p.getByLabel('연락처').fill('010-2201-7788').catch(() => {})
  await p.getByLabel('주소', { exact: true }).fill('서울특별시 성동구 왕십리로 83').catch(() => {})
  await p.getByLabel('상세 주소').fill('아크로서울포레스트 12층').catch(() => {})
})
await shot(pages.host, `/gifts/${fresh.id}/respond/reselect`, 'M3-09-다른것도-좋아요')
await shot(pages.host, '/notifications', 'HUB-03-알림')
await shot(pages.host, '/my', 'HUB-04-마이')
await shot(pages.recv, '/', 'HUB-02-홈-받는사람')

await prisma.$disconnect()
await browser.close()
console.log('\n✅ 보정 완료')
