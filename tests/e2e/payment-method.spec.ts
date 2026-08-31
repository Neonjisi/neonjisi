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
 * 화면 의존은 probe 로 건너뛴다 (R12):
 *  - "진행 중 N건 경고"는 US3(요청 생성)이 있어야 만들 수 있다 — 경고가 없으면 skip
 *  - EXPIRED 표시는 만료된 수단이 있어야 한다 — UI 로는 만들 수 없으므로 없으면 skip
 */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { expectNoHorizontalScroll } from './fixtures/taste-ui'

const CARD_BRAND = '신한'
const CARD_LAST4 = '4821'
const CARD_LABEL = `${CARD_BRAND} **** ${CARD_LAST4}`

const NOT_STORED_NOTICE = '카드 정보는 넌지시에 저장되지 않습니다'

/** 관리 화면에서 시작해 등록을 마치고 관리 화면으로 돌아온다 */
async function registerCard(page: Page, last4: string = CARD_LAST4): Promise<void> {
  await page.goto('/payment-methods/new')
  await expect(page.getByRole('heading', { name: '결제수단 등록' })).toBeVisible()

  await page.getByRole('radio', { name: CARD_BRAND }).check()
  await page.getByLabel('카드 뒷자리 4자리').fill(last4)
  await page.getByRole('button', { name: '등록하기' }).click()

  await expect(page).toHaveURL(/\/payment-methods$/)
}

/** 등록된 카드를 전부 지운다 — 다음 실행이 앞선 실행의 잔여물에 걸리지 않게 */
async function deleteAllCards(page: Page): Promise<void> {
  await page.goto('/payment-methods')
  for (;;) {
    const deleteButton = page.getByRole('button', { name: '삭제' }).first()
    if ((await deleteButton.count()) === 0) return
    await deleteButton.click()
    await page.getByRole('alertdialog').getByRole('button', { name: '삭제' }).click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
  }
}

test.describe('US2 — 결제수단', () => {
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
    // 0건 안내 — "선물을 보내려면 결제수단이 필요합니다" (SCR-M3-07)
    await expect(authedPage.getByText('선물을 보내려면 결제수단이 필요합니다')).toBeVisible()

    await authedPage.goto('/payment-methods/new')
    // FR-008 — 카드번호·CVC 는 앱이 만지지 않는다. 그 사실을 화면이 말한다
    await expect(authedPage.getByText(NOT_STORED_NOTICE)).toBeVisible()
    await expectNoHorizontalScroll(authedPage)

    await registerCard(authedPage)

    await expect(authedPage.getByText(CARD_LABEL)).toBeVisible()
    await expect(authedPage.getByText('사용 중')).toBeVisible()
    // 빌링키가 화면에 실리지 않는다 — View 에 아예 없다 (contracts §3)
    await expect(authedPage.locator('body')).not.toContainText('mock_bk_')
  })

  test('US2-2 · 빌링키는 사용자당 재사용 — 등록한 뒤에는 관리 화면이 등록을 다시 요구하지 않는다', async ({
    authedPage,
  }) => {
    await registerCard(authedPage)

    await authedPage.goto('/payment-methods')
    await expect(authedPage.getByText(CARD_LABEL)).toBeVisible()
    await expect(authedPage.getByText('선물을 보내려면 결제수단이 필요합니다')).toBeHidden()
    await expect(
      authedPage.getByText('등록된 결제수단으로 선물 요청이 승인되면 자동으로 결제됩니다'),
    ).toBeVisible()
  })

  test('US2-3 · 삭제는 확인을 받는다 — 취소하면 그대로 남는다', async ({ authedPage }) => {
    await registerCard(authedPage)

    await authedPage.getByRole('button', { name: '삭제' }).click()
    const dialog = authedPage.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expectNoHorizontalScroll(authedPage)

    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()
    await expect(authedPage.getByText(CARD_LABEL)).toBeVisible()

    await authedPage.getByRole('button', { name: '삭제' }).click()
    await authedPage.getByRole('alertdialog').getByRole('button', { name: '삭제' }).click()
    await expect(authedPage.getByText(CARD_LABEL)).toBeHidden()
    // soft 삭제라 행은 남지만 목록에서는 사라진다 (data-model PaymentMethod.deletedAt)
    await expect(authedPage.getByText('선물을 보내려면 결제수단이 필요합니다')).toBeVisible()
  })

  test('US2-3(경고) · 진행 중 요청이 이 카드를 쓰면 건수를 경고한다 (FR-011)', async ({
    authedPage,
  }) => {
    await registerCard(authedPage)
    await authedPage.getByRole('button', { name: '삭제' }).click()

    const warning = authedPage.getByText(/진행 중인 선물 요청 \d+건이 이 카드를 사용합니다/)
    // 진행 중 요청은 US3(T038) 이 있어야 만들 수 있다 — 없으면 이 단계는 아직 검증 대상이 아니다
    test.skip(
      (await warning.count()) === 0,
      '진행 중인 요청이 없다 — US3(요청 생성) 완료 후 이 시나리오가 켜진다 (R12 probe skip)',
    )
    await expect(warning).toBeVisible()
    // 삭제는 막지 않는다. 결제 실패 경로로 이어짐을 고지할 뿐이다 (SCR-M3-07)
    await expect(authedPage.getByRole('alertdialog').getByRole('button', { name: '삭제' })).toBeEnabled()
  })

  test('US2-4 · 만료된 수단은 붉은 라벨과 재등록 안내를 단다', async ({ authedPage }) => {
    await registerCard(authedPage)
    await authedPage.goto('/payment-methods')

    const expiredLabel = authedPage.getByText('만료됨')
    // EXPIRED 는 UI 로 만들 수 없다 (결제사 통지·배치의 결과다) — 있을 때만 표시를 검증한다
    test.skip(
      (await expiredLabel.count()) === 0,
      '만료된 결제수단이 없다 — status=EXPIRED 행이 있을 때 켜진다 (R12 probe skip)',
    )
    await expect(expiredLabel).toBeVisible()
    await expect(authedPage.getByText('다시 등록해주세요')).toBeVisible()
  })
})
