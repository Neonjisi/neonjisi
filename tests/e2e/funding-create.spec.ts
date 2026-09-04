/**
 * M4 T017 — 펀딩 개설은 화면보다 테스트를 먼저 둔다.
 * 친구 대상은 3단계(차액 동의), 본인 대상은 달성선을 잠근 2단계다.
 */
import { expect, test } from './fixtures/auth'
import { becomeFriends, ensureOnboarded, removeAllFriends } from './fixtures/friend-ui'

const WON = /[0-9][0-9,]*원/

async function ensurePaymentMethod(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/payment-methods')
  await expect(page).toHaveURL(/\/payment-methods$/)
  if (await page.getByText(/\*{4}\s*\d{4}/).first().isVisible().catch(() => false)) return
  await page.goto('/payment-methods/new?returnTo=/payment-methods')
  await expect(page).toHaveURL(/\/payment-methods\/new\?returnTo=\/payment-methods$/)
  await page.getByText('신한', { exact: true }).click()
  await page.getByLabel('카드 뒷자리 4자리').fill('4821')
  await page.getByRole('button', { name: /등록|저장|완료/ }).click()
  await expect(page.getByText(/\*{4}\s*4821/).first()).toBeVisible()
}

async function deleteAllPaymentMethods(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/payment-methods')
  for (let attempt = 0; attempt < 10; attempt++) {
    const deleteButton = page.getByRole('button', { name: '삭제' }).first()
    if (!(await deleteButton.isVisible().catch(() => false))) return
    await deleteButton.click()
    await page.getByRole('alertdialog').getByRole('button', { name: '삭제' }).click()
    await page.reload()
  }
  throw new Error('결제수단 정리가 10회 안에 끝나지 않았다')
}

async function openFirstProduct(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/products')
  await page.locator('a[href^="/products/"]').first().click()
  await page.getByRole('link', { name: '여럿이 모아서 선물하기' }).click()
}

test.describe('M4 US1 — 펀딩을 연다', () => {
  test.beforeEach(async ({ authedPage, friendPage }) => {
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)
  })

  test('친구 대상은 카드 등록 후 금액 입력 단계부터 이어진다', async ({ authedPage, friendPage }) => {
    await deleteAllPaymentMethods(authedPage)
    const { bId } = await becomeFriends(authedPage, friendPage)
    await openFirstProduct(authedPage)

    await authedPage.getByText('친구에게', { exact: true }).click()
    await authedPage.getByLabel('받는 사람').selectOption(bId)
    await authedPage.getByRole('button', { name: '다음' }).click()

    await expect(authedPage).toHaveURL(/\/payment-methods\/new\?returnTo=/)
    await authedPage.getByText('신한', { exact: true }).click()
    await authedPage.getByLabel('카드 뒷자리 4자리').fill('4821')
    await authedPage.getByRole('button', { name: '등록하기' }).click()

    await expect(authedPage).toHaveURL(/\/fundings\/new\?.*resume=amount/)
    await expect(authedPage.getByText('2 / 3', { exact: true })).toBeVisible()
    await expect(authedPage.getByLabel('목표 금액')).toBeVisible()
    await expect(authedPage.getByText('누구에게 줄 선물인가요?')).toBeHidden()
  })

  test('친구에게 3단계로 열고 차액 상한에 동의한다', async ({ authedPage, friendPage }) => {
    await ensurePaymentMethod(authedPage)
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    const { bId } = await becomeFriends(authedPage, friendPage)
    await openFirstProduct(authedPage)

    await authedPage.getByText('친구에게', { exact: true }).click()
    await authedPage.getByLabel('받는 사람').selectOption(bId)
    await authedPage.getByRole('button', { name: '다음' }).click()

    await authedPage.getByLabel('목표 금액').fill('400000')
    await authedPage.getByLabel('최소 달성선').fill('250000')
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    await authedPage.getByLabel('마감일').fill(tomorrow)
    await authedPage.getByRole('button', { name: '다음' }).click()

    await expect(authedPage.getByText('최대 150,000원', { exact: true })).toBeVisible()
    const start = authedPage.getByRole('button', { name: '펀딩 시작하기' })
    await expect(start).toBeDisabled()
    await authedPage.getByRole('checkbox', { name: /동의/ }).check()
    await expect(start).toBeEnabled()
    await expect(authedPage.getByText(WON).first()).toBeVisible()
    await start.click()
    await expect(authedPage).toHaveURL(/\/fundings\/[0-9a-f-]{36}$/)
    await expect(authedPage.getByText('250,000원').first()).toBeVisible()
  })

  test('나에게 열면 달성선을 목표와 같게 잠그고 2단계로 끝낸다', async ({ authedPage }) => {
    await ensureOnboarded(authedPage)
    await openFirstProduct(authedPage)
    await authedPage.getByText('나에게', { exact: true }).click()
    await authedPage.getByRole('button', { name: '다음' }).click()
    await authedPage.getByLabel('목표 금액').fill('400000')
    await expect(authedPage.getByLabel('최소 달성선')).toBeDisabled()
    await expect(authedPage.getByText('목표 금액과 동일')).toBeVisible()
    const start = authedPage.getByRole('button', { name: '펀딩 시작하기' })
    await expect(start).toBeVisible()
    await start.click()
    await expect(authedPage).toHaveURL(/\/fundings\/[0-9a-f-]{36}$/)
  })

  test('잘못된 금액과 마감일을 화면에서 설명한다', async ({ authedPage, friendPage }) => {
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    const { bId } = await becomeFriends(authedPage, friendPage)
    await openFirstProduct(authedPage)
    await authedPage.getByText('친구에게', { exact: true }).click()
    await authedPage.getByLabel('받는 사람').selectOption(bId)
    await authedPage.getByRole('button', { name: '다음' }).click()
    await authedPage.getByLabel('목표 금액').fill('100000')
    await authedPage.getByLabel('최소 달성선').fill('200000')
    await authedPage.getByLabel('마감일').fill('2020-01-01')
    await authedPage.getByRole('button', { name: '다음' }).click()
    await expect(authedPage.getByText('최소 달성선은 목표 금액보다 클 수 없어요')).toBeVisible()
  })
})
