/**
 * T057 — US5 결제 실패에서 복구한다 (spec.md User Story 5 · FR-030~FR-032 · quickstart V7)
 *
 * quickstart V7 ↔ 테스트 대응
 * | quickstart | 테스트 |
 * |---|---|
 * | V7-1 | 뒷자리 `0000` 카드로 요청 → 승인 → **결제가 실패한다** (R1 mock 규약) |
 * | V7-2 | 주는 사람에게 실패 알림이 오고, 복구 화면에 시도 횟수·기한이 보인다 (FR-031) |
 * | V7-3 | 수단을 바꿔 재시도하면 성공하고 결과 화면에 닿는다 (FR-030) |
 * | V7-4 | **수령자에게는 실패 진행이 보이지 않는다** (FR-030) |
 *
 * 실패 경로를 만들기 위해 요청 생성(US3)과 승인·배송지(US4)를 실제 UI로 끝까지 지난다.
 * 구현 완료 뒤의 회귀 테스트이므로 probe skip 없이 실패한다.
 *
 * 이 파일이 초록이 되는 시점이 곧 **마일스톤 3 완료 판정**이다 (분담표 §8 Phase 7).
 * 결제는 항상 mock 이다 — 실키로 돌리면 테스트가 실결제를 만든다 (협업 규칙 §6).
 */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { becomeFriends, ensureOnboarded, removeAllFriends } from './fixtures/friend-ui'

const FAILING_CARD_LAST4 = '0000'
const GOOD_CARD_LAST4 = '4821'
const CARD_BRAND = '신한'

/** 결제수단 하나를 등록한다 (D 의 SCR-M3-06 — 이미 서 있다) */
async function registerCard(page: Page, cardLast4: string): Promise<void> {
  await page.goto('/payment-methods/new')
  // 라디오 input 은 sr-only 라 라벨 텍스트를 누른다 (M1 fixtures/taste-ui.ts 와 같은 패턴)
  await page.getByText(CARD_BRAND, { exact: true }).click()
  await expect(page.getByRole('radio', { name: CARD_BRAND })).toBeChecked()
  await page.getByLabel('카드 뒷자리 4자리').fill(cardLast4)
  await page.getByRole('button', { name: '등록하기' }).click()
  await expect(page).toHaveURL(/\/payment-methods$/)
}

/** 상품 하나를 골라 선물 요청을 보낸다. */
async function sendGiftRequest(page: Page, receiverId: string): Promise<string> {
  await page.goto(`/products/for/${receiverId}`)
  const productLink = page.locator('a[href^="/products/"]').first()
  await expect(productLink).toBeVisible()

  await productLink.click()
  const giftButton = page.getByRole('link', { name: '선물하기', exact: true })
  await expect(giftButton).toBeVisible()

  await giftButton.click()
  const consentNext = page.getByRole('link', { name: '다음' })
  await expect(consentNext).toBeVisible()
  await consentNext.click()

  // 재결제 동의는 별도 화면이고 체크 전에는 전송이 막혀 있다 (FR-014)
  const consentCheckbox = page.getByRole('checkbox')
  await expect(consentCheckbox).toBeVisible()
  await consentCheckbox.check()
  await page.getByRole('button', { name: /보내기|전송/ }).click()

  await expect(page.getByText('요청을 보냈어요')).toBeVisible({ timeout: 15_000 })
  const id = new URL(page.url()).searchParams.get('id')
  if (!id) throw new Error(`완료 URL에 gift id가 없다: ${page.url()}`)
  return id
}

test.describe('US5 — 결제 실패에서 복구한다', () => {
  test.describe.configure({ timeout: 180_000 })
  test('V7 · 0000 카드로 실패 → 수단 변경 재시도 → 성공', async ({ authedPage, friendPage }) => {
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)
    const { bId } = await becomeFriends(authedPage, friendPage)
    await registerCard(authedPage, FAILING_CARD_LAST4)

    const giftRequestId = await sendGiftRequest(authedPage, bId)
    // 수령자가 승인한다 (US4 · J 의 T047) — 승인 즉시 자동 결제가 돌고 0000 카드라 실패한다
    await friendPage.goto(`/gifts/${giftRequestId}`)
    const approveButton = friendPage.getByRole('link', { name: '이걸로 받을게요' })
    await expect(approveButton).toBeVisible()
    await approveButton.click()
    await friendPage.getByLabel('받는 분').fill('테스트 수령자')
    await friendPage.getByLabel('연락처').fill('01012345678')
    await friendPage.getByLabel('주소', { exact: true }).fill('서울시 테스트로 1')
    await friendPage.getByRole('button', { name: '완료' }).click()

    // FR-030 — 주는 사람에게만 실패가 보인다. 복구 화면에 시도 횟수와 기한이 있다
    await authedPage.goto(`/gifts/${giftRequestId}/recover`)
    await expect(authedPage.getByRole('heading', { name: '결제가 되지 않았어요' })).toBeVisible()
    await expect(authedPage.getByText(/시도 \d+ \/ \d+/)).toBeVisible()

    // 수령자는 복구 화면을 볼 수 없고 상세로 돌아간다. 실패 진행은 노출하지 않는다 (FR-030)
    await friendPage.goto(`/gifts/${giftRequestId}/recover`)
    await expect(friendPage).toHaveURL(new RegExp(`/gifts/${giftRequestId}$`))
    await expect(friendPage.getByText('선물 준비 중')).toBeVisible()
    await expect(friendPage.getByText('결제 실패')).toHaveCount(0)

    // 정상 카드를 더 등록하고 그 카드로 재시도한다
    await registerCard(authedPage, GOOD_CARD_LAST4)
    await authedPage.goto(`/gifts/${giftRequestId}/recover`)
    await authedPage
      .getByLabel('다른 결제수단으로 재시도')
      .selectOption({ label: `${CARD_BRAND} **** ${GOOD_CARD_LAST4}` })
    await authedPage.getByRole('button', { name: '이 카드로 재시도' }).click()

    // 성공하면 결과 화면이다 (SCR-M3-15)
    await expect(authedPage).toHaveURL(new RegExp(`/gifts/${giftRequestId}/result$`))
    await expect(authedPage.getByRole('heading', { name: '결제가 완료됐어요' })).toBeVisible()

    // 수령자에게도 확정이 보인다 (FR-029 — 성공은 양쪽에 알린다)
    await friendPage.goto(`/gifts/${giftRequestId}/result`)
    await expect(friendPage.getByRole('heading', { name: '선물이 확정됐어요' })).toBeVisible()
  })
})
