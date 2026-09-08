/**
 * T039 — US3 링크를 통제한다 (spec.md User Story 3 · FR-005~FR-007 · FR-028~FR-034)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md | 테스트 |
 * |---------|--------|
 * | US3-1   | 관리 화면(SCR-M2-03)에 사용 인원수와 만료까지 남은 기간이 보인다 (FR-006) |
 * | US3-2   | 중지한 링크를 열면 만료 안내만 보이고 발급자의 표시명도 노출되지 않는다 (FR-005) |
 * | US3-3   | 중지·부재가 **같은 문구**다 — 어느 경우인지 구분해 알리지 않는다 (FR-007 · SC-005) |
 * | US3-4   | 중지한 뒤에도 새 링크를 발급받을 수 있다 (FR-004) |
 * | US3-5   | 성사 알림이 **읽지 않은 상태로** 최신순 맨 위에 보인다 (FR-017 · FR-029 · FR-030) |
 * | US3-6   | 알림을 누르면 그 친구의 취향 카드로 이동하고 읽음으로 바뀐다 (FR-032 · FR-031) |
 * | US3-7   | 모두 읽음을 누르면 전부 읽음으로 바뀐다 (FR-031) |
 * | US3-8   | 알림이 없으면 빈 상태 안내가 보인다 (FR-034) |
 * | SC-006  | 폭 360 에서 관리 화면·알림 목록에 가로 스크롤이 없다 |
 *
 * ⚠️ **만료 링크는 여기서 만들 수 없다.** 링크 수명은 7일(FR-003)이고 e2e 는 DB 를 직접
 * 만지지 않는다(DAL·prisma import 금지). 그래서 US3-3 은 **중지·부재** 두 경우가 같은 문구임을
 * 확인하고, 만료가 그 둘과 같은 응답이 되는 것은 세 경우가 `isValid()` 한 판정식을 공유한다는
 * 사실로 보장한다 — tests/unit/invite-valid.test.ts · dal-invite.test.ts 가 그 층을 판정한다.
 *
 * ⚠️ US3-1 의 "3명에게 쓰였다"는 계정이 둘뿐이라 **1명 사용**으로 확인한다. 숫자가 아니라
 * "사용 인원수가 실제 성사를 따라 보인다"가 검증 대상이다 (FR-006).
 *
 * 두 계정이 필요하다 (T001·T002). A(authedPage)가 링크를 만들고 B(friendPage)가 받는다.
 * env 가 비면 실패가 아니라 **skip** 된다 — `skipped` 수를 본다.
 */
import type { Browser, BrowserContextOptions, Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import {
  FRIEND_DETAIL_URL,
  becomeFriends,
  ensureOnboarded,
  readInvitePath,
  removeAllFriends,
} from './fixtures/friend-ui'
import { clickAndSee, expectNoHorizontalScroll } from './fixtures/taste-ui'

const MANAGE_URL = /\/friends\/invite\/manage(\?.*)?$/
const NOTIFICATIONS_URL = /\/notifications(\?.*)?$/

/** 만료·중지·부재를 하나로 합친 문구 (FR-007) — S 의 확정 문구가 바뀌면 여기만 고친다 */
const LINK_UNAVAILABLE_TEXT = /더 이상 쓸 수 없|만료/
/** 성사 알림 문구 — friend-invite.spec.ts(US1-6)와 같은 규칙으로 느슨하게 잡는다 */
const ACCEPTED_TEXT = /친구가 되었|친구가 됐/
/** 알림 목록의 미읽음 표식 — 시각적으로는 점, 접근성 이름으로는 이 문구다 (FR-030) */
const UNREAD_MARK = '읽지 않음'
/** 형식은 맞지만 존재하지 않는 토큰 — 32바이트 base64url 은 43자다 (research R2) */
const ABSENT_INVITE_PATH = `/i/${'z'.repeat(43)}`

// ── 화면 의존 probe ──────────────────────────────────────────────────────────

/**
 * US3-1~7 은 **다른 사람 몫의 화면을 지나야** 검증된다 — 링크 발급(T024)·미리보기(T027)·
 * 친구 상세(T037), 그리고 링크 관리 화면이 기대는 `lib/dal/invite.ts` 가 import 하는
 * `lib/dal/friend.ts`(T022). 그 전에는 라우트가 404(부재) 또는 500(모듈 부재)을 낸다.
 *
 * 그동안 이 시나리오들을 **실패로 두지 않고 skip 한다.** 남의 미착수 때문에 빨간 스위트를
 * 방치하면 진짜 회귀가 그 빨강에 묻힌다. 대신 **정적 skip 을 쓰지 않는다** — 화면이 서면
 * 아무도 이 파일을 고치지 않아도 probe 가 통과해 그날부터 다시 돈다.
 *
 * ⚠️ `npm run test:e2e` 결과에서 `passed` 만 보지 말고 **`skipped` 수를 본다** (team-assignment §3).
 * 여기 skip 이 남아 있는 동안 US3 의 수용 시나리오 7개는 아직 검증되지 않은 것이다.
 */
const PENDING_SCREENS_REASON =
  'US3 화면 의존 대기 — H 의 T022(lib/dal/friend.ts) · T024 발급 · T027 미리보기 · T037 친구 상세'

/** 화면 하나라도 서지 않았으면 그 자리에서 skip 한다. setup(온보딩·친구 정리)보다 먼저 부른다 */
async function skipUntilScreensExist(page: Page): Promise<void> {
  for (const path of ['/friends/invite', '/friends/invite/manage']) {
    const response = await page.goto(path)
    const status = response?.status()
    if (status === undefined || status >= 400) {
      test.skip(true, `${PENDING_SCREENS_REASON} — ${path} → ${status ?? '응답 없음'}`)
    }
  }
}

// ── 화면 헬퍼 ────────────────────────────────────────────────────────────────

function activeLinks(page: Page) {
  return page.getByRole('list', { name: '사용 중 링크' }).getByRole('listitem')
}

function notificationRows(page: Page) {
  return page.getByRole('list', { name: '알림 목록' }).getByRole('listitem')
}

async function openManage(page: Page): Promise<void> {
  await page.goto('/friends/invite/manage')
  await expect(page).toHaveURL(MANAGE_URL)
}

/** 사용 중 링크를 중지한다 — 확인 다이얼로그(SCR-M2-03)를 거친다 */
async function revokeActiveLink(page: Page): Promise<void> {
  await openManage(page)
  const dialog = page.getByRole('alertdialog', { name: /중지할까요/ })
  // 카드의 트리거는 '링크 중지', 다이얼로그의 확정 버튼은 '중지' — 열린 뒤에도 둘이 섞이지 않는다
  await clickAndSee(activeLinks(page).getByRole('button', { name: '링크 중지' }).first(), dialog)
  await dialog.getByRole('button', { name: '중지', exact: true }).click()
  await expect(dialog).toBeHidden()
  // 중지한 링크는 현재 링크만 보여주는 "사용 중" 목록에서 빠진다
  await expect(activeLinks(page)).toHaveCount(0)
}

/** 비가입 컨텍스트로 경로 하나를 열고 본문 줄들을 읽는다 — 미리보기는 공개다 (FR-008) */
async function readAnonymousLines(
  browser: Browser,
  contextOptions: BrowserContextOptions,
  path: string,
  expectText?: RegExp,
): Promise<string[]> {
  const context = await browser.newContext(contextOptions)
  try {
    const page = await context.newPage()
    await page.goto(path)
    if (expectText) await expect(page.getByText(expectText).first()).toBeVisible()
    const body = await page.locator('body').innerText()
    return body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } finally {
    await context.close()
  }
}

// ── US3-1 · 2 · 3 · 4 — 링크 통제 (SCR-M2-03) ────────────────────────────────

test.describe('US3-1·2·3·4 — 링크 통제', () => {
  test.beforeEach(async ({ authedPage, friendPage }) => {
    // 화면이 서지 않았으면 setup 을 돌리기 전에 skip 한다
    await skipUntilScreensExist(authedPage)
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)
  })

  test('US3-1 · 관리 화면에 사용 인원수와 만료까지 남은 기간이 보인다 (FR-006)', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await becomeFriends(pageA, pageB)

    await openManage(pageA)
    const active = activeLinks(pageA).first()
    await expect(active).toBeVisible()
    // 누적 수락 인원이 숫자로 보인다 — 재사용 계정은 이전 실행의 usedCount가 남을 수 있다
    await expect(active.getByText(/\d+명이 수락함/)).toBeVisible()
    await expect(active.getByRole('button', { name: '링크 복사' })).toBeVisible()
    // 만료까지 남은 기간 — 발급 + 7일 (FR-003)
    await expect(active.getByText(/후 만료|오늘 만료/)).toBeVisible()
  })

  test('US3-2 · 중지한 링크를 열면 만료 안내만 보이고 발급자의 표시명도 노출되지 않는다 (FR-005)', async ({
    authedPage: pageA,
    browser,
    contextOptions,
  }) => {
    const invitePath = await readInvitePath(pageA)

    // 중지 전 미리보기 — 여기에는 발급자의 표시명·대표 태그가 들어 있다 (FR-011)
    const previewLines = await readAnonymousLines(browser, contextOptions, invitePath)
    const absentLines = await readAnonymousLines(
      browser,
      contextOptions,
      ABSENT_INVITE_PATH,
      LINK_UNAVAILABLE_TEXT,
    )
    // 미리보기에만 있던 줄 = 발급자에게서 나온 정보. 중지 뒤에는 이 중 어느 것도 남으면 안 된다
    const inviterLines = previewLines.filter((line) => !absentLines.includes(line))
    expect(inviterLines.length, '중지 전 미리보기가 발급자 정보를 보여주지 않았다').toBeGreaterThan(
      0,
    )

    await revokeActiveLink(pageA)

    const revokedLines = await readAnonymousLines(
      browser,
      contextOptions,
      invitePath,
      LINK_UNAVAILABLE_TEXT,
    )
    for (const line of inviterLines) {
      expect(revokedLines, `중지 뒤에도 발급자 정보가 남아 있다: ${line}`).not.toContain(line)
    }
  })

  test('US3-3 · 중지된 링크와 없는 링크가 같은 문구를 낸다 (FR-007 · SC-005)', async ({
    authedPage: pageA,
    browser,
    contextOptions,
  }) => {
    const invitePath = await readInvitePath(pageA)
    await revokeActiveLink(pageA)

    const revoked = await readAnonymousLines(
      browser,
      contextOptions,
      invitePath,
      LINK_UNAVAILABLE_TEXT,
    )
    const absent = await readAnonymousLines(
      browser,
      contextOptions,
      ABSENT_INVITE_PATH,
      LINK_UNAVAILABLE_TEXT,
    )

    // 두 경우가 **줄 하나까지 같아야** 한다 — 다르면 토큰 탐색에 힌트가 된다
    expect(revoked).toEqual(absent)
  })

  test('US3-4 · 중지한 뒤에도 새 링크를 발급받을 수 있다 (FR-004)', async ({
    authedPage: pageA,
  }) => {
    const before = await readInvitePath(pageA)
    await revokeActiveLink(pageA)

    // 발급 화면에 다시 들어가면 유효한 링크가 없으므로 새로 발급된다
    const after = await readInvitePath(pageA)
    expect(after).not.toBe(before)

    // 관리 화면은 현재 사용할 수 있는 링크에만 집중한다
    await openManage(pageA)
    await expect(activeLinks(pageA)).toHaveCount(1)
  })
})

// ── US3-5 · 6 · 7 — 알림 (SCR-M3-02) ─────────────────────────────────────────

test.describe('US3-5·6·7 — 알림', () => {
  test.beforeEach(async ({ authedPage, friendPage }) => {
    // 화면이 서지 않았으면 setup 을 돌리기 전에 skip 한다
    await skipUntilScreensExist(authedPage)
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)
    // 이전 실행이 남긴 미읽음을 지운다 — US3-5 는 "새로 생긴 알림이 맨 위"를 본다
    await markAllReadIfAny(authedPage)
  })

  test('US3-5 · 성사 알림이 읽지 않은 상태로 최신순 맨 위에 보인다 (FR-017·FR-029·FR-030)', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await becomeFriends(pageA, pageB)

    await pageA.goto('/notifications')
    await expect(pageA).toHaveURL(NOTIFICATIONS_URL)
    const first = notificationRows(pageA).first()
    await expect(first.getByText(ACCEPTED_TEXT)).toBeVisible()
    await expect(first.getByText(UNREAD_MARK)).toBeVisible()
    // 방금 생긴 것이 맨 위다 — 목록 전체에서 미읽음은 이 한 건뿐이다 (beforeEach 가 비웠다)
    await expect(pageA.getByText(UNREAD_MARK)).toHaveCount(1)
  })

  test('US3-6 · 알림을 누르면 그 친구의 취향 카드로 이동하고 읽음으로 바뀐다 (FR-032·FR-031)', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    const { bId } = await becomeFriends(pageA, pageB)

    await pageA.goto('/notifications')
    await notificationRows(pageA).first().click()

    // 그 친구의 취향 카드 (SCR-M2-06)
    await expect(pageA).toHaveURL(FRIEND_DETAIL_URL)
    expect(pageA.url()).toContain(`/friends/${bId}`)

    // 돌아오면 읽음으로 바뀌어 있다 — 낙관적 갱신이 아니라 서버에 남았는지를 본다
    await pageA.goto('/notifications')
    await expect(pageA.getByText(UNREAD_MARK)).toHaveCount(0)
  })

  test('US3-7 · 모두 읽음을 누르면 전부 읽음으로 바뀐다 (FR-031)', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await becomeFriends(pageA, pageB)

    await pageA.goto('/notifications')
    await expect(pageA.getByText(UNREAD_MARK).first()).toBeVisible()
    await pageA.getByRole('button', { name: '모두 읽음' }).click()
    await expect(pageA.getByText(UNREAD_MARK)).toHaveCount(0)

    // 새로 고쳐도 읽음이다 — 화면 상태만 바뀐 것이 아니다
    await pageA.reload()
    await expect(pageA.getByText(UNREAD_MARK)).toHaveCount(0)
  })
})

// ── US3-8 — 빈 상태 ──────────────────────────────────────────────────────────

test.describe('US3-8 — 알림 빈 상태 (FR-034)', () => {
  test('알림이 하나도 없으면 빈 상태 안내가 보인다', async ({ friendPage: pageB }) => {
    // 알림은 **발급자에게만** 간다 (T040 이 판정한다). B 는 링크를 받기만 하므로 목록이 비어 있다.
    await ensureOnboarded(pageB)

    await pageB.goto('/notifications')
    await expect(pageB).toHaveURL(NOTIFICATIONS_URL)
    await expect(notificationRows(pageB)).toHaveCount(0)
    // 빈 목록만 두지 않는다 — 무엇이 여기 쌓이는지 알려준다
    await expect(pageB.getByText(/알림이 없어요/)).toBeVisible()
  })
})

// ── SC-006 — 폭 360 ──────────────────────────────────────────────────────────

test.describe('SC-006 · 폭 360', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('관리 화면과 알림 목록에 가로 스크롤이 없다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await skipUntilScreensExist(pageA)
    await ensureOnboarded(pageA)
    await ensureOnboarded(pageB)
    await removeAllFriends(pageA)
    await removeAllFriends(pageB)
    await becomeFriends(pageA, pageB)

    await openManage(pageA)
    await expectNoHorizontalScroll(pageA)

    await pageA.goto('/notifications')
    await expect(notificationRows(pageA).first()).toBeVisible()
    await expectNoHorizontalScroll(pageA)
  })
})

/** 알림이 있으면 전부 읽음으로 만든다 — 없으면 버튼도 없으므로 아무것도 하지 않는다 */
async function markAllReadIfAny(page: Page): Promise<void> {
  await page.goto('/notifications')
  const markAll = page.getByRole('button', { name: '모두 읽음' })
  if ((await markAll.count()) === 0) return
  await markAll.click()
  await expect(page.getByText(UNREAD_MARK)).toHaveCount(0)
}
