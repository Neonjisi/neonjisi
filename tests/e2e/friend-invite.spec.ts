/**
 * T016 — US1 링크로 친구가 된다 (spec.md User Story 1 · FR-001~FR-017)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md | 테스트 |
 * |---------|--------|
 * | US1-1   | 발급 화면에 링크·만료 안내·"받은 사람이 바로 친구가 됩니다" 고지가 함께 보인다 (FR-014) |
 * | US1-2   | 재진입하면 새로 발급하지 않고 기존 링크를 그대로 보여준다 (FR-004) |
 * | US1-3   | 비가입자 미리보기 — 대표 태그까지만 보이고 취향 항목·서술은 보이지 않는다 (FR-009·FR-010) |
 * | US1-4   | 미리보기의 시작 진입점이 로그인으로 이어진다 — 아래 ⚠️ 참조 |
 * | US1-5   | 로그인 사용자가 링크를 열면 미리보기 없이 즉시 성사된다 (FR-013) |
 * | US1-6   | 성사 직후 발급자의 알림 목록에 성사 알림이 남는다 (FR-017) |
 * | US1-7   | 본인 링크를 열면 본인 링크 안내 — 성사되지 않는다 (FR-016) |
 * | SC-006  | 폭 360 에서 발급 화면·미리보기에 가로 스크롤이 없다 |
 *
 * ⚠️ US1-4 의 "가입과 온보딩을 마친다" 완주는 자동화하지 않는다 — 실 가입이 Google OAuth
 * 한 종류라 브라우저 자동화가 불가능하다 (fixtures/auth.ts 참조). 여기서는 진입점이 로그인으로
 * 이어지는 것까지 확인하고, 가입 후 성사 경로는 US1-5(세션 주입)가, 전체 완주는 quickstart V1 이 맡는다.
 *
 * 두 계정이 필요하다 (T001·T002). A(authedPage)가 링크를 만들고 B(friendPage)가 받는다.
 * env 가 비면 실패가 아니라 **skip** 된다 — `skipped` 수를 본다.
 *
 * 친구 관계의 초기화는 UI(해제, US4 화면)로 한다 — US4 구현 전에는 이 정리가 실패하므로
 * 성사 계열 테스트는 US4 화면과 함께 초록이 된다 (fixtures/friend-ui.ts).
 */
import { expect, test } from './fixtures/auth'
import {
  becomeFriends,
  ensureOnboarded,
  friendDetailLinks,
  onlyFriendId,
  readInvitePath,
  removeAllFriends,
} from './fixtures/friend-ui'
import {
  CATEGORY,
  URLS,
  addWantItem,
  completeOnboarding,
  expectNoHorizontalScroll,
  resetAccount,
} from './fixtures/taste-ui'

/** FR-014 — 승인 절차가 없다는 고지. 발급자가 링크를 뿌리기 **전에** 알아야 한다 (SC-003) */
const IMMEDIATE_FRIEND_NOTICE = '받은 사람이 바로 친구가 됩니다'
/** 성사 화면(SCR-M2-05)·성사 알림의 핵심 문구 — S 의 확정 문구가 바뀌면 여기만 고친다 */
const ACCEPTED_TEXT = /친구가 되었|친구가 됐/
/** 본인 링크 안내(contracts §3) — S 의 확정 문구가 바뀌면 여기만 고친다 */
const OWN_LINK_TEXT = /본인 링크|내 링크/

/** 미리보기에 보이면 안 되는 값들 (FR-009) — A 의 취향에 심어 두고 부재를 확인한다 */
const SECRET_DESCRIPTION = '비공개 취향 서술 E2E 검증용'
const SECRET_WANT_DETAIL = '비공개 원하는 것 상세 E2E 검증용'

test.describe('US1-1·2 — 링크 발급 (SCR-M2-02)', () => {
  test.beforeEach(async ({ authedPage }) => {
    await ensureOnboarded(authedPage)
  })

  test('US1-1 · 발급 화면에 링크·만료 안내·즉시 성사 고지가 함께 보인다 (FR-003·FR-014)', async ({
    authedPage: page,
  }) => {
    await readInvitePath(page) // /i/<43자 토큰> 형태의 링크가 보인다 (FR-001)
    await expect(page.getByText(/만료/).first()).toBeVisible()
    await expect(page.getByText(IMMEDIATE_FRIEND_NOTICE).first()).toBeVisible()
  })

  test('US1-2 · 재진입하면 새로 발급하지 않고 기존 링크를 그대로 보여준다 (FR-004)', async ({
    authedPage: page,
  }) => {
    const first = await readInvitePath(page)
    const second = await readInvitePath(page)
    expect(second).toBe(first)
  })
})

test.describe('US1-3·4 — 비가입자 미리보기 (SCR-M2-04)', () => {
  test('US1-3 · 대표 태그까지만 보이고 취향 항목·서술은 보이지 않는다 (FR-008~FR-012)', async ({
    authedPage: pageA,
    browser,
    contextOptions,
  }) => {
    // A 의 취향을 통제된 상태로: HAVE 텀블러 · WANT 향수(상세 있음) · 취향 서술
    await resetAccount(pageA)
    await completeOnboarding(pageA, [{ category: CATEGORY.TUMBLER, kind: 'HAVE' }], {
      description: SECRET_DESCRIPTION,
    })
    await addWantItem(pageA, { category: CATEGORY.PERFUME, detail: SECRET_WANT_DETAIL })

    const invitePath = await readInvitePath(pageA)
    const anonContext = await browser.newContext(contextOptions)
    try {
      const anonPage = await anonContext.newPage()
      await anonPage.goto(invitePath)

      // 로그인으로 튕기지 않는다 — 미리보기는 공개다 (FR-008, proxy matcher 밖)
      await expect(anonPage).not.toHaveURL(URLS.login)
      expect(anonPage.url()).toContain(invitePath)

      // 대표 태그: WANT 카테고리명 (FR-012)
      await expect(anonPage.getByText(CATEGORY.PERFUME).first()).toBeVisible()
      // 가려진 항목의 **이름**은 알린다 — 가입 동기를 만드는 장치 (FR-010)
      await expect(anonPage.getByText('원하는 것').first()).toBeVisible()
      await expect(anonPage.getByText('취향 서술').first()).toBeVisible()

      // 값은 감춘다 (FR-009): 서술·상세·WANT 밖 항목의 카테고리는 노출되지 않는다
      await expect(anonPage.getByText(SECRET_DESCRIPTION)).toHaveCount(0)
      await expect(anonPage.getByText(SECRET_WANT_DETAIL)).toHaveCount(0)
      await expect(anonPage.getByText(CATEGORY.TUMBLER)).toHaveCount(0)
    } finally {
      await anonContext.close()
    }
  })

  test('US1-4 · 미리보기의 시작 진입점이 로그인으로 이어진다', async ({
    authedPage: pageA,
    browser,
    contextOptions,
  }) => {
    await ensureOnboarded(pageA)
    const invitePath = await readInvitePath(pageA)

    const anonContext = await browser.newContext(contextOptions)
    try {
      const anonPage = await anonContext.newPage()
      await anonPage.goto(invitePath)
      await anonPage.locator('a, button').filter({ hasText: /시작/ }).first().click()
      await expect(anonPage).toHaveURL(URLS.login)
      await expect(anonPage.getByRole('button', { name: 'Google로 시작하기' })).toBeVisible()
    } finally {
      await anonContext.close()
    }
  })
})

test.describe('US1-5·6 — 즉시 성사와 발급자 알림', () => {
  test.beforeEach(async ({ authedPage, friendPage }) => {
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)
  })

  test('US1-5 · 로그인 사용자가 링크를 열면 미리보기 없이 즉시 성사된다 (FR-013)', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    const invitePath = await readInvitePath(pageA)
    await pageB.goto(invitePath)

    // 성사 화면 (SCR-M2-05)
    await expect(pageB.getByText(ACCEPTED_TEXT).first()).toBeVisible()

    // 양쪽 친구 목록에 서로가 나타난다
    await onlyFriendId(pageB)
    await onlyFriendId(pageA)
  })

  test('US1-6 · 성사 직후 발급자의 알림 목록에 성사 알림이 남는다 (FR-017)', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await becomeFriends(pageA, pageB)

    // 알림 목록(SCR-M3-02)은 US3(T046)에서 구현된다 — 그때 이 검증이 초록이 된다
    await pageA.goto('/notifications')
    await expect(pageA.getByText(ACCEPTED_TEXT).first()).toBeVisible()
  })
})

test.describe('US1-7 — 본인 링크 (FR-016)', () => {
  test.beforeEach(async ({ authedPage }) => {
    await ensureOnboarded(authedPage)
    await removeAllFriends(authedPage)
  })

  test('US1-7 · 본인 링크를 열면 본인 링크 안내가 보이고 성사되지 않는다', async ({
    authedPage: page,
  }) => {
    const invitePath = await readInvitePath(page)
    await page.goto(invitePath)

    await expect(page.getByText(OWN_LINK_TEXT).first()).toBeVisible()

    // 친구가 생기지 않았다 — 자기 자신과는 친구가 될 수 없다
    await page.goto('/friends')
    await expect(friendDetailLinks(page)).toHaveCount(0)
  })
})

test.describe('SC-006 — 폭 360 가로 스크롤 없음', () => {
  // expectNoHorizontalScroll 은 뷰포트 폭 360 을 전제로 한다 — chromium 프로젝트에서도
  // 돌므로 폭을 여기서 못 박는다 (taste-detail.spec.ts 와 같은 패턴)
  test.use({ viewport: { width: 360, height: 740 } })

  test('발급 화면과 미리보기에 가로 스크롤이 없다', async ({
    authedPage: pageA,
    browser,
    contextOptions,
  }) => {
    await ensureOnboarded(pageA)
    const invitePath = await readInvitePath(pageA)
    await expectNoHorizontalScroll(pageA)

    const anonContext = await browser.newContext(contextOptions)
    try {
      const anonPage = await anonContext.newPage()
      await anonPage.goto(invitePath)
      await expectNoHorizontalScroll(anonPage)
    } finally {
      await anonContext.close()
    }
  })
})
