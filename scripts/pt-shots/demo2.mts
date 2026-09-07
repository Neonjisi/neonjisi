/** PT 데모 데이터 구축 2단계 — 선물 요청 · 펀딩 · 참여. 전부 앱 UI 를 거친다 */
import nextEnv from '@next/env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { chromium, signIn, authCookies } from './lib.mjs'
import type { Page } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'node:fs'

nextEnv.loadEnvConfig(process.cwd())
const SITE = 'http://localhost:3000'
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const step = (n: string) => console.log(`\n▶ ${n}`)
const ok = (n: string) => console.log(`   ✓ ${n}`)

const CAST = [
  { key: 'host', email: process.env.E2E_USER5_EMAIL!, pw: process.env.E2E_USER5_PASSWORD!, last4: '4821' },
  { key: 'recv', email: process.env.E2E_USER4_EMAIL!, pw: process.env.E2E_USER4_PASSWORD!, last4: '7314' },
  { key: 'p1', email: process.env.E2E_USER_EMAIL!, pw: process.env.E2E_USER_PASSWORD!, last4: '2043' },
  { key: 'p2', email: process.env.E2E_USER2_EMAIL!, pw: process.env.E2E_USER2_PASSWORD!, last4: '9157' },
] as const

const product = async (name: string) => {
  const p = await prisma.product.findFirst({ where: { name }, select: { id: true, name: true, price: true } })
  if (!p) throw new Error(`상품을 찾지 못했다: ${name}`)
  return p
}
const SONY = await product('소니 WF-1000XM5')
const CHOCO = await product('고디바 트러플 초콜릿 12P')
const FLOWER = await product('계절 꽃다발 프리미엄')
console.log('상품:', SONY, CHOCO, FLOWER)

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

// ── 5. 결제수단 ───────────────────────────────────────────────────────────────
step('5. 각자 결제수단을 확인한다 (/payment-methods)')
for (const c of CAST) {
  const p = pages[c.key]
  await p.goto(`${SITE}/payment-methods`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  const has = await p
    .getByText(/\*{4}\s*\d{4}/)
    .first()
    .isVisible()
    .catch(() => false)
  if (has) {
    ok(`${c.key} 결제수단 있음`)
    continue
  }
  await p.goto(`${SITE}/payment-methods/new?returnTo=/payment-methods`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  await p.getByText('신한', { exact: true }).click()
  await p.getByLabel('카드 뒷자리 4자리').fill(c.last4)
  await p.getByRole('button', { name: /등록하기|등록|저장|완료/ }).first().click()
  await p.waitForURL(/\/payment-methods$/, { timeout: 20000 })
  ok(`${c.key} 결제수단 등록 ****${c.last4}`)
}

// ── 6. 선물 요청 ──────────────────────────────────────────────────────────────
async function sendGift(productId: string, label: string): Promise<void> {
  const p = pages.host
  // `?for=` 가 붙으면 상세가 곧바로 [선물하기] 를 낸다 (products/[id]/page.tsx giftHref)
  await p.goto(`${SITE}/products/${productId}?for=${uids.recv}&returnTo=/products/for/${uids.recv}`, {
    waitUntil: 'domcontentloaded',
  })
  await p.waitForTimeout(1500)
  const gift = p.getByRole('link', { name: '선물하기', exact: true }).or(p.getByRole('button', { name: '선물하기', exact: true }))
  await gift.first().click({ timeout: 20000 })
  await p.waitForTimeout(1500)
  await p.getByRole('link', { name: '다음', exact: true }).or(p.getByRole('button', { name: '다음', exact: true })).first().click({ timeout: 20000 })
  await p.waitForTimeout(1500)
  await p.getByRole('checkbox').first().check({ timeout: 20000 })
  await p.getByRole('button', { name: /선물 요청 보내기|보내기|전송/ }).first().click({ timeout: 20000 })
  await p.waitForTimeout(3000)
  ok(`선물 요청 — ${label} (${p.url().replace(SITE, '')})`)
}

step('6-1. 이서준 → 박지우 선물 요청 #1 (수락까지 진행)')
await sendGift(CHOCO.id, CHOCO.name)

step('6-2. 박지우가 받고 수락한다')
{
  const p = pages.recv
  await p.goto(`${SITE}/`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  await p.getByRole('link', { name: /응답 기다리는 중/ }).first().click({ timeout: 20000 })
  await p.waitForTimeout(1500)
  await p.getByRole('link', { name: '이걸로 받을게요' }).first().click({ timeout: 20000 })
  await p.waitForTimeout(1500)
  await p.getByLabel('받는 분').fill('박지우')
  await p.getByLabel('연락처').fill('01044120987')
  await p.getByLabel('주소', { exact: true }).fill('서울특별시 마포구 양화로 45')
  await p.getByLabel('상세 주소').fill('메세나폴리스 8층')
  await p.getByRole('button', { name: '완료' }).click({ timeout: 20000 })
  await p.waitForTimeout(4000)
  ok(`수락 완료 — ${p.url().replace(SITE, '')}`)
}

// ── 7. 펀딩 ───────────────────────────────────────────────────────────────────
step('7. 이서준이 박지우를 위한 펀딩을 연다 (소니 WF-1000XM5)')
let fundingUrl = ''
{
  const p = pages.host
  await p.goto(`${SITE}/fundings/new?productId=${SONY.id}&receiverId=${uids.recv}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1800)
  await p.getByRole('button', { name: '다음', exact: true }).first().click({ timeout: 20000 })
  await p.waitForTimeout(1200)
  await p.getByLabel('목표 금액').fill('319000')
  await p.getByLabel('최소 달성 금액').fill('200000')
  await p.getByLabel('마감일').fill('2026-09-12')
  await p.getByRole('button', { name: '다음', exact: true }).first().click({ timeout: 20000 })
  await p.waitForTimeout(1200)
  await p.getByRole('checkbox', { name: /동의/ }).first().check({ timeout: 20000 })
  await p.getByRole('button', { name: '펀딩 시작하기' }).click({ timeout: 20000 })
  await p.waitForURL(/\/fundings\/[0-9a-f-]{36}$/, { timeout: 30000 })
  fundingUrl = p.url()
  ok(`펀딩 개설 — ${fundingUrl.replace(SITE, '')}`)
}

// ── 8. 참여 ───────────────────────────────────────────────────────────────────
step('8. 김하늘 120,000원 · 정민서 90,000원 참여')
for (const [key, amount] of [['p1', 120000], ['p2', 90000]] as const) {
  const p = pages[key]
  await p.goto(fundingUrl, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  await p.getByRole('link', { name: '참여하기' }).first().click({ timeout: 20000 })
  await p.waitForTimeout(1500)
  await p.getByLabel('참여 금액').fill(String(amount))
  await p.getByRole('button', { name: '결제하고 참여하기' }).click({ timeout: 20000 })
  await p.getByText(/참여가 완료됐어요|목표를 채웠어요/).first().waitFor({ state: 'visible', timeout: 30000 })
  ok(`${key} ${amount.toLocaleString()}원 참여`)
}

// ── 9. 미응답 선물 하나를 남긴다 (홈 카운트다운용) ────────────────────────────
step('9. 이서준 → 박지우 선물 요청 #2 (PENDING 으로 남긴다)')
await sendGift(FLOWER.id, FLOWER.name)

mkdirSync('.pt-tmp', { recursive: true })
writeFileSync('.pt-tmp/demo-state.json', JSON.stringify({ uids, fundingUrl, SONY, CHOCO, FLOWER }, null, 2), 'utf8')
await prisma.$disconnect()
await browser.close()
console.log('\n✅ 5~9단계 완료')
