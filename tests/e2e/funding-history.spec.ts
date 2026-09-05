/** M4 T034 — 내역·홈·종료 결과를 실제 UI 여정으로 검증한다. */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { becomeFriends, ensureOnboarded, removeAllFriends } from './fixtures/friend-ui'
import { prisma } from '@/lib/prisma'

const createdFundingIds = new Set<string>()

function rememberFunding(url: string): string {
  const fundingId = url.split('/').at(-1)
  if (!fundingId) throw new Error('펀딩 id를 읽지 못했습니다')
  createdFundingIds.add(fundingId)
  return fundingId
}

async function createSelfFunding(page: Page): Promise<{ url: string; productName: string }> {
  await page.goto('/products')
  const firstCard = page.locator('a[href^="/products/"]').first()
  const productName = (await firstCard.locator('p').first().textContent())?.trim() ?? ''
  await firstCard.click()
  await page.getByRole('link', { name: '여럿이 모아서 선물하기' }).click()
  await page.getByText('나에게', { exact: true }).click()
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByLabel('목표 금액').fill('100000')
  const deadline = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('마감일').fill(deadline)
  await page.getByRole('button', { name: '펀딩 시작하기' }).click()
  await expect(page).toHaveURL(/\/fundings\/[0-9a-f-]{36}$/)
  rememberFunding(page.url())
  return { url: page.url(), productName }
}

async function ensurePaymentMethod(page: Page): Promise<void> {
  await page.goto('/payment-methods')
  if (await page.getByText(/\*{4}\s*\d{4}/).first().isVisible().catch(() => false)) return
  await page.goto('/payment-methods/new?returnTo=/payment-methods')
  await page.getByText('신한', { exact: true }).click()
  await page.getByLabel('카드 뒷자리 4자리').fill('4821')
  await page.getByRole('button', { name: '등록하기' }).click()
  await expect(page).toHaveURL(/\/payment-methods$/)
}

async function createFriendFunding(page: Page, receiverId: string): Promise<string> {
  await page.goto('/products')
  const productHref = await page.locator('a[href^="/products/"]').first().getAttribute('href')
  const productId = productHref?.match(/^\/products\/([0-9a-f-]{36})/)?.[1]
  if (!productId) throw new Error(`상품 상세 href에서 id를 읽지 못했습니다: ${productHref}`)
  await page.goto(`/fundings/new?productId=${productId}&receiverId=${receiverId}`)
  await expect(page.getByLabel('받는 사람')).toHaveValue(receiverId)
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByLabel('목표 금액').fill('100000')
  await page.getByLabel('최소 달성 금액').fill('50000')
  const deadline = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('마감일').fill(deadline)
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByRole('checkbox', { name: /동의/ }).check()
  await page.getByRole('button', { name: '펀딩 시작하기' }).click()
  await expect(page).toHaveURL(/\/fundings\/[0-9a-f-]{36}$/)
  rememberFunding(page.url())
  return page.url()
}

async function paidContribution(fundingId: string, amount: number): Promise<void> {
  const funding = await prisma.funding.findUniqueOrThrow({ where: { id: fundingId }, select: { receiverId: true } })
  const now = new Date()
  await prisma.fundingContribution.create({
    data: {
      fundingId,
      contributorId: funding.receiverId,
      amount,
      status: 'PAID',
      reservedUntil: new Date(now.getTime() + 300_000),
      paidAt: now,
    },
  })
  await prisma.funding.update({ where: { id: fundingId }, data: { deadline: new Date(now.getTime() - 60_000) } })
}

test.describe('M4 US4 — 결과·내역·홈', () => {
  test.afterEach(async () => {
    const fundingIds = [...createdFundingIds]
    createdFundingIds.clear()
    if (fundingIds.length === 0) return

    const contributions = await prisma.fundingContribution.findMany({
      where: { fundingId: { in: fundingIds } },
      select: { id: true },
    })
    await prisma.payment.deleteMany({
      where: { fundingContributionId: { in: contributions.map(({ id }) => id) } },
    })
    await prisma.funding.deleteMany({ where: { id: { in: fundingIds } } })
  })

  test('진행 중 펀딩이 홈과 내역에 나오고 취소 결과가 구분된다', async ({ authedPage: page }) => {
    await ensureOnboarded(page)
    const { url, productName } = await createSelfFunding(page)

    await page.goto('/')
    await expect(page.getByRole('heading', { name: '진행 중인 펀딩' })).toBeVisible()
    await expect(page.getByText(productName).first()).toBeVisible()

    await page.goto('/my/fundings')
    await expect(page.getByRole('navigation', { name: '펀딩 내역 구분' })).toBeVisible()
    await expect(page.getByText(productName).first()).toBeVisible()
    await page.goto('/my/fundings?tab=contributed')
    await expect(page).toHaveURL(/\/my\/fundings\?tab=contributed$/)
    await expect(page.getByRole('link', { name: '참여한 것' })).toHaveAttribute('aria-current', 'page')
    const fundingPath = new URL(url).pathname
    await expect(page.locator(`a[href="${fundingPath}"]`)).toHaveCount(0)

    await page.goto(url)
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '더보기' }).click()
    await page.getByRole('menuitem', { name: '펀딩 취소' }).click()
    await expect(page.getByText('펀딩을 취소했어요')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('link', { name: '환불 내역' }).click()
    await expect(page.getByRole('heading', { name: '펀딩을 취소했어요' })).toBeVisible()
    await expect(page.getByText(/영업일 기준 3~5일/)).toBeVisible()
  })

  test('마감 미달 결과는 환불 안내와 최소 달성 금액을 보여준다', async ({ authedPage: page }) => {
    await ensureOnboarded(page)
    const { url } = await createSelfFunding(page)
    const fundingId = url.split('/').at(-1)
    if (!fundingId) throw new Error('펀딩 id를 읽지 못했습니다')
    await prisma.funding.update({ where: { id: fundingId }, data: { deadline: new Date(Date.now() - 60_000) } })

    await page.goto(url)
    await page.getByRole('link', { name: '환불 내역' }).click()
    await expect(page.getByRole('heading', { name: '최소 달성 금액을 채우지 못했어요' })).toBeVisible()
    await expect(page.getByText('최소 달성 금액', { exact: true })).toBeVisible()
    await expect(page.getByText(/전액 환불돼요/)).toBeVisible()
  })

  test('목표를 전부 채운 펀딩은 차액 없이 성사 결과를 보여준다', async ({ authedPage: page }) => {
    await ensureOnboarded(page)
    const { url } = await createSelfFunding(page)
    const fundingId = url.split('/').at(-1)
    if (!fundingId) throw new Error('펀딩 id를 읽지 못했습니다')
    await paidContribution(fundingId, 100_000)
    await page.goto(`${url}/result`)
    await expect(page.getByRole('heading', { name: '펀딩이 성사됐어요' })).toBeVisible()
    await expect(page.getByText('100,000원', { exact: true }).first()).toBeVisible()
  })

  test('최소 달성 금액만 채운 펀딩은 주최자 차액을 숫자로 고지한다', async ({ authedPage: organizer, friendPage: receiver }) => {
    await ensurePaymentMethod(organizer)
    await ensureOnboarded(organizer)
    await ensureOnboarded(receiver)
    await removeAllFriends(organizer)
    await removeAllFriends(receiver)
    const { bId } = await becomeFriends(organizer, receiver)
    const url = await createFriendFunding(organizer, bId)
    const fundingId = url.split('/').at(-1)
    if (!fundingId) throw new Error('펀딩 id를 읽지 못했습니다')
    await paidContribution(fundingId, 50_000)

    await organizer.goto(`${url}/result`)
    await expect(organizer.getByRole('heading', { name: '펀딩이 성사됐어요' })).toBeVisible({ timeout: 20_000 })
    await expect(organizer.getByText(/차액 50,000원이 .*카드로 결제됐어요/)).toBeVisible()
  })
})
