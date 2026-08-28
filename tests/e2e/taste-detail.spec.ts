/**
 * T040 — US3 취향을 상세하게 만든다 (spec.md User Story 3)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md          | 테스트 |
 * |------------------|--------|
 * | US3-1            | 대분류만 있는 항목에 상세를 덧붙여 저장하면 대분류와 상세가 함께 표시된다 |
 * | US3-2 (FR-006)   | 상세를 비운 채 저장해도 대분류만으로 정상 저장된다 |
 * | US3-3 (FR-007)   | 취향 서술이 비어 있을 때 자유 입력으로 저장하면 취향 화면에 표시된다 |
 * | US3-4            | 취향 서술을 저장하지 않아도 취향 화면이 정상 동작한다 (공백만 저장해도 비어 있음, T041) |
 * | SC-006           | 폭 360 에서 편집 시트와 서술 시트에 가로 스크롤이 없다 |
 *
 * 인증: tests/e2e/fixtures/auth.ts — E2E_USER_EMAIL/E2E_USER_PASSWORD 가 없으면 skip.
 */
import { expect, test } from './fixtures/auth'
import {
  CATEGORY,
  KIND_LABEL,
  SECTION,
  TEXT,
  URLS,
  completeOnboarding,
  expectNoHorizontalScroll,
  openAddSheet,
  openEditSheet,
  pickCategory,
  resetAccount,
  row,
  saveSheet,
  section,
  setDescription,
  sheet,
} from './fixtures/taste-ui'

const DETAIL = '스타벅스 텀블러'
const DESCRIPTION = '아침에 혼자 커피 내리는 15분이 좋아요. 산미 있는 원두를 주로 마셔요.'

test.describe('US3 — 상세와 서술', () => {
  test.beforeEach(async ({ authedPage }) => {
    await resetAccount(authedPage)
    // 상세 없이 대분류만, 서술은 건너뛴 채 온보딩을 끝낸다
    await completeOnboarding(authedPage, [{ category: CATEGORY.TUMBLER, kind: 'HAVE' }])
  })

  test('US3-1 · 대분류만 있는 항목에 상세를 덧붙여 저장하면 대분류와 상세가 함께 표시된다', async ({
    authedPage: page,
  }) => {
    await expect(row(page, SECTION.HAVE, CATEGORY.TUMBLER)).toBeVisible()

    const dialog = await openEditSheet(page, SECTION.HAVE, CATEGORY.TUMBLER)
    await expect(dialog.getByLabel('상세 (선택)')).toHaveValue('')
    await dialog.getByLabel('상세 (선택)').fill(DETAIL)
    await saveSheet(dialog)

    await expect(row(page, SECTION.HAVE, `${CATEGORY.TUMBLER} · ${DETAIL}`)).toBeVisible()
    await expect(row(page, SECTION.HAVE, CATEGORY.TUMBLER)).toHaveCount(0)
    // 재조회에도 반영돼 있다 (SC-003)
    await page.reload()
    await expect(row(page, SECTION.HAVE, `${CATEGORY.TUMBLER} · ${DETAIL}`)).toBeVisible()
  })

  test('US3-2 · 상세를 비운 채 저장해도 대분류만으로 정상 저장된다 (FR-006)', async ({
    authedPage: page,
  }) => {
    // 온보딩에서 상세 없이 저장한 항목이 대분류만으로 보인다
    await expect(row(page, SECTION.HAVE, CATEGORY.TUMBLER)).toBeVisible()

    // 취향 화면의 추가 시트에서도 상세를 비운 채 저장한다
    const dialog = await openAddSheet(page, SECTION.UNWANTED)
    await pickCategory(page, dialog, CATEGORY.PERFUME)
    await dialog.getByText(KIND_LABEL.UNWANTED, { exact: true }).click()
    await expect(dialog.getByRole('radio', { name: KIND_LABEL.UNWANTED })).toBeChecked()
    await expect(dialog.getByLabel('상세 (선택)')).toHaveValue('')
    await saveSheet(dialog)

    await expect(row(page, SECTION.UNWANTED, CATEGORY.PERFUME)).toBeVisible()
    await page.reload()
    await expect(row(page, SECTION.UNWANTED, CATEGORY.PERFUME)).toBeVisible()
  })

  test('US3-3 · 취향 서술이 비어 있을 때 자유 입력으로 저장하면 취향 화면에 표시된다 (FR-007)', async ({
    authedPage: page,
  }) => {
    const card = section(page, '취향 서술')
    await expect(card.getByText(TEXT.descriptionHint)).toBeVisible()

    await setDescription(page, DESCRIPTION)
    await expect(card.getByText(DESCRIPTION)).toBeVisible()
    await expect(card.getByText(TEXT.descriptionHint)).toHaveCount(0)

    await page.reload()
    await expect(section(page, '취향 서술').getByText(DESCRIPTION)).toBeVisible()
  })

  test('US3-4 · 취향 서술을 저장하지 않아도 취향 화면이 정상 동작한다', async ({ authedPage: page }) => {
    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.taste)
    const card = section(page, '취향 서술')
    await expect(card.getByText(TEXT.descriptionHint)).toBeVisible()
    await expect(row(page, SECTION.HAVE, CATEGORY.TUMBLER)).toBeVisible()

    // 공백만 저장하면 비어 있는 것으로 취급한다 (T041 — FR-015 집계가 "작성함"으로 세지 않게)
    await setDescription(page, '   ')
    await expect(card.getByText(TEXT.descriptionHint)).toBeVisible()
    await page.reload()
    await expect(section(page, '취향 서술').getByText(TEXT.descriptionHint)).toBeVisible()
  })

  test.describe('SC-006 · 폭 360', () => {
    test.use({ viewport: { width: 360, height: 740 } })

    test('편집 시트와 서술 시트에 가로 스크롤이 없다', async ({ authedPage: page }) => {
      await page.goto('/taste')
      await expectNoHorizontalScroll(page)

      const editSheet = await openEditSheet(page, SECTION.HAVE, CATEGORY.TUMBLER)
      await editSheet.getByLabel('상세 (선택)').fill(DETAIL)
      await expectNoHorizontalScroll(page)
      // 배경(닫기)은 시트 패널에 가려지지 않는 좌상단을 누른다
      await editSheet.getByRole('button', { name: '닫기' }).click({ position: { x: 10, y: 10 } })
      await expect(editSheet).toBeHidden()

      const descriptionSheet = sheet(page, TEXT.descriptionSheetTitle)
      await section(page, '취향 서술').getByRole('button', { name: '편집', exact: true }).click()
      await expect(descriptionSheet).toBeVisible()
      await descriptionSheet.getByRole('textbox').fill(DESCRIPTION)
      await expectNoHorizontalScroll(page)
    })
  })
})
