/**
 * 취향 화면 E2E 헬퍼 — 셀렉터는 전부 role · label · text · placeholder 로 잡는다
 * (data-testid 없음). 화면 문구가 바뀌면 여기만 고친다.
 *
 * 상태를 **만드는** 일은 전부 UI 로 한다 (DAL·prisma import 금지). **지우는** 일만 예외로
 * DB 를 쓴다 — `resetAccount` 가 `taste-db.ts` 에 위임한다 (T029, 이유는 그 파일 머리말).
 * 종료 조건은 예전 UI 반복 삭제 판과 같다: 항목이 0건이면 온보딩이 미완료로 돌아가고
 * (US4-3), 그 뒤 /taste 는 /onboarding 으로 리다이렉트된다 (FR-018).
 */
import { expect, type Locator, type Page } from '@playwright/test'

import { sessionUserId } from './auth'
import { resetTasteProfile } from './taste-db'

/** prisma/seed.ts 의 앞 12개 — 온보딩 1/3 에서 '더보기' 없이 바로 보이는 대분류 */
export const CATEGORY = {
  TUMBLER: '텀블러',
  PERFUME: '향수',
  TOWEL: '수건',
} as const

/** /taste 의 섹션(aria-label) — taste-item-list.tsx SECTIONS */
export const SECTION = {
  WANT: '원하는 것',
  HAVE: '이미 있어요',
  UNWANTED: '관심 없어요',
} as const
export type SectionName = (typeof SECTION)[keyof typeof SECTION]

/** 종류 라디오 라벨 — onboarding-flow.tsx · taste-item-form.tsx 공통 */
export const KIND_LABEL = {
  HAVE: '이미 있어요',
  UNWANTED: '관심 없어요',
} as const
export type OnboardingKind = keyof typeof KIND_LABEL

export const URLS = {
  login: /\/login(\?.*)?$/,
  onboarding: /\/onboarding(\?.*)?$/,
  taste: /\/taste(\?.*)?$/,
} as const

/** 화면 문구 — 여러 spec 이 공유하는 것만 */
export const TEXT = {
  onboardingIntro: '선물이 어긋나는 건 몰라서입니다.',
  onboardingStep1: '이미 있거나 필요 없는 것을 골라주세요',
  onboardingStep2: '고른 것들, 어느 쪽인가요?',
  onboardingStep3: '어떤 걸 좋아하는지 한 줄만 적어주세요',
  onboardingDone: '준비됐어요',
  tasteTitle: '내 취향',
  wantEmpty: '친구가 볼 수 있게 원하는 걸 적어보세요',
  sectionEmpty: '아직 등록한 항목이 없어요',
  descriptionHint: '어떤 걸 좋아하는지 한 줄만 적어보세요',
  addSheetTitle: '취향 항목 추가',
  editSheetTitle: '취향 항목 편집',
  wantSheetTitle: '원하는 것을 적어주세요',
  descriptionSheetTitle: '취향 서술',
} as const

// ── 로케이터 ──────────────────────────────────────────────────────────────────

export function section(page: Page, name: SectionName | '취향 서술'): Locator {
  return page.getByRole('region', { name, exact: true })
}

/** 섹션의 항목 행 — `+`(항목 추가) 버튼은 텍스트가 없으므로 텍스트 있는 버튼만 */
export function rows(page: Page, name: SectionName): Locator {
  return section(page, name).getByRole('button').filter({ hasText: /\S/ })
}

/** 항목 행의 접근 가능한 이름은 화면 라벨에 동작 목적(`수정`)을 덧붙인다. */
export function row(page: Page, name: SectionName, label: string): Locator {
  return section(page, name).getByRole('button', { name: `${label} 수정`, exact: true })
}

export function sheet(page: Page, title: string): Locator {
  return page.getByRole('dialog', { name: title, exact: true })
}

/** 대분류 이름에 정규식 메타문자가 들어와도 안전하게 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 카테고리 선택 트리거(category-picker.tsx) — 접근 가능한 이름이 `<필드 라벨> <현재 값>` 이다.
 * 네이티브 select 의 읽기 순서를 따르려고 `aria-labelledby` 로 라벨과 값을 함께 묶었기 때문에
 * 값만으로는 exact 매칭이 안 된다. 이름의 **끝**이 값과 일치하는 버튼으로 잡는다.
 * (시트 안의 대분류 목록 버튼은 이름이 값 그대로라 여기를 쓰지 않는다)
 */
export function categoryTrigger(dialog: Locator, value: string): Locator {
  return dialog.getByRole('button', { name: new RegExp(`${escapeRegExp(value)}$`) })
}

export function heading(page: Page, name: string): Locator {
  return page.getByRole('heading', { name, exact: true })
}

// ── 인터랙션 ──────────────────────────────────────────────────────────────────

/**
 * 페이지 이동 직후 첫 클릭은 hydration 전에 씹힐 수 있다(dev 서버는 특히).
 * 기대 요소가 보일 때까지 클릭을 재시도한다 — 이동 후 **첫 인터랙션에만** 쓴다.
 */
export async function clickAndSee(trigger: Locator, target: Locator): Promise<void> {
  await expect(async () => {
    await trigger.click({ timeout: 5_000 })
    await expect(target).toBeVisible({ timeout: 1_500 })
  }).toPass({ timeout: 20_000 })
}

/** 폭 360 에서 가로 스크롤이 없어야 한다 (SC-006) */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const viewportWidth = page.viewportSize()?.width ?? 0
  expect(viewportWidth, 'SC-006 검사는 뷰포트 폭 360 에서만 의미가 있다').toBe(360)
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth, `가로 스크롤 발생 — scrollWidth ${scrollWidth} > 360`).toBeLessThanOrEqual(360)
}

/** 카테고리 선택 시트(SCR-M1-08)에서 검색 후 한 항목을 고른다 */
export async function pickCategory(
  page: Page,
  dialog: Locator,
  categoryName: string,
  currentLabel = '카테고리 선택',
): Promise<void> {
  await categoryTrigger(dialog, currentLabel).click()
  const picker = sheet(page, '카테고리 선택')
  await expect(picker).toBeVisible()
  await picker.getByRole('searchbox', { name: '카테고리 검색' }).fill(categoryName)
  await picker.getByRole('button', { name: categoryName, exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(categoryTrigger(dialog, categoryName)).toBeVisible()
}

function sheetTitleFor(sectionName: SectionName, isEditing: boolean): string {
  if (sectionName === SECTION.WANT) return TEXT.wantSheetTitle
  return isEditing ? TEXT.editSheetTitle : TEXT.addSheetTitle
}

/** 섹션 헤더의 `+` 로 추가 시트를 연다 */
export async function openAddSheet(page: Page, sectionName: SectionName): Promise<Locator> {
  const dialog = sheet(page, sheetTitleFor(sectionName, false))
  await clickAndSee(section(page, sectionName).getByRole('button', { name: '항목 추가' }), dialog)
  return dialog
}

/** 행을 탭해 편집 시트를 연다 */
export async function openEditSheet(
  page: Page,
  sectionName: SectionName,
  label: string,
): Promise<Locator> {
  const dialog = sheet(page, sheetTitleFor(sectionName, true))
  await clickAndSee(row(page, sectionName, label), dialog)
  return dialog
}

/** 시트의 저장 → 시트가 닫히면 성공 (실패면 시트가 남고 role=alert 가 뜬다, FR-016) */
export async function saveSheet(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: '저장', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

/** `이미 있어요`/`관심 없어요` 항목을 /taste 의 추가 시트로 등록한다 */
export async function addTasteItem(
  page: Page,
  input: { kind: OnboardingKind; category: string; detail?: string },
): Promise<void> {
  const dialog = await openAddSheet(page, SECTION.HAVE)
  await pickCategory(page, dialog, input.category)
  await dialog.getByText(KIND_LABEL[input.kind], { exact: true }).click()
  await expect(dialog.getByRole('radio', { name: KIND_LABEL[input.kind] })).toBeChecked()
  if (input.detail !== undefined) {
    await dialog.getByLabel('상세 (선택)').fill(input.detail)
  }
  await saveSheet(dialog)
}

/** `원하는 것` 항목을 /taste 의 추가 시트로 등록한다 — 이 시트는 상세(무엇인가요?)가 필수다 */
export async function addWantItem(
  page: Page,
  input: { category: string; detail: string },
): Promise<void> {
  const dialog = await openAddSheet(page, SECTION.WANT)
  await pickCategory(page, dialog, input.category)
  await dialog.getByLabel('무엇인가요?').fill(input.detail)
  await saveSheet(dialog)
}

/** 편집 시트의 삭제 → 확인 다이얼로그(alertdialog)의 삭제. 시트가 닫히면 완료 */
export async function confirmDeleteFromSheet(page: Page, dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: '삭제', exact: true }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

export async function deleteRow(page: Page, sectionName: SectionName, label: string): Promise<void> {
  const dialog = await openEditSheet(page, sectionName, label)
  await confirmDeleteFromSheet(page, dialog)
}

/** 취향 서술 카드의 편집 시트로 서술을 저장한다 (빈 문자열이면 비운다) */
export async function setDescription(page: Page, text: string): Promise<void> {
  const dialog = sheet(page, TEXT.descriptionSheetTitle)
  await clickAndSee(
    section(page, '취향 서술').getByRole('button', { name: '편집', exact: true }),
    dialog,
  )
  await dialog.getByRole('textbox').fill(text)
  await saveSheet(dialog)
}

// ── 상태 초기화 · 온보딩 ────────────────────────────────────────────────────────

/**
 * 테스트 계정을 **온보딩 미완료 · 항목 0건 · 서술 없음** 으로 되돌린다 (T029).
 * 종료 조건은 그대로다: /taste 진입이 /onboarding 으로 리다이렉트된다 (FR-018).
 *
 * 지우는 일은 `taste-db.ts` 가 DB 로 한다. 예전 판은 /taste 를 최대 305번 다시 열며
 * 항목을 한 건씩 지웠고, 그래서 앞 테스트가 쌓아 둔 만큼 뒤 테스트가 느려지는 순서
 * 의존이 생겼다 (`friend-invite.spec.ts` 뒤쪽 6개가 파일 전체 실행에서만 90초 초과).
 *
 * `원하는 것`이 숨어 남는 경우(온보딩 미완료라 /taste 를 못 여는 상태, FR-008)를 위해
 * 최소 온보딩을 먼저 밟던 우회도 함께 없앴다 — DB 삭제는 화면을 거치지 않는다.
 *
 * 마지막 한 줄이 예전 판의 안전장치를 대신한다: 지웠는데도 /taste 가 열린다면 화면과
 * DAL 의 온보딩 판정이 어긋난 것이고, 그건 이 초기화가 잡아야 할 결함이다.
 */
export async function resetAccount(page: Page): Promise<void> {
  await resetTasteProfile(await sessionUserId(page))

  await page.goto('/taste')
  await expect(
    page,
    '초기화 뒤에도 /taste 가 열린다 — 화면과 DAL 의 온보딩 판정이 어긋났다 (FR-018)',
  ).toHaveURL(URLS.onboarding)
}

export type OnboardingItem = { category: string; kind: OnboardingKind; detail?: string }
export type OnboardingStep = 'intro' | 'categories' | 'kinds' | 'description' | 'done' | 'taste'

type CompleteOnboardingOptions = {
  /** 3/3 에서 저장할 취향 서술. 없으면 '나중에 할게요' */
  description?: string
  /** 각 스텝 진입 직후 호출 — SC-006 가로 스크롤 검사 등 */
  onStep?: (step: OnboardingStep) => Promise<void>
}

/** 온보딩 1/3 의 대분류 칩을 고른다 — 앞 12개 밖이면 '더보기' 를 먼저 누른다 */
export async function selectCategoryChip(page: Page, categoryName: string): Promise<void> {
  const chip = page.getByRole('button', { name: categoryName, exact: true })
  if (!(await chip.isVisible())) {
    await page.getByRole('button', { name: '더보기', exact: true }).click()
  }
  await chip.click()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
}

/**
 * /onboarding 인트로부터 완료까지 UI 로 밟아 /taste 에 도착한다.
 * 첫 HAVE/UNWANTED 저장이 온보딩을 완료 처리한다 (FR-008).
 */
export async function completeOnboarding(
  page: Page,
  items: OnboardingItem[],
  options: CompleteOnboardingOptions = {},
): Promise<void> {
  const onStep = options.onStep ?? (async () => {})

  await page.goto('/onboarding')
  await expect(page).toHaveURL(URLS.onboarding)
  await expect(heading(page, TEXT.onboardingIntro)).toBeVisible()
  await onStep('intro')

  await clickAndSee(
    page.getByRole('button', { name: '시작하기', exact: true }),
    heading(page, TEXT.onboardingStep1),
  )
  await onStep('categories')
  for (const item of items) await selectCategoryChip(page, item.category)

  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(heading(page, TEXT.onboardingStep2)).toBeVisible()
  await onStep('kinds')
  for (const item of items) {
    const group = page.getByRole('region', { name: item.category, exact: true })
    await group.getByText(KIND_LABEL[item.kind], { exact: true }).click()
    await expect(group.getByRole('radio', { name: KIND_LABEL[item.kind] })).toBeChecked()
    if (item.detail !== undefined) await group.getByLabel('상세 (선택)').fill(item.detail)
  }

  // 2/3 완료 = createTasteItem 일괄 저장. 3/3 헤딩이 뜨면 저장이 끝난 것이다.
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(heading(page, TEXT.onboardingStep3)).toBeVisible({ timeout: 20_000 })
  await onStep('description')
  if (options.description !== undefined) {
    await page.getByRole('textbox').fill(options.description)
    await page.getByRole('button', { name: '저장하고 시작하기', exact: true }).click()
  } else {
    await page.getByRole('button', { name: '나중에 할게요', exact: true }).click()
  }

  await expect(heading(page, TEXT.onboardingDone)).toBeVisible({ timeout: 20_000 })
  await onStep('done')
  await page.getByRole('button', { name: '둘러볼게요', exact: true }).click()
  await expect(page).toHaveURL(URLS.taste, { timeout: 20_000 })
  await expect(heading(page, TEXT.tasteTitle)).toBeVisible()
  await onStep('taste')
}
