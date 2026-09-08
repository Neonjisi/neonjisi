/**
 * T024 — US1 잘못된 선물을 막을 근거를 남긴다 (spec.md User Story 1)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md            | 테스트 |
 * |--------------------|--------|
 * | US1-1              | 관심 없어요 대분류 하나만 골라 저장하면 온보딩이 완료되고 취향 화면에 나타난다 |
 * | US1-2              | 아무 대분류도 고르지 않으면 저장으로 나아갈 수 없고 선택 안내가 표시된다 |
 * | US1-3              | 이미 있어요 와 관심 없어요 가 서로 다른 묶음으로 구분되어 보인다 |
 * | US1-4 (FR-009)     | 온보딩 미완료로 이탈했다가 다시 접속하면 이어서 진행할 경로가 제시된다 |
 * | US1-5 (FR-018)     | 온보딩 미완료 계정이 /taste 에 직접 진입하면 /onboarding 으로 유도된다 |
 * | US1-6 앞 (FR-019)  | 로그인하지 않은 방문자가 인증 화면에 접근하면 /login 으로 유도된다 — fixture 없이 실행 |
 * | US1-6 뒤 (FR-019)  | 로그인 후 목적지(/taste)는 온보딩 완료 여부에 따라 갈린다 |
 * | SC-006             | 폭 360 에서 온보딩 각 스텝과 취향 화면에 가로 스크롤이 없다 |
 *
 * 인증: tests/e2e/fixtures/auth.ts — E2E_USER_EMAIL/E2E_USER_PASSWORD 가 없으면 로그인 테스트는 skip.
 */
import { expect, test } from './fixtures/auth'
import {
  CATEGORY,
  SECTION,
  TEXT,
  URLS,
  clickAndSee,
  completeOnboarding,
  expectNoHorizontalScroll,
  heading,
  resetAccount,
  row,
  section,
  selectCategoryChip,
} from './fixtures/taste-ui'

test.describe('US1-6 앞부분 — 미인증 접근 (FR-019)', () => {
  for (const path of ['/taste', '/onboarding'] as const) {
    test(`로그인하지 않은 방문자가 ${path} 에 접근하면 /login 으로 유도된다`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(URLS.login)
      await expect(heading(page, '넌지시를 시작해요')).toBeVisible()
      // 소셜 로그인 1종(Google)의 진입점이 보인다
      await expect(page.getByRole('button', { name: 'Google로 시작하기' })).toBeVisible()
    })
  }
})

test.describe('US1 — 로그인한 테스트 계정', () => {
  test.beforeEach(async ({ authedPage }) => {
    await resetAccount(authedPage)
  })

  test('US1-5 · 온보딩 미완료 계정이 /taste 에 직접 진입하면 /onboarding 으로 유도된다 (FR-018)', async ({
    authedPage: page,
  }) => {
    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.onboarding)
    await expect(heading(page, TEXT.onboardingIntro)).toBeVisible()
    // 취향 화면은 표시되지 않는다
    await expect(heading(page, TEXT.tasteTitle)).toHaveCount(0)
  })

  test('US1-4 · 온보딩 미완료로 이탈했다가 다시 접속하면 이어서 진행할 경로가 제시된다 (FR-009)', async ({
    authedPage: page,
  }) => {
    // 온보딩을 시작만 하고(1/3 에서 하나 고른 채) 이탈한다
    await page.goto('/onboarding')
    await clickAndSee(
      page.getByRole('button', { name: '시작하기', exact: true }),
      heading(page, TEXT.onboardingStep1),
    )
    await selectCategoryChip(page, CATEGORY.TUMBLER)
    // 취향 데이터와 무관한 영역(마이 탭)은 차단되지 않는다 (FR-018)
    await page.goto('/my')
    await expect(page).toHaveURL(/\/my$/)

    // 다시 접속 — 취향 화면으로 가려 하면 온보딩으로 유도되고, 거기서 곧바로 이어서 시작할 수 있다
    await page.getByRole('link', { name: '내 취향', exact: true }).click()
    await expect(page).toHaveURL(URLS.onboarding)
    await clickAndSee(
      page.getByRole('button', { name: '시작하기', exact: true }),
      heading(page, TEXT.onboardingStep1),
    )
    // 2/3 완료 전에는 아무것도 저장되지 않으므로 선택은 처음부터 다시 한다
    await expect(page.getByText('0개 선택됨')).toBeVisible()
  })

  test('US1-2 · 아무 대분류도 고르지 않으면 저장으로 나아갈 수 없고 선택 안내가 표시된다', async ({
    authedPage: page,
  }) => {
    await page.goto('/onboarding')
    await clickAndSee(
      page.getByRole('button', { name: '시작하기', exact: true }),
      heading(page, TEXT.onboardingStep1),
    )
    const next = page.getByRole('button', { name: '다음', exact: true })
    await expect(page.getByText('0개 선택됨')).toBeVisible()
    await expect(next).toBeDisabled()

    // 하나 고르면 열리고, 다시 빼면 닫힌다
    await selectCategoryChip(page, CATEGORY.TUMBLER)
    await expect(page.getByText('1개 선택됨')).toBeVisible()
    await expect(next).toBeEnabled()
    await page.getByRole('button', { name: CATEGORY.TUMBLER, exact: true }).click()
    await expect(page.getByText('0개 선택됨')).toBeVisible()
    await expect(next).toBeDisabled()
    await expect(heading(page, TEXT.onboardingStep1)).toBeVisible()

    // 저장된 것이 없으므로 취향 화면은 여전히 닫혀 있다
    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.onboarding)
  })

  test('US1-1 · 관심 없어요 대분류 하나만 골라 저장하면 온보딩이 완료되고 취향 화면에 나타난다', async ({
    authedPage: page,
  }) => {
    await completeOnboarding(page, [{ category: CATEGORY.TUMBLER, kind: 'UNWANTED' }])

    await expect(row(page, SECTION.UNWANTED, CATEGORY.TUMBLER)).toBeVisible()
    await expect(
      section(page, SECTION.UNWANTED).getByRole('heading', { name: `${SECTION.UNWANTED} (1)` }),
    ).toBeVisible()
    await expect(section(page, SECTION.HAVE).getByText(TEXT.sectionEmpty)).toBeVisible()

    // 온보딩 완료로 처리됐다 — 새로 진입해도 취향 화면이 열린다
    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.taste)
    await expect(heading(page, TEXT.tasteTitle)).toBeVisible()
  })

  test('US1-3 · 이미 있어요 와 관심 없어요 가 서로 다른 묶음으로 구분되어 보인다', async ({
    authedPage: page,
  }) => {
    await completeOnboarding(page, [
      { category: CATEGORY.TUMBLER, kind: 'HAVE' },
      { category: CATEGORY.PERFUME, kind: 'UNWANTED' },
    ])

    const have = section(page, SECTION.HAVE)
    const unwanted = section(page, SECTION.UNWANTED)
    await expect(have.getByRole('heading', { name: `${SECTION.HAVE} (1)` })).toBeVisible()
    await expect(unwanted.getByRole('heading', { name: `${SECTION.UNWANTED} (1)` })).toBeVisible()
    await expect(row(page, SECTION.HAVE, CATEGORY.TUMBLER)).toBeVisible()
    await expect(row(page, SECTION.UNWANTED, CATEGORY.PERFUME)).toBeVisible()
    // 서로의 묶음에 섞이지 않는다
    await expect(row(page, SECTION.HAVE, CATEGORY.PERFUME)).toHaveCount(0)
    await expect(row(page, SECTION.UNWANTED, CATEGORY.TUMBLER)).toHaveCount(0)
  })

  test('US1-6 뒷부분 · 로그인 후 목적지(/taste)는 온보딩 완료 여부에 따라 갈린다 (FR-019)', async ({
    authedPage: page,
  }) => {
    // /taste 는 auth/callback 의 기본 목적지다 — 미완료면 온보딩으로
    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.onboarding)

    // 완료 뒤에는 취향 화면으로
    await completeOnboarding(page, [{ category: CATEGORY.TUMBLER, kind: 'HAVE' }])
    await page.goto('/taste')
    await expect(page).toHaveURL(URLS.taste)
    await expect(heading(page, TEXT.tasteTitle)).toBeVisible()
  })

  test.describe('SC-006 · 폭 360', () => {
    test.use({ viewport: { width: 360, height: 740 } })

    test('온보딩 각 스텝과 취향 화면에 가로 스크롤이 없다', async ({ authedPage: page }) => {
      await completeOnboarding(
        page,
        [
          { category: CATEGORY.TUMBLER, kind: 'HAVE', detail: '스타벅스 텀블러' },
          { category: CATEGORY.PERFUME, kind: 'UNWANTED' },
        ],
        {
          description: '아침에 혼자 커피 내리는 15분이 좋아요. 산미 있는 원두를 주로 마셔요.',
          onStep: async (step) => {
            // 1/3 은 대분류 40개를 전부 펼친 상태로 본다
            if (step === 'categories') {
              await page.getByRole('button', { name: '더보기', exact: true }).click()
            }
            await expectNoHorizontalScroll(page)
          },
        },
      )
    })
  })
})
