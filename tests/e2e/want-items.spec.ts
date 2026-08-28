/**
 * T035 — US2 원하는 것을 남긴다 (spec.md User Story 2)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md        | 테스트 |
 * |----------------|--------|
 * | US2-1          | 원하는 것으로 대분류를 골라 저장하면 원하는 것 묶음에 표시된다 |
 * | US2-2          | 원하는 것이 0건이어도 온보딩 완료가 유지되고 비어 있음이 안내된다 |
 * | FR-008         | 원하는 것을 추가하고 지워도 온보딩 완료 여부는 바뀌지 않는다 |
 * | SC-006         | 폭 360 에서 취향 화면과 원하는 것 추가 시트에 가로 스크롤이 없다 |
 *
 * 인증: tests/e2e/fixtures/auth.ts — E2E_USER_EMAIL/E2E_USER_PASSWORD 가 없으면 skip.
 */
import { expect, test } from './fixtures/auth'
import {
  CATEGORY,
  SECTION,
  TEXT,
  URLS,
  addWantItem,
  completeOnboarding,
  deleteRow,
  expectNoHorizontalScroll,
  heading,
  openAddSheet,
  pickCategory,
  resetAccount,
  row,
  rows,
  saveSheet,
  section,
} from './fixtures/taste-ui'

const WANT_DETAIL = '조말론 우드 세이지'

test.describe('US2 — 원하는 것', () => {
  test.beforeEach(async ({ authedPage }) => {
    await resetAccount(authedPage)
    // 온보딩은 이미 있어요 1건으로 끝낸다 — 원하는 것은 0건에서 시작
    await completeOnboarding(authedPage, [{ category: CATEGORY.TUMBLER, kind: 'HAVE' }])
  })

  test('US2-2 · 원하는 것이 0건이어도 온보딩 완료가 유지되고 비어 있음이 안내된다', async ({
    authedPage: page,
  }) => {
    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.taste)
    await expect(heading(page, TEXT.tasteTitle)).toBeVisible()

    const want = section(page, SECTION.WANT)
    await expect(want.getByRole('heading', { name: `${SECTION.WANT} (0)` })).toBeVisible()
    await expect(want.getByText(TEXT.wantEmpty)).toBeVisible()
    await expect(rows(page, SECTION.WANT)).toHaveCount(0)
  })

  test('US2-1 · 원하는 것으로 대분류를 골라 저장하면 원하는 것 묶음에 표시된다', async ({
    authedPage: page,
  }) => {
    await page.goto('/taste')
    await addWantItem(page, { category: CATEGORY.PERFUME, detail: WANT_DETAIL })

    const want = section(page, SECTION.WANT)
    await expect(row(page, SECTION.WANT, WANT_DETAIL)).toBeVisible()
    await expect(want.getByRole('heading', { name: `${SECTION.WANT} (1)` })).toBeVisible()
    await expect(want.getByText(TEXT.wantEmpty)).toHaveCount(0)
    // 다른 묶음에는 섞이지 않는다
    await expect(rows(page, SECTION.HAVE)).toHaveCount(1)
    await expect(rows(page, SECTION.UNWANTED)).toHaveCount(0)

    // 재조회에도 남아 있다 (SC-003)
    await page.reload()
    await expect(row(page, SECTION.WANT, WANT_DETAIL)).toBeVisible()
  })

  test('FR-008 · 원하는 것을 추가하고 지워도 온보딩 완료 여부는 바뀌지 않는다', async ({
    authedPage: page,
  }) => {
    await page.goto('/taste')
    await addWantItem(page, { category: CATEGORY.PERFUME, detail: WANT_DETAIL })
    await deleteRow(page, SECTION.WANT, WANT_DETAIL)
    await expect(rows(page, SECTION.WANT)).toHaveCount(0)

    // 원하는 것이 다시 0건이어도 취향 화면은 그대로 열린다
    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.taste)
    await expect(section(page, SECTION.WANT).getByText(TEXT.wantEmpty)).toBeVisible()
  })

  test.describe('SC-006 · 폭 360', () => {
    test.use({ viewport: { width: 360, height: 740 } })

    test('취향 화면과 원하는 것 추가 시트에 가로 스크롤이 없다', async ({ authedPage: page }) => {
      await page.goto('/taste')
      await expectNoHorizontalScroll(page)

      const dialog = await openAddSheet(page, SECTION.WANT)
      await pickCategory(page, dialog, CATEGORY.PERFUME)
      await dialog.getByLabel('무엇인가요?').fill(WANT_DETAIL)
      await expectNoHorizontalScroll(page)

      await saveSheet(dialog)
      await expect(row(page, SECTION.WANT, WANT_DETAIL)).toBeVisible()
      await expectNoHorizontalScroll(page)
    })
  })
})
