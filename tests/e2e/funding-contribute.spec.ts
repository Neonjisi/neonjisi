/** M4 T023 — 3계정으로 접근·지분 마스킹·선결제 참여를 검증한다. */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import {
  becomeFriends,
  ensureOnboarded,
  readInvitePath,
  removeAllFriends,
} from './fixtures/friend-ui'

async function ensurePaymentMethod(page: Page, last4: string): Promise<void> {
  await page.goto('/payment-methods')
  if (await page.getByText(/\*{4}\s*\d{4}/).first().isVisible().catch(() => false)) return
  await page.goto('/payment-methods/new?returnTo=/payment-methods')
  await page.getByText('신한', { exact: true }).click()
  await page.getByLabel('카드 뒷자리 4자리').fill(last4)
  await page.getByRole('button', { name: '등록하기' }).click()
  await expect(page).toHaveURL(/\/payment-methods$/)
}

async function firstProductId(page: Page): Promise<string> {
  await page.goto('/products')
  const href = await page.locator('a[href^="/products/"]').first().getAttribute('href')
  const id = href?.match(/^\/products\/([0-9a-f-]{36})/)?.[1]
  if (!id) throw new Error(`상품 상세 href에서 id를 읽지 못했습니다: ${href}`)
  return id
}

async function createFunding(page: Page, productId: string, receiverId: string): Promise<string> {
  await page.goto(`/fundings/new?productId=${productId}&receiverId=${receiverId}`)
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByLabel('목표 금액').fill('100000')
  await page.getByLabel('최소 달성선').fill('50000')
  const deadline = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('마감일').fill(deadline)
  await page.getByRole('button', { name: '다음' }).click()
  await page.getByRole('checkbox', { name: /동의/ }).check()
  await page.getByRole('button', { name: '펀딩 시작하기' }).click()
  await expect(page).toHaveURL(/\/fundings\/[0-9a-f-]{36}$/)
  return page.url()
}

async function contribute(page: Page, fundingUrl: string, amount: number): Promise<void> {
  await page.goto(fundingUrl)
  await page.getByRole('link', { name: '참여하기' }).click()
  await page.getByLabel('참여 금액').fill(String(amount))
  await page.getByRole('button', { name: '결제하고 참여하기' }).click()
  await expect(page.getByText(/참여가 완료됐어요|목표를 채웠어요/)).toBeVisible({ timeout: 20_000 })
}

test.describe('M4 US2 — 펀딩에 참여한다', () => {
  test('참여 금액 상한과 결제 완료 화면을 지킨다', async ({ authedPage: organizer, friendPage: receiver }) => {
    await ensurePaymentMethod(organizer, '4821')
    await ensurePaymentMethod(receiver, '7314')
    await ensureOnboarded(organizer)
    await ensureOnboarded(receiver)
    await removeAllFriends(organizer)
    await removeAllFriends(receiver)
    const { bId } = await becomeFriends(organizer, receiver)
    const productId = await firstProductId(organizer)
    const fundingUrl = await createFunding(organizer, productId, bId)

    await receiver.goto(fundingUrl)
    await receiver.getByRole('link', { name: '참여하기' }).click()
    await expect(receiver.getByText(/참여 금액은 .*님과 주최자에게 공개됩니다/)).toBeVisible()
    await expect(receiver.getByText('달성선에 못 미치면 전액 환불됩니다.')).toBeVisible()
    await receiver.getByLabel('참여 금액').fill('100001')
    await expect(receiver.getByText('남은 금액은 100,000원이에요')).toBeVisible()
    await receiver.getByLabel('참여 금액').fill('30000')
    await receiver.getByRole('button', { name: '결제하고 참여하기' }).click()
    await expect(receiver.getByText('참여가 완료됐어요')).toBeVisible({ timeout: 20_000 })
    await receiver.getByRole('link', { name: '펀딩 보기' }).click()
    await expect(receiver.getByText('내 참여 금액 30,000원')).toBeVisible()
  })

  test('3계정 지분 공개·잔여 상한과 비친구 접근 거부를 지킨다', async ({
    authedPage: organizer,
    friendPage: receiver,
    thirdPage: contributor,
    fourthPage: stranger,
  }) => {
    await ensurePaymentMethod(organizer, '4821')
    await ensurePaymentMethod(contributor, '7314')
    await ensureOnboarded(organizer)
    await ensureOnboarded(receiver)
    await ensureOnboarded(contributor)
    await ensureOnboarded(stranger)
    await removeAllFriends(organizer)
    await removeAllFriends(receiver)
    await removeAllFriends(contributor)
    await removeAllFriends(stranger)

    const { bId } = await becomeFriends(organizer, receiver)
    // C는 수령자 B의 친구여야 공유 링크를 볼 수 있다. 이미 친구여도 초대 링크는 상세로 보낸다.
    const receiverInvite = await readInvitePath(receiver)
    await contributor.goto(receiverInvite)

    const productId = await firstProductId(organizer)
    const fundingUrl = await createFunding(organizer, productId, bId)

    const forbiddenResponse = await stranger.goto(fundingUrl)
    expect(forbiddenResponse?.status()).toBe(404)

    // 주최자도 참여할 수 있다. C가 참여하기 전에는 이름만 보이고 금액은 숨겨진다.
    await contribute(organizer, fundingUrl, 20_000)
    await contributor.goto(fundingUrl)
    await expect(contributor.getByText('금액 비공개')).toBeVisible()
    await expect(contributor.getByText('남은 금액').locator('..')).toContainText('80,000원')

    // 잔여 초과는 클라이언트에서 즉시 막는다.
    await contributor.getByRole('link', { name: '참여하기' }).click()
    await contributor.getByLabel('참여 금액').fill('80001')
    await expect(contributor.getByText('남은 금액은 80,000원이에요')).toBeVisible()
    await expect(contributor.getByRole('button', { name: '결제하고 참여하기' })).toBeDisabled()

    await contribute(contributor, fundingUrl, 30_000)
    await contributor.goto(fundingUrl)
    await expect(contributor.getByText('내 참여 금액 30,000원')).toBeVisible()
    await expect(contributor.getByText('금액 비공개')).toBeVisible()

    // 주최자와 수령자는 전원의 금액을 볼 수 있다.
    await organizer.goto(fundingUrl)
    await expect(organizer.getByText('20,000원', { exact: true })).toBeVisible()
    await expect(organizer.getByText('30,000원', { exact: true })).toBeVisible()
    await receiver.goto(fundingUrl)
    await expect(receiver.getByText('20,000원', { exact: true })).toBeVisible()
    await expect(receiver.getByText('30,000원', { exact: true })).toBeVisible()
  })
})
