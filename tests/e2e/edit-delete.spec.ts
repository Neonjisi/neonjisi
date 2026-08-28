/**
 * T047 — US4 남긴 취향을 고치고 지운다 (spec.md User Story 4)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md   | 테스트 |
 * |-----------|--------|
 * | US4-1     | 상세와 종류를 수정해 저장하면 변경 내용이 즉시 반영된다 |
 * | US4-2     | 삭제는 확인을 거친 뒤 목록에서 사라지며 복구되지 않는다 (취소하면 남는다) |
 * | US4-3     | 이미 있어요/관심 없어요 가 1건뿐일 때 삭제하면 온보딩 미완료로 돌아가고 재등록을 안내한다 |
 * | SC-006    | 폭 360 에서 편집 시트와 삭제 확인 다이얼로그에 가로 스크롤이 없다 |
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
  addWantItem,
  completeOnboarding,
  deleteRow,
  expectNoHorizontalScroll,
  heading,
  openEditSheet,
  resetAccount,
  row,
  rows,
  saveSheet,
  section,
} from './fixtures/taste-ui'

test.describe('US4 — 수정과 삭제', () => {
  test.beforeEach(async ({ authedPage }) => {
    await resetAccount(authedPage)
  })

  test('US4-1 · 상세와 종류를 수정해 저장하면 변경 내용이 즉시 반영된다', async ({
    authedPage: page,
  }) => {
    await completeOnboarding(page, [{ category: CATEGORY.TUMBLER, kind: 'HAVE' }])

    const dialog = await openEditSheet(page, SECTION.HAVE, CATEGORY.TUMBLER)
    await dialog.getByLabel('상세 (선택)').fill('스탠리 퀜처')
    await dialog.getByText(KIND_LABEL.UNWANTED, { exact: true }).click()
    await expect(dialog.getByRole('radio', { name: KIND_LABEL.UNWANTED })).toBeChecked()
    await saveSheet(dialog)

    // 종류가 바뀌어 다른 묶음으로 옮겨가고, 상세가 함께 표시된다
    await expect(row(page, SECTION.UNWANTED, `${CATEGORY.TUMBLER} · 스탠리 퀜처`)).toBeVisible()
    await expect(row(page, SECTION.HAVE, CATEGORY.TUMBLER)).toHaveCount(0)
    await expect(section(page, SECTION.HAVE).getByText(TEXT.sectionEmpty)).toBeVisible()
    // 관심 없어요 1건이 남으므로 온보딩은 유지된다 (FR-008)
    await page.reload()
    await expect(page).toHaveURL(URLS.taste)
    await expect(row(page, SECTION.UNWANTED, `${CATEGORY.TUMBLER} · 스탠리 퀜처`)).toBeVisible()
  })

  test('US4-2 · 삭제는 확인을 거친 뒤 목록에서 사라지며 복구되지 않는다', async ({
    authedPage: page,
  }) => {
    await completeOnboarding(page, [
      { category: CATEGORY.TUMBLER, kind: 'HAVE' },
      { category: CATEGORY.PERFUME, kind: 'UNWANTED' },
    ])

    // 확인 다이얼로그에서 취소하면 아무것도 지워지지 않는다
    const dialog = await openEditSheet(page, SECTION.UNWANTED, CATEGORY.PERFUME)
    await dialog.getByRole('button', { name: '삭제', exact: true }).click()
    const confirm = page.getByRole('alertdialog', { name: /삭제할까요/ })
    await expect(confirm).toBeVisible()
    await expect(confirm.getByText('삭제하면 되돌릴 수 없어요.')).toBeVisible()
    await confirm.getByRole('button', { name: '취소', exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(dialog).toBeVisible()
    // 배경(닫기)은 시트 패널에 가려지지 않는 좌상단을 누른다
    await dialog.getByRole('button', { name: '닫기' }).click({ position: { x: 10, y: 10 } })
    await expect(dialog).toBeHidden()
    await expect(row(page, SECTION.UNWANTED, CATEGORY.PERFUME)).toBeVisible()

    // 확인하면 목록에서 사라진다
    await deleteRow(page, SECTION.UNWANTED, CATEGORY.PERFUME)
    await expect(row(page, SECTION.UNWANTED, CATEGORY.PERFUME)).toHaveCount(0)
    await expect(row(page, SECTION.HAVE, CATEGORY.TUMBLER)).toBeVisible()
    await expect(page).toHaveURL(URLS.taste)

    // 복구되지 않는다 — 재조회에도 없다
    await page.reload()
    await expect(row(page, SECTION.UNWANTED, CATEGORY.PERFUME)).toHaveCount(0)
    await expect(section(page, SECTION.UNWANTED).getByText(TEXT.sectionEmpty)).toBeVisible()
  })

  test('US4-3 · 이미 있어요/관심 없어요 가 1건뿐일 때 삭제하면 온보딩 미완료로 돌아가고 재등록을 안내한다', async ({
    authedPage: page,
  }) => {
    await completeOnboarding(page, [{ category: CATEGORY.TUMBLER, kind: 'HAVE' }])
    // 원하는 것은 온보딩 판정과 무관하다 (FR-008) — 남아 있어도 미완료로 돌아가야 한다
    await addWantItem(page, { category: CATEGORY.PERFUME, detail: '조말론 우드 세이지' })
    await expect(rows(page, SECTION.HAVE)).toHaveCount(1)
    await expect(rows(page, SECTION.UNWANTED)).toHaveCount(0)

    await deleteRow(page, SECTION.HAVE, CATEGORY.TUMBLER)

    // 취향 화면은 더 이상 열리지 않고 온보딩(재등록)으로 유도된다
    await expect(page).toHaveURL(URLS.onboarding, { timeout: 20_000 })
    await expect(heading(page, TEXT.onboardingIntro)).toBeVisible()
    await expect(page.getByRole('button', { name: '시작하기', exact: true })).toBeVisible()

    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.onboarding)
  })

  test.describe('SC-006 · 폭 360', () => {
    test.use({ viewport: { width: 360, height: 740 } })

    test('편집 시트와 삭제 확인 다이얼로그에 가로 스크롤이 없다', async ({ authedPage: page }) => {
      await completeOnboarding(page, [
        { category: CATEGORY.TUMBLER, kind: 'HAVE', detail: '스타벅스 텀블러' },
      ])
      await expectNoHorizontalScroll(page)

      const dialog = await openEditSheet(page, SECTION.HAVE, `${CATEGORY.TUMBLER} · 스타벅스 텀블러`)
      await expectNoHorizontalScroll(page)

      await dialog.getByRole('button', { name: '삭제', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await expectNoHorizontalScroll(page)
    })
  })
})
