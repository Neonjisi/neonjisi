/**
 * M2 친구 흐름 E2E 헬퍼 — US1~US4 스펙(friend-invite·friend-taste·invite-control·friend-remove)이
 * 함께 쓴다. 셀렉터 규칙은 taste-ui.ts 와 같다: role · label · text 로만 잡는다 (data-testid 없음).
 *
 * gnuke-dev 의 friend-remove.spec.ts(T049)에 임시로 있던 헬퍼를 공용 fixture 로 올린 것이다 —
 * 그쪽 스펙은 merge 후 이 파일을 import 하는 것으로 바꾼다.
 *
 * e2e 에서는 DB 를 직접 만지지 않는다(DAL·prisma import 금지) — 친구 관계의 초기화도
 * **UI(해제)로** 한다. 화면 구조(H 의 목록·상세)에는 최소로 의존한다: 상세 링크는
 * `/friends/<uuid>` 경로 형태로, 초대 링크는 토큰 형태(`/i/<43자 base64url>`, research R2)로 찾는다.
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { CATEGORY, URLS, clickAndSee, completeOnboarding } from './taste-ui'

/**
 * 계정을 온보딩 완료 상태로 만든다 — 링크 발급·성사는 취향을 등록한 사용자의 행동이다 (US1).
 * 이미 완료면 아무것도 하지 않는다. 초기화가 필요하면 taste-ui 의 resetAccount() 를 먼저 쓴다.
 */
export async function ensureOnboarded(page: Page): Promise<void> {
  await page.goto('/taste')
  await expect(page).toHaveURL(/\/(taste|onboarding)(\?.*)?$/)
  if (URLS.onboarding.test(page.url())) {
    await completeOnboarding(page, [{ category: CATEGORY.TUMBLER, kind: 'HAVE' }])
  }
}

export const FRIENDS_URL = /\/friends(\?.*)?$/
export const FRIEND_DETAIL_URL = /\/friends\/([0-9a-f-]{36})(\?.*)?$/
/** 초대 링크 경로 — 32바이트 base64url 토큰은 43자다 (research R2) */
export const INVITE_PATH = /\/i\/[A-Za-z0-9_-]{43}/

/** 친구 목록(SCR-M2-01)에서 친구 상세로 가는 링크 — `/friends/invite` 계열은 뺀다 */
export function friendDetailLinks(page: Page): Locator {
  return page.locator('a[href^="/friends/"]:not([href^="/friends/invite"])')
}

export function moreButton(page: Page): Locator {
  return page.getByRole('button', { name: '더보기', exact: true })
}

export function menuSheet(page: Page): Locator {
  return page.getByRole('dialog', { name: '친구 관리', exact: true })
}

export function removeDialog(page: Page): Locator {
  return page.getByRole('alertdialog', { name: /해제할까요/ })
}

/** 링크 발급 화면(SCR-M2-02)에서 초대 링크 경로를 읽는다 — 본문·입력값·href 어디에 있든 토큰 형태로 찾는다 */
export async function readInvitePath(page: Page): Promise<string> {
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
      const match = [document.body.innerText, ...inputs, ...hrefs]
        .join('\n')
        .match(new RegExp(pattern))
      return match ? match[0] : null
    }, INVITE_PATH.source)
    expect(found.path, '발급 화면에 초대 링크(/i/<token>)가 보이지 않는다').not.toBeNull()
  }).toPass({ timeout: 20_000 })
  if (!found.path) throw new Error('초대 링크를 읽지 못했다')
  return found.path
}

/** 친구 목록에 정확히 한 명이 있을 때 그 userId 를 돌려준다 */
export async function onlyFriendId(page: Page): Promise<string> {
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
export async function becomeFriends(
  pageA: Page,
  pageB: Page,
): Promise<{ aId: string; bId: string }> {
  const invitePath = await readInvitePath(pageA)
  await pageB.goto(invitePath)
  const aId = await onlyFriendId(pageB)
  const bId = await onlyFriendId(pageA)
  return { aId, bId }
}

/** 친구 상세(SCR-M2-06)에서 `⋮` → 친구 해제 → 확인 다이얼로그(SCR-M2-07)를 연다 */
export async function openRemoveDialog(page: Page): Promise<Locator> {
  await expect(page).toHaveURL(FRIEND_DETAIL_URL)
  await clickAndSee(moreButton(page), menuSheet(page))
  await menuSheet(page).getByRole('button', { name: '친구 해제', exact: true }).click()
  await expect(menuSheet(page)).toBeHidden()
  const dialog = removeDialog(page)
  await expect(dialog).toBeVisible()
  return dialog
}

/** 확인 다이얼로그의 해제 → 목록으로 돌아오면 완료 */
export async function confirmRemove(page: Page, dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: '해제', exact: true }).click()
  await expect(page).toHaveURL(FRIENDS_URL, { timeout: 15_000 })
  await expect(dialog).toBeHidden()
}

/** 계정의 친구를 UI 로 전부 해제한다 — 한쪽이 끊으면 양쪽에서 사라지므로(FR-025) 종료 조건은 빈 목록이다 */
export async function removeAllFriends(page: Page): Promise<void> {
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
