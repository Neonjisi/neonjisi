/** PT 스크린샷 촬영 — 390x844 @3x. 저장을 일으키는 버튼은 절대 누르지 않는다 */
import nextEnv from '@next/env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { chromium, signIn, authCookies } from './lib.mjs'
import type { Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

nextEnv.loadEnvConfig(process.cwd())
const SITE = 'http://localhost:3000'
const OUT = 'pt-shots'
mkdirSync(OUT, { recursive: true })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const state = JSON.parse(readFileSync('.pt-tmp/demo-state.json', 'utf8'))
const uids = state.uids as Record<string, string>

const pendingGift = await prisma.giftRequest.findFirst({
  where: { giverId: uids.host, receiverId: uids.recv, status: 'PENDING' },
  orderBy: { createdAt: 'desc' },
  select: { id: true },
})
const paidGift = await prisma.giftRequest.findFirst({
  where: { giverId: uids.host, receiverId: uids.recv, status: { in: ['PAID', 'PAYMENT_FAILED'] } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, status: true },
})
const fundingId = state.fundingUrl.split('/').pop()
console.log({ pendingGift, paidGift, fundingId })

const browser = await chromium.launch()
const pages: Record<string, Page> = {}
for (const [key, email, pw] of [
  ['host', process.env.E2E_USER5_EMAIL!, process.env.E2E_USER5_PASSWORD!],
  ['recv', process.env.E2E_USER4_EMAIL!, process.env.E2E_USER4_PASSWORD!],
  ['p1', process.env.E2E_USER_EMAIL!, process.env.E2E_USER_PASSWORD!],
] as const) {
  const session = await signIn(email, pw)
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
  })
  await ctx.addCookies(authCookies(session))
  pages[key] = await ctx.newPage()
}
const guestCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
})
pages.guest = await guestCtx.newPage()

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
  const status = res?.status() ?? 0
  const mark = status === 200 ? '✓' : '✗'
  console.log(`  ${mark} ${status} ${file}  ←  ${page.url().replace(SITE, '')}`)
}

const { host, recv, p1, guest } = pages

console.log('\n[M0 — 시작]')
await shot(guest, '/', 'M0-01-랜딩')
await shot(guest, '/login', 'M0-02-로그인')

console.log('\n[M1 — 취향 프로필]')
await shot(host, '/onboarding', 'M1-01-온보딩-인트로')
await shot(host, '/onboarding', 'M1-02-온보딩-카테고리', async (p) => {
  await p.getByRole('button', { name: '시작하기', exact: true }).click({ timeout: 15000 })
  await p.getByRole('heading', { name: '이미 있거나 필요 없는 것을 골라주세요' }).waitFor({ timeout: 15000 })
  for (const name of ['무선이어폰', '텀블러', '향수']) {
    const chip = p.getByRole('button', { name, exact: true })
    if (!(await chip.isVisible().catch(() => false))) {
      await p.getByRole('button', { name: '더보기', exact: true }).click().catch(() => {})
    }
    await chip.click({ timeout: 8000 }).catch(() => {})
  }
})
await shot(host, '/onboarding', 'M1-03-온보딩-종류선택', async (p) => {
  await p.getByRole('button', { name: '시작하기', exact: true }).click({ timeout: 15000 })
  await p.getByRole('heading', { name: '이미 있거나 필요 없는 것을 골라주세요' }).waitFor({ timeout: 15000 })
  for (const name of ['텀블러', '향수']) {
    const chip = p.getByRole('button', { name, exact: true })
    if (!(await chip.isVisible().catch(() => false))) {
      await p.getByRole('button', { name: '더보기', exact: true }).click().catch(() => {})
    }
    await chip.click({ timeout: 8000 }).catch(() => {})
  }
  // 여기서 '다음' 은 저장이 아니라 2/3 이동이다 (저장은 2/3 의 '다음')
  await p.getByRole('button', { name: '다음', exact: true }).click({ timeout: 15000 })
  await p.getByRole('heading', { name: '고른 것들, 어느 쪽인가요?' }).waitFor({ timeout: 15000 })
  const g = p.getByRole('region', { name: '텀블러', exact: true })
  await g.getByText('이미 있어요', { exact: true }).click().catch(() => {})
  const g2 = p.getByRole('region', { name: '향수', exact: true })
  await g2.getByText('관심 없어요', { exact: true }).click().catch(() => {})
})
await shot(recv, '/taste', 'M1-04-내취향')
await shot(recv, '/taste/products', 'M1-05-취향-추천상품')

console.log('\n[M2 — 친구와 취향 공유]')
await shot(host, '/friends', 'M2-01-친구목록')
await shot(host, `/friends/${uids.recv}`, 'M2-02-친구-취향상세')
await shot(host, '/friends/invite', 'M2-03-초대링크')

console.log('\n[M3 — 선물 요청과 결제]')
await shot(host, '/products', 'M3-01-상품카탈로그')
await shot(host, `/products/for/${uids.recv}`, 'M3-02-친구맞춤-목록')
await shot(host, `/products/${state.SONY.id}?for=${uids.recv}`, 'M3-03-상품상세-취향일치')
await shot(host, `/products/${state.FLOWER.id}?for=${uids.recv}`, 'M3-04-상품상세-꽃다발')
await shot(host, `/gifts/new?productId=${state.CHOCO.id}&receiverId=${uids.recv}`, 'M3-05-선물요청-확인')
await shot(host, `/gifts/new/consent?productId=${state.CHOCO.id}&receiverId=${uids.recv}`, 'M3-06-재결제-동의', async (p) => {
  await p.getByRole('checkbox').first().check({ timeout: 10000 }).catch(() => {})
})
if (pendingGift) {
  await shot(recv, `/gifts/${pendingGift.id}`, 'M3-07-받은선물-응답대기')
  await shot(recv, `/gifts/${pendingGift.id}/respond/shipping`, 'M3-08-배송지-입력', async (p) => {
    await p.getByLabel('받는 분').fill('박지우').catch(() => {})
    await p.getByLabel('연락처').fill('010-4412-0987').catch(() => {})
    await p.getByLabel('주소', { exact: true }).fill('서울특별시 마포구 양화로 45').catch(() => {})
    await p.getByLabel('상세 주소').fill('메세나폴리스 8층').catch(() => {})
  })
  await shot(recv, `/gifts/${pendingGift.id}/respond/reselect`, 'M3-09-다른것도-좋아요')
}
if (paidGift) await shot(recv, `/gifts/${paidGift.id}/result`, 'M3-10-선물-결과')
await shot(host, '/my/gifts', 'M3-11-선물내역')

console.log('\n[M4 — 함께 모아 선물하기]')
await shot(host, `/fundings/new?productId=${state.SONY.id}&receiverId=${uids.recv}`, 'M4-01-펀딩개설-대상')
await shot(host, `/fundings/${fundingId}`, 'M4-02-펀딩상세-주최자')
await shot(p1, `/fundings/${fundingId}`, 'M4-03-펀딩상세-참여자')
await shot(p1, `/fundings/${fundingId}/contribute`, 'M4-04-펀딩-참여하기', async (p) => {
  await p.getByLabel('참여 금액').fill('50000').catch(() => {})
})
await shot(host, '/my/fundings', 'M4-05-펀딩내역')

console.log('\n[공통 — 허브]')
await shot(host, '/', 'HUB-01-홈-보내는사람')
await shot(recv, '/', 'HUB-02-홈-받는사람')
await shot(host, '/notifications', 'HUB-03-알림')
await shot(host, '/my', 'HUB-04-마이')
await shot(host, '/payment-methods', 'HUB-05-결제수단')
await shot(recv, '/events', 'HUB-06-기념일')

await prisma.$disconnect()
await browser.close()
console.log('\n✅ 촬영 완료 →', OUT)
