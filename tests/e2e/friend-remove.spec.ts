/**
 * T049 — US4 친구를 해제한다 (spec.md User Story 4 · FR-024~FR-027)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md | 테스트 |
 * |---------|--------|
 * | US4-1   | 해제 전에 무엇이 닫히는지 안내하고 확인을 받는다 — 취소하면 그대로다 |
 * | US4-2   | 확인하면 양쪽 목록에서 사라지고 양방향으로 접근이 차단된다 |
 * | US4-3   | 해제 이력이 있어도 다시 링크로 친구가 된다 (FR-026) |
 * | US4-4   | 해제된 상대의 취향 카드 주소로 직접 접근하면 거부된다 |
 * | SC-006  | 폭 360 에서 메뉴 시트·확인 다이얼로그에 가로 스크롤이 없다 |
 *
 * 두 계정이 필요하다 (team-assignment §3 T001·T002). A(E2E_USER)가 링크를 만들고 B(E2E_USER2)가 받는다.
 * env 가 비면 실패가 아니라 **skip** 된다 — `skipped` 수를 본다.
 *
 * e2e 에서는 DB 를 직접 만지지 않는다 — 친구 관계의 초기화도 UI(해제)로 한다.
 * 화면 구조(H 의 친구 목록·상세)에 최소로 의존한다: 상세 링크는 `/friends/<uuid>` 경로로,
 * 초대 링크는 토큰 형태(`/i/<43자 base64url>`, research R2)로 찾는다.
 *
 * ⚠️ 아래 두 번째 계정 픽스처는 D 의 T017(`tests/e2e/fixtures/auth.ts` 확장)이 origin/main 에
 *    오르면 그것으로 바꾼다. 로그인·쿠키 직렬화는 auth.ts 가 export 하는 것을 그대로 쓴다.
 */
import type { Locator, Page } from '@playwright/test'
import { createClient, type Session } from '@supabase/supabase-js'
import { expect, test as base, toSupabaseAuthCookies } from './fixtures/auth'
import { clickAndSee, expectNoHorizontalScroll } from './fixtures/taste-ui'

const E2E_USER2_SKIP_REASON =
  'E2E_USER2_EMAIL/E2E_USER2_PASSWORD 미설정 — 두 계정이 필요한 E2E 를 건너뛴다 (team-assignment §3 T001·T002)'

// ── 두 번째 계정 픽스처 (T017 전까지의 임시) ─────────────────────────────────────

type WorkerFixtures = {
  /** 워커당 한 번만 로그인한 B 계정 세션. env 가 없으면 null (→ friendPage 가 skip) */
  e2eSession2: Session | null
}

type TestFixtures = {
  /** B 계정으로 로그인된 **별도 브라우저 컨텍스트**의 page — A(authedPage)와 쿠키가 섞이지 않는다 */
  friendPage: Page
}

function requireSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_URL 이 비어 있다. .env.local 을 확인할 것.')
  return value
}

const test = base.extend<TestFixtures, WorkerFixtures>({
  e2eSession2: [
    async ({}, provide) => {
      const email = process.env.E2E_USER2_EMAIL
      const password = process.env.E2E_USER2_PASSWORD
      if (!email || !password) {
        await provide(null)
        return
      }
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY 이 비어 있다. .env.local 을 확인할 것.')

      const supabase = createClient(requireSupabaseUrl(), anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.session) {
        throw new Error(
          `두 번째 E2E 계정 로그인 실패: ${error?.message ?? '세션 없음'} — ` +
            'Supabase 대시보드에서 계정이 Auto Confirm 상태인지 확인 (team-assignment §3)',
        )
      }
      await provide(data.session)
    },
    { scope: 'worker' },
  ],

  friendPage: async ({ browser, contextOptions, baseURL, e2eSession2 }, provide) => {
    if (!e2eSession2) {
      test.skip(true, E2E_USER2_SKIP_REASON)
      return
    }
    const context = await browser.newContext(contextOptions)
    await context.addCookies(
      toSupabaseAuthCookies(e2eSession2, requireSupabaseUrl(), baseURL ?? 'http://localhost:3000'),
    )
    const page = await context.newPage()
    await provide(page)
    await context.close()
  },
})

// ── 로케이터 · 헬퍼 ─────────────────────────────────────────────────────────────

const FRIENDS_URL = /\/friends(\?.*)?$/
const FRIEND_DETAIL_URL = /\/friends\/([0-9a-f-]{36})(\?.*)?$/
/** 초대 링크 경로 — 32바이트 base64url 토큰은 43자다 (research R2) */
const INVITE_PATH = /\/i\/[A-Za-z0-9_-]{43}/

/** 친구 목록(SCR-M2-01)에서 친구 상세로 가는 링크 — `/friends/invite` 계열은 뺀다 */
function friendDetailLinks(page: Page): Locator {
  return page.locator('a[href^="/friends/"]:not([href^="/friends/invite"])')
}

function moreButton(page: Page): Locator {
  return page.getByRole('button', { name: '더보기', exact: true })
}

function menuSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: '친구 관리', exact: true })
}

function removeDialog(page: Page): Locator {
  return page.getByRole('alertdialog', { name: /해제할까요/ })
}

/** 링크 발급 화면(SCR-M2-02)에서 초대 링크 경로를 읽는다 — 본문·입력값·href 어디에 있든 토큰 형태로 찾는다 */
async function readInvitePath(page: Page): Promise<string> {
  await page.goto('/friends/invite')
  await expect(page).toHaveURL(/\/friends\/invite(\?.*)?$/)
  const found: { path: string | null } = { path: null }
  await expect(async () => {
    found.path = await page.evaluate((pattern) => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea')).map(
        (el) => el.value,
      )
      const hrefs = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).map(
        (el) => el.href,
      )
      const match = [document.body.innerText, ...inputs, ...hrefs].join('\n').match(new RegExp(pattern))
      return match ? match[0] : null
    }, INVITE_PATH.source)
    expect(found.path, '발급 화면에 초대 링크(/i/<token>)가 보이지 않는다').not.toBeNull()
  }).toPass({ timeout: 20_000 })
  if (!found.path) throw new Error('초대 링크를 읽지 못했다')
  return found.path
}

/** 친구 목록에 정확히 한 명이 있을 때 그 userId 를 돌려준다 */
async function onlyFriendId(page: Page): Promise<string> {
  await page.goto('/friends')
  await expect(page).toHaveURL(FRIENDS_URL)
  const links = friendDetailLinks(page)
  await expect(links).toHaveCount(1)
  const href = await links.first().getAttribute('href')
  const match = href?.match(FRIEND_DETAIL_URL)
  if (!match) throw new Error(`친구 상세 링크 형식이 아니다: ${href}`)
  return match[1]
}

/**
 * A 의 링크를 B 가 연다. 로그인 상태이므로 즉시 성사되고(US1), 이미 친구면 상세로 간다 (contracts §3).
 * 양쪽 목록에 서로가 한 명씩 있어야 한다 — 그 userId 쌍을 돌려준다.
 */
async function becomeFriends(pageA: Page, pageB: Page): Promise<{ aId: string; bId: string }> {
  const invitePath = await readInvitePath(pageA)
  await pageB.goto(invitePath)
  const aId = await onlyFriendId(pageB)
  const bId = await onlyFriendId(pageA)
  return { aId, bId }
}

/** 친구 상세(SCR-M2-06)에서 `⋮` → 친구 해제 → 확인 다이얼로그(SCR-M2-07)를 연다 */
async function openRemoveDialog(page: Page): Promise<Locator> {
  await expect(page).toHaveURL(FRIEND_DETAIL_URL)
  await clickAndSee(moreButton(page), menuSheet(page))
  await menuSheet(page).getByRole('button', { name: '친구 해제', exact: true }).click()
  await expect(menuSheet(page)).toBeHidden()
  const dialog = removeDialog(page)
  await expect(dialog).toBeVisible()
  return dialog
}

/** 확인 다이얼로그의 해제 → 목록으로 돌아오면 완료 */
async function confirmRemove(page: Page, dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: '해제', exact: true }).click()
  await expect(page).toHaveURL(FRIENDS_URL, { timeout: 15_000 })
  await expect(dialog).toBeHidden()
}

/** 해제된 상대의 상세는 requireActiveFriendship 이 거부한다 — notFound() → 404 */
async function expectAccessDenied(page: Page, path: string): Promise<void> {
  const response = await page.goto(path)
  expect(response?.status(), `${path} 가 열렸다 — 해제 후에는 거부돼야 한다 (FR-025)`).toBe(404)
}

/** 계정의 친구를 UI 로 전부 해제한다 — 한쪽이 끊으면 양쪽에서 사라지므로(FR-025) 종료 조건은 빈 목록이다 */
async function removeAllFriends(page: Page): Promise<void> {
  const MAX_ITERATIONS = 20
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    await page.goto('/friends')
    await expect(page).toHaveURL(FRIENDS_URL)
    const links = friendDetailLinks(page)
    if ((await links.count()) === 0) return
    await links.first().click()
    await confirmRemove(page, await openRemoveDialog(page))
  }
  throw new Error(`친구를 ${MAX_ITERATIONS}번 해제해도 목록이 비지 않는다 — 실사용 계정이 아닌지 확인`)
}

// ── 시나리오 ────────────────────────────────────────────────────────────────────

test.describe('US4 — 친구 해제', () => {
  test.beforeEach(async ({ authedPage, friendPage }) => {
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)
  })

  test('US4-1 · 해제 전에 무엇이 닫히는지 안내하고 확인을 받는다 — 취소하면 그대로다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    const { aId } = await becomeFriends(pageA, pageB)

    await pageB.goto(`/friends/${aId}`)
    const dialog = await openRemoveDialog(pageB)
    await expect(dialog.getByText('서로의 취향을 볼 수 없게 됩니다')).toBeVisible()
    // M2 에는 거래가 없다 — 이 문구가 있으면 거짓말이 된다 (research R9 · spec 가정)
    await expect(dialog.getByText(/진행 중인 선물|펀딩/)).toHaveCount(0)

    await dialog.getByRole('button', { name: '취소', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(pageB).toHaveURL(FRIEND_DETAIL_URL)

    // 여전히 친구다 — 재조회해도 상세가 열리고 양쪽 목록에 남아 있다
    await pageB.reload()
    await expect(moreButton(pageB)).toBeVisible()
    await pageA.goto('/friends')
    await expect(friendDetailLinks(pageA)).toHaveCount(1)
  })

  test('US4-2 · 확인하면 양쪽 목록에서 사라지고 양방향으로 접근이 차단된다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    const { aId, bId } = await becomeFriends(pageA, pageB)

    await pageB.goto(`/friends/${aId}`)
    await confirmRemove(pageB, await openRemoveDialog(pageB))

    // 양쪽 친구 목록에서 서로가 사라진다 (FR-025)
    await expect(friendDetailLinks(pageB)).toHaveCount(0)
    await pageA.goto('/friends')
    await expect(friendDetailLinks(pageA)).toHaveCount(0)

    // 양방향 접근 차단 — 이미 렌더된 화면을 신뢰하지 않는다 (Edge Case: 새로고침)
    await expectAccessDenied(pageB, `/friends/${aId}`)
    await expectAccessDenied(pageA, `/friends/${bId}`)
  })

  test('US4-3 · 해제 이력이 있어도 다시 링크로 친구가 된다 (FR-026)', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    const first = await becomeFriends(pageA, pageB)
    await pageB.goto(`/friends/${first.aId}`)
    await confirmRemove(pageB, await openRemoveDialog(pageB))
    await expectAccessDenied(pageB, `/friends/${first.aId}`)

    // 같은 링크로 다시 — 과거 해제 이력이 재추가를 막지 않는다 (C3 는 REMOVED 행을 무시한다)
    const again = await becomeFriends(pageA, pageB)
    expect(again.aId).toBe(first.aId)
    expect(again.bId).toBe(first.bId)

    await pageB.goto(`/friends/${again.aId}`)
    await expect(moreButton(pageB)).toBeVisible()
    await pageA.goto(`/friends/${again.bId}`)
    await expect(moreButton(pageA)).toBeVisible()
  })

  test('US4-4 · 해제된 상대의 취향 카드 주소로 직접 접근하면 거부된다 — 발급자가 끊어도 같다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    const { aId, bId } = await becomeFriends(pageA, pageB)

    // 이번엔 발급자(A)가 끊는다 — 어느 쪽이 눌러도 한 행이 바뀌고 둘 다 차단된다 (FR-025)
    await pageA.goto(`/friends/${bId}`)
    await confirmRemove(pageA, await openRemoveDialog(pageA))

    await expectAccessDenied(pageA, `/friends/${bId}`)
    await expectAccessDenied(pageB, `/friends/${aId}`)
  })

  test.describe('SC-006 · 폭 360', () => {
    test.use({ viewport: { width: 360, height: 740 } })

    test('메뉴 시트와 해제 확인 다이얼로그에 가로 스크롤이 없다', async ({
      authedPage: pageA,
      friendPage: pageB,
    }) => {
      const { aId } = await becomeFriends(pageA, pageB)

      await pageB.goto(`/friends/${aId}`)
      await expectNoHorizontalScroll(pageB)

      await clickAndSee(moreButton(pageB), menuSheet(pageB))
      await expectNoHorizontalScroll(pageB)

      await menuSheet(pageB).getByRole('button', { name: '친구 해제', exact: true }).click()
      await expect(removeDialog(pageB)).toBeVisible()
      await expectNoHorizontalScroll(pageB)
    })
  })
})
