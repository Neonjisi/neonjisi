import { expect, test } from './fixtures/auth'
import type { Locator, Page } from '@playwright/test'
import { becomeFriends, ensureOnboarded, removeAllFriends } from './fixtures/friend-ui'
import {
  closeGiftDb,
  deleteE2ETestEvents,
  expirePendingGiftsBetween,
  setGiftRespondDueAt,
} from './fixtures/gift-db'

test.afterAll(closeGiftDb)

const CARD_MASK_TEXT = /\*{4}\s*\d{4}/

async function ensurePaymentMethod(page: Page): Promise<void> {
  await page.goto('/payment-methods')
  const cards = page.getByText(CARD_MASK_TEXT)
  if (await cards.filter({ hasNotText: '0000' }).first().isVisible().catch(() => false)) return
  await page.goto('/payment-methods/new')
  await page.getByLabel(/마지막 4자리|뒷 ?4자리|카드 번호/).first().fill('4821')
  await page.getByRole('button', { name: /등록|저장|완료/ }).first().click()
  await expect(page.getByText(CARD_MASK_TEXT).first()).toBeVisible({ timeout: 15_000 })
}

async function startGiftRequest(page: Page, receiverId: string): Promise<void> {
  await page.goto(`/products/for/${receiverId}`)
  await page.locator('a[href^="/products/"]:not([href*="/for/"])').first().click()
  await page.getByRole('button', { name: '선물하기', exact: true })
    .or(page.getByRole('link', { name: '선물하기', exact: true })).first().click()
}

function nextButton(page: Page): Locator {
  return page.getByRole('link', { name: '다음', exact: true })
    .or(page.getByRole('button', { name: '다음', exact: true }))
}

async function createGift(page: Page, receiverId: string): Promise<string> {
  await startGiftRequest(page, receiverId)
  await nextButton(page).click()
  await page.getByRole('checkbox', { name: /동의/ }).check()
  await page.getByRole('button', { name: /선물 요청 보내기/ }).click()
  await expect(page.getByText('요청을 보냈습니다')).toBeVisible({ timeout: 15_000 })
  const id = new URL(page.url()).searchParams.get('id')
  if (!id) throw new Error(`완료 URL에 gift id가 없다: ${page.url()}`)
  return id
}

test.describe('US6 — 홈 액션 허브와 일정·내역', () => {
  test('승인 대기 2건은 임박순으로 1건만 펼치고 카운트다운 0에서 만료 표시로 바뀐다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    test.setTimeout(180_000)
    await ensureOnboarded(pageA)
    await ensureOnboarded(pageB)
    await removeAllFriends(pageA)
    await removeAllFriends(pageB)
    const { aId, bId } = await becomeFriends(pageA, pageB)
    await expirePendingGiftsBetween(aId, bId)
    await pageB.goto('/') // 조회가 이전 실행의 요청을 EXPIRED로 확정한다
    await ensurePaymentMethod(pageA)

    const laterGiftId = await createGift(pageA, bId)
    const urgentGiftId = await createGift(pageA, bId)
    await setGiftRespondDueAt(laterGiftId, new Date(Date.now() + 10 * 60_000))
    await setGiftRespondDueAt(urgentGiftId, new Date(Date.now() + 8_000))

    await pageB.goto('/')
    const pendingSection = pageB.getByRole('region', { name: '확인이 필요한 선물' })
    const links = pendingSection.getByRole('link')
    await expect(links).toHaveCount(2)
    await expect(links.first()).toContainText('응답 기다리는 중')
    await expect(links.nth(1)).not.toContainText('응답 기다리는 중')
    await expect(links.first()).toHaveAttribute('href', `/gifts/${urgentGiftId}`)
    await expect(links.first().getByRole('timer')).toHaveText('만료됨', { timeout: 15_000 })

    await expirePendingGiftsBetween(aId, bId)
    await pageB.reload()
  })

  test('친구의 반복 일정이 홈과 친구 탭에 보이고 마이 탭에서 선물 내역으로 이동한다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await ensureOnboarded(pageA)
    await ensureOnboarded(pageB)
    await removeAllFriends(pageA)
    await removeAllFriends(pageB)
    const { bId } = await becomeFriends(pageA, pageB)
    await deleteE2ETestEvents(bId)

    const title = `E2E 기념일 ${Date.now()}`
    const tomorrow = new Date(Date.now() + 24 * 60 * 60_000)
    const date = tomorrow.toISOString().slice(0, 10)

    await pageB.goto('/events')
    await pageB.getByRole('button', { name: '일정 추가' }).click()
    await pageB.getByLabel('일정 이름').fill(title)
    await pageB.getByLabel('날짜').fill(date)
    await expect(pageB.getByText('친구에게 이 일정이 보입니다.')).toBeVisible()
    await pageB.getByRole('button', { name: '저장', exact: true }).click()
    await expect(pageB.getByText(title)).toBeVisible()

    await pageA.goto('/')
    await expect(pageA.getByText(title)).toBeVisible()
    await pageA.goto('/friends')
    await expect(pageA.getByText(title)).toBeVisible()

    await pageA.goto('/my')
    await pageA.getByRole('link', { name: '선물 내역' }).click()
    await expect(pageA).toHaveURL('/my/gifts')
    await expect(pageA.getByRole('link', { name: '보낸 선물' })).toHaveAttribute('aria-current', 'page')
    await pageA.getByRole('link', { name: '받은 선물' }).click()
    await expect(pageA).toHaveURL('/my/gifts?tab=received')
  })
})
