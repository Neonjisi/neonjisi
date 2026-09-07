/**
 * T029 — US2 결제수단을 등록한다 (spec.md User Story 2 · FR-008~FR-012)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md | 테스트 |
 * |---------|--------|
 * | US2-1   | 등록하면 관리 화면에 브랜드·뒷자리가 뜬다. 카드 비저장 고지가 등록 화면에 있다 |
 * | US2-2   | 빌링키는 사용자당 재사용 — 등록은 최초 1회, 요청마다 다시 묻지 않는다 |
 * | US2-3   | 삭제는 확인을 받는다. 진행 중 요청이 있으면 그 건수를 경고한다 (FR-011) |
 * | US2-4   | status=EXPIRED 수단은 붉은 라벨 + 재등록 안내 |
 * | SC-010  | 폭 360 에서 등록 폼·삭제 다이얼로그에 가로 스크롤이 없다 |
 *
 * 계정 하나로 성립한다 (quickstart V2 — 요청·결제 없이 독립 검증).
 * env 가 비면 실패가 아니라 **skip** 된다 — `skipped` 수를 본다 (M1·M2와 같은 함정).
 *
 * ⚠️ E2E 는 **항상 mock 이다** (PORTONE_MODE=mock, 협업 규칙 §6). 실키로 돌리면 테스트가
 *    실결제를 만든다. 뒷자리 `0000` 은 결제가 항상 실패하는 mock 규약이라(R1) 등록 자체는 된다.
 *
 * 진행 중 요청은 제품 UI로 만들고, EXPIRED만 결제사 통지를 기다릴 수 없어 제한된 DB
 * 픽스처로 준비한다. 따라서 구현 완료 뒤에는 probe skip 없이 전 상태를 검증한다.
 */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { becomeFriends, ensureOnboarded } from './fixtures/friend-ui'
import { closeGiftDb, expireLatestActivePaymentMethod } from './fixtures/gift-db'
import { expectNoHorizontalScroll } from './fixtures/taste-ui'

test.afterAll(closeGiftDb)

const CARD_BRAND = '신한'
const CARD_LAST4 = '4821'
const CARD_LABEL = `${CARD_BRAND} **** ${CARD_LAST4}`

const NOT_STORED_NOTICE = '카드 정보는 넌지시에 저장되지 않습니다'

/**
 * 카드 라벨은 **목록 안에서** 찾는다 — 삭제 다이얼로그가 같은 문구("신한 **** 4821")를
 * 다시 보여주므로, 페이지 전체에서 찾으면 다이얼로그가 열린 동안 2건이 잡힌다.
 */
function cardInList(page: Page) {
  // .first() — 같은 카드가 여러 건 남아 있어도 "목록에 있다/없다"만 판정한다
  return page.getByRole('list', { name: '등록된 결제수단' }).getByText(CARD_LABEL).first()
}

/** 관리 화면에서 시작해 등록을 마치고 관리 화면으로 돌아온다 */
async function registerCard(page: Page, last4: string = CARD_LAST4): Promise<void> {
  await page.goto('/payment-methods/new')
  await expect(page.getByRole('heading', { name: '결제수단 등록' })).toBeVisible()

  // 라디오 input 은 sr-only 라 라벨 텍스트를 누른다 (M1 fixtures/taste-ui.ts 와 같은 패턴)
  await page.getByText(CARD_BRAND, { exact: true }).click()
  await expect(page.getByRole('radio', { name: CARD_BRAND })).toBeChecked()
  await page.getByLabel('카드 뒷자리 4자리').fill(last4)
  await page.getByRole('button', { name: '등록하기' }).click()

  await expect(page).toHaveURL(/\/payment-methods$/)
}

/**
 * 등록된 카드를 전부 지운다 — 다음 실행이 앞선 실행의 잔여물에 걸리지 않게.
 *
 * **정리용이라 결과를 따지지 않는다.** 삭제 직후의 서버 렌더는 한 박자 늦게 따라올 수 있어
 * (방금 지운 행이 잠깐 더 보인다) 매 회 새로 받아 다시 센다. 정확성 판정은 각 테스트가 한다.
 */
async function deleteAllCards(page: Page): Promise<void> {
  await page.goto('/payment-methods')
  const deleteButtons = page.getByRole('button', { name: '삭제' })

  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await deleteButtons.count()) === 0) return

    await deleteButtons.first().click()
    const dialog = page.getByRole('alertdialog')
    await dialog.getByRole('button', { name: '삭제' }).click()
    await dialog.waitFor({ state: 'hidden' }).catch(() => {})
    await page.reload()
  }
  throw new Error('결제수단 정리가 10회 안에 끝나지 않았다')
}

async function createPendingGift(page: Page, receiverId: string): Promise<void> {
  await page.goto(`/products/for/${receiverId}`)
  await page.locator('a[href^="/products/"]:not([href*="/for/"])').first().click()
  await page.getByRole('link', { name: '선물하기', exact: true }).click()
  await page.getByRole('link', { name: '다음', exact: true }).click()
  await page.getByRole('checkbox', { name: /동의/ }).check()
  await page.getByRole('button', { name: /선물 요청 보내기/ }).click()
  await expect(page.getByText('요청을 보냈어요')).toBeVisible({ timeout: 15_000 })
}

test.describe('US2 — 결제수단', () => {
  test.describe.configure({ timeout: 180_000 })
  test.beforeEach(async ({ authedPage }) => {
    await deleteAllCards(authedPage)
  })

  test.afterEach(async ({ authedPage }) => {
    await deleteAllCards(authedPage)
  })

  test('US2-1 · 등록하면 관리 화면에 브랜드와 뒷자리가 뜬다 — 카드 비저장 고지가 있다', async ({
    authedPage,
  }) => {
    await authedPage.goto('/payment-methods')
    // 0건 안내 — "선물을 보내려면 결제수단이 필요해요" (SCR-M3-07)
    await expect(authedPage.getByText('선물을 보내려면 결제수단이 필요해요')).toBeVisible()

    await authedPage.goto('/payment-methods/new')
    // FR-008 — 카드번호·CVC 는 앱이 만지지 않는다. 그 사실을 화면이 말한다
    await expect(authedPage.getByText(NOT_STORED_NOTICE)).toBeVisible()

    await registerCard(authedPage)

    await expect(cardInList(authedPage)).toBeVisible()
    await expect(authedPage.getByText('사용 중').first()).toBeVisible()
    // 빌링키가 화면에 실리지 않는다 — View 에 아예 없다 (contracts §3)
    await expect(authedPage.locator('body')).not.toContainText('mock_bk_')
  })

  test('US2-2 · 빌링키는 사용자당 재사용 — 등록한 뒤에는 관리 화면이 등록을 다시 요구하지 않는다', async ({
    authedPage,
  }) => {
    await registerCard(authedPage)

    await authedPage.goto('/payment-methods')
    await expect(cardInList(authedPage)).toBeVisible()
    await expect(authedPage.getByText('선물을 보내려면 결제수단이 필요해요')).toBeHidden()
    await expect(
      authedPage.getByText('등록된 결제수단으로 선물 요청이 승인되면 자동으로 결제됩니다'),
    ).toBeVisible()
  })

  test('US2-3 · 삭제는 확인을 받는다 — 취소하면 그대로 남는다', async ({ authedPage }) => {
    await registerCard(authedPage)

    await authedPage.getByRole('button', { name: '삭제' }).click()
    const dialog = authedPage.getByRole('alertdialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()
    await expect(cardInList(authedPage)).toBeVisible()

    await authedPage.getByRole('button', { name: '삭제' }).click()
    await authedPage.getByRole('alertdialog').getByRole('button', { name: '삭제' }).click()
    await expect(authedPage.getByRole('alertdialog')).toBeHidden()
    await expect(cardInList(authedPage)).toBeHidden()
    // soft 삭제라 행은 남지만 목록에서는 사라진다 (data-model PaymentMethod.deletedAt)
    await expect(authedPage.getByText('선물을 보내려면 결제수단이 필요해요')).toBeVisible()
  })

  test('US2-3(경고) · 진행 중 요청이 이 카드를 쓰면 건수를 경고한다 (FR-011)', async ({
    authedPage,
    friendPage,
  }) => {
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    const { bId } = await becomeFriends(authedPage, friendPage)
    await registerCard(authedPage)
    await createPendingGift(authedPage, bId)
    await authedPage.goto('/payment-methods')
    await authedPage.getByRole('button', { name: '삭제' }).click()

    const warning = authedPage.getByText(/진행 중인 선물 요청 \d+건이 이 카드를 사용합니다/)
    await expect(warning).toBeVisible()
    // 삭제는 막지 않는다. 결제 실패 경로로 이어짐을 고지할 뿐이다 (SCR-M3-07)
    await expect(authedPage.getByRole('alertdialog').getByRole('button', { name: '삭제' })).toBeEnabled()
  })

  test('US2-4 · 만료된 수단은 붉은 라벨과 재등록 안내를 단다', async ({ authedPage, friendPage }) => {
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    const { aId } = await becomeFriends(authedPage, friendPage)
    await registerCard(authedPage)
    await expireLatestActivePaymentMethod(aId)
    await authedPage.goto('/payment-methods')

    const expiredLabel = authedPage.getByText('만료됨')
    await expect(expiredLabel).toBeVisible()
    await expect(authedPage.getByText('다시 등록해주세요')).toBeVisible()
  })
})

test.describe('SC-010 — 폭 360 가로 스크롤 없음', () => {
  // expectNoHorizontalScroll 은 뷰포트 폭 360 을 전제로 한다 — chromium 프로젝트에서도
  // 돌므로 폭을 여기서 못 박는다 (M2 friend-invite.spec.ts 와 같은 패턴)
  test.use({ viewport: { width: 360, height: 740 } })

  test('등록 폼과 삭제 다이얼로그에 가로 스크롤이 없다', async ({ authedPage }) => {
    await deleteAllCards(authedPage)

    await authedPage.goto('/payment-methods/new')
    await expect(authedPage.getByText(NOT_STORED_NOTICE)).toBeVisible()
    await expectNoHorizontalScroll(authedPage)

    await registerCard(authedPage)
    await expectNoHorizontalScroll(authedPage)

    await authedPage.getByRole('button', { name: '삭제' }).click()
    await expect(authedPage.getByRole('alertdialog')).toBeVisible()
    await expectNoHorizontalScroll(authedPage)

    await deleteAllCards(authedPage)
  })
})
