/** PT 데모 데이터 구축 — 전부 앱 UI 를 거친다 (DB 직접 쓰기 없음) */
import nextEnv from '@next/env'
import { chromium, signIn, authCookies } from './lib.mjs'
import type { Locator, Page } from '@playwright/test'

nextEnv.loadEnvConfig(process.cwd())
const SITE = 'http://localhost:3000'

const CAST = [
  { key: 'host', email: process.env.E2E_USER5_EMAIL!, pw: process.env.E2E_USER5_PASSWORD!, name: '이서준' },
  { key: 'recv', email: process.env.E2E_USER4_EMAIL!, pw: process.env.E2E_USER4_PASSWORD!, name: '박지우' },
  { key: 'p1', email: process.env.E2E_USER_EMAIL!, pw: process.env.E2E_USER_PASSWORD!, name: '김하늘' },
  { key: 'p2', email: process.env.E2E_USER2_EMAIL!, pw: process.env.E2E_USER2_PASSWORD!, name: '정민서' },
] as const

const step = (n: string) => console.log(`\n▶ ${n}`)
const ok = (n: string) => console.log(`   ✓ ${n}`)

async function see(page: Page, loc: Locator, timeout = 15000) {
  await loc.first().waitFor({ state: 'visible', timeout })
  return loc.first()
}

/** 이동 직후 첫 클릭은 hydration 전에 씹힌다 — 목표가 보일 때까지 재시도 */
async function clickAndSee(trigger: Locator, target: Locator, timeout = 25000) {
  const until = Date.now() + timeout
  for (;;) {
    try {
      await trigger.first().click({ timeout: 5000 })
      await target.first().waitFor({ state: 'visible', timeout: 2000 })
      return
    } catch (e) {
      if (Date.now() > until) throw e
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

const browser = await chromium.launch()
const pages: Record<string, Page> = {}
const uids: Record<string, string> = {}

for (const c of CAST) {
  const session = await signIn(c.email, c.pw)
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  })
  await ctx.addCookies(authCookies(session))
  pages[c.key] = await ctx.newPage()
  uids[c.key] = session.user.id
}
console.log('로그인 완료:', uids)

// ── 1. 표시 이름 ──────────────────────────────────────────────────────────────
step('1. 표시 이름을 한글 데모 이름으로 바꾼다 (/signup/profile)')
for (const c of CAST) {
  const p = pages[c.key]
  await p.goto(`${SITE}/signup/profile?returnTo=/my`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500) // hydration
  const field = await see(p, p.getByLabel('이름'))
  await field.fill(c.name)
  await p.getByRole('button', { name: /^(저장|다음)$/ }).first().click({ timeout: 15000 })
  await p.waitForURL(/\/(my|onboarding)(\?.*)?$/, { timeout: 20000 })
  ok(`${c.email} → ${c.name}`)
}

// ── 2. 박지우(수령자) 취향 ────────────────────────────────────────────────────
step('2. 박지우의 취향을 채운다 (/taste)')
{
  const p = pages.recv
  await p.goto(`${SITE}/taste`, { waitUntil: 'domcontentloaded' })
  await see(p, p.getByRole('heading', { name: '내 취향' }))

  const wantSection = p.getByRole('region', { name: '원하는 것', exact: true })
  const hasWant = await wantSection
    .getByRole('button', { name: /무선이어폰 수정/ })
    .isVisible()
    .catch(() => false)
  if (!hasWant) {
    const dialog = p.getByRole('dialog', { name: '원하는 것을 적어주세요', exact: true })
    await clickAndSee(wantSection.getByRole('button', { name: '항목 추가' }), dialog)
    await dialog.getByRole('button', { name: /카테고리 선택$/ }).click()
    const picker = p.getByRole('dialog', { name: '카테고리 선택', exact: true })
    await see(p, picker)
    await picker.getByRole('searchbox', { name: '카테고리 검색' }).fill('무선이어폰')
    await picker.getByRole('button', { name: '무선이어폰', exact: true }).click()
    await picker.waitFor({ state: 'hidden' })
    await dialog.getByLabel('무엇인가요?').fill('출퇴근용 노이즈캔슬링 이어폰')
    await dialog.getByRole('button', { name: '저장', exact: true }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 20000 })
    ok('원하는 것 · 무선이어폰')
  } else ok('원하는 것 · 무선이어폰 (이미 있음)')

  const haveSection = p.getByRole('region', { name: '이미 있어요', exact: true })
  const unwanted = p.getByRole('region', { name: '관심 없어요', exact: true })
  const hasUnwanted = await unwanted
    .getByRole('button', { name: /향수 수정/ })
    .isVisible()
    .catch(() => false)
  if (!hasUnwanted) {
    const dialog = p.getByRole('dialog', { name: '취향 항목 추가', exact: true })
    await clickAndSee(haveSection.getByRole('button', { name: '항목 추가' }), dialog)
    await dialog.getByRole('button', { name: /카테고리 선택$/ }).click()
    const picker = p.getByRole('dialog', { name: '카테고리 선택', exact: true })
    await see(p, picker)
    await picker.getByRole('searchbox', { name: '카테고리 검색' }).fill('향수')
    await picker.getByRole('button', { name: '향수', exact: true }).click()
    await picker.waitFor({ state: 'hidden' })
    await dialog.getByText('관심 없어요', { exact: true }).click()
    await dialog.getByLabel('상세 (선택)').fill('향이 강한 건 잘 못 써요')
    await dialog.getByRole('button', { name: '저장', exact: true }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 20000 })
    ok('관심 없어요 · 향수')
  } else ok('관심 없어요 · 향수 (이미 있음)')

  const descDialog = p.getByRole('dialog', { name: '취향 서술', exact: true })
  await clickAndSee(
    p.getByRole('region', { name: '취향 서술', exact: true }).getByRole('button', { name: '편집', exact: true }),
    descDialog,
  )
  await descDialog.getByRole('textbox').fill('출퇴근이 길어서 소리에 돈을 씁니다. 향이 강한 건 잘 못 써요.')
  await descDialog.getByRole('button', { name: '저장', exact: true }).click()
  await descDialog.waitFor({ state: 'hidden', timeout: 20000 })
  ok('취향 서술')
}

// ── 3. 친구 관계 ──────────────────────────────────────────────────────────────
step('3. 친구를 잇는다 (초대 링크 UI)')
const INVITE_PATH = /\/i\/[A-Za-z0-9_-]{43}/
async function invitePath(p: Page): Promise<string> {
  await p.goto(`${SITE}/friends/invite`, { waitUntil: 'domcontentloaded' })
  for (let i = 0; i < 40; i++) {
    const found = await p.evaluate((src) => {
      const vals = Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea')).map((e) => e.value)
      const hrefs = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map((e) => e.href)
      const m = [document.body.innerText, ...vals, ...hrefs].join('\n').match(new RegExp(src))
      return m ? m[0] : null
    }, INVITE_PATH.source)
    if (found) return found.replace(SITE, '')
    await p.waitForTimeout(500)
  }
  throw new Error('초대 링크를 읽지 못했다')
}
async function friendIds(p: Page): Promise<string[]> {
  await p.goto(`${SITE}/friends`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(700)
  const hrefs = await p
    .locator('a[href^="/friends/"]:not([href^="/friends/invite"])')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''))
  return hrefs.map((h) => h.match(/\/friends\/([0-9a-f-]{36})/)?.[1]).filter(Boolean) as string[]
}
const PAIRS = [
  ['host', 'recv'],
  ['host', 'p1'],
  ['host', 'p2'],
  ['recv', 'p1'],
  ['recv', 'p2'],
] as const
for (const [a, b] of PAIRS) {
  if ((await friendIds(pages[a])).includes(uids[b])) {
    ok(`${a}↔${b} (이미 친구)`)
    continue
  }
  const path = await invitePath(pages[a])
  await pages[b].goto(SITE + path, { waitUntil: 'domcontentloaded' })
  await pages[b].waitForTimeout(2000)
  const okNow = (await friendIds(pages[a])).includes(uids[b])
  console.log(`   ${okNow ? '✓' : '✗'} ${a}↔${b}`)
}

// ── 4. 박지우의 생일 일정 ─────────────────────────────────────────────────────
step('4. 박지우가 생일을 등록한다 (/events)')
{
  const p = pages.recv
  await p.goto(`${SITE}/events`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(900)
  const already = await p
    .getByRole('button', { name: /생일/ })
    .first()
    .isVisible()
    .catch(() => false)
  if (already) ok('생일 (이미 있음)')
  else {
    const sheet = p.getByRole('dialog')
    await clickAndSee(p.getByRole('button', { name: '일정 추가' }), sheet)
    await sheet.getByLabel('일정 이름').fill('생일')
    await sheet.getByLabel('날짜').fill('2026-09-21')
    await sheet.getByRole('button', { name: '저장', exact: true }).click()
    await sheet.waitFor({ state: 'hidden', timeout: 20000 })
    ok('생일 2026-09-21')
  }
}

await browser.close()
console.log('\n✅ 1~4단계 완료')
