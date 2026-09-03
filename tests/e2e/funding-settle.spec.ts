/**
 * T030 — US3 마감이 성사·미달을 가르고 돈이 정리된다 (spec.md User Story 3 · FR-016~FR-018 ·
 * quickstart V4·V5). **이 파일이 초록이 되는 시점이 마일스톤 4 완료 판정(T033)이다.**
 *
 * quickstart ↔ 테스트 대응
 * | quickstart | 테스트 |
 * |---|---|
 * | V4-1 | 달성선 이상·목표 미만으로 채우고 마감을 과거로 → 조회 → **성사 + 차액 자동 결제 고지** |
 * | V5-1 | 달성선 미만으로 마감 → **미달 · 전액 환불** + "영업일 3~5일" 고정 문구 |
 * | V5-2 | 주최자가 진행 중 펀딩을 취소 → 환불 + **미달과 다른 문구** |
 *
 * 3주체다 (A=주최자 `authedPage` · B=수령자 `friendPage` · C=참여자 `thirdPage` — T003).
 * C 의 접근 근거는 "수령자의 활성 친구"라서(R6 `canViewFunding`) 친구 관계를 **A–B, B–C** 로 건다.
 *
 * ⚠️ **지금은 전부 skip 된다.** 정산 로직(T014·T031)과 알림 문구(T032)는 서 있지만, 상태를
 *    만들 화면이 없다 — 개설 SCR-M4-01~03(T020) · 상세 SCR-M4-04(T026) · 참여 SCR-M4-05(T027).
 *    각 단계에서 화면이 없으면 실패가 아니라 **probe 로 skip** 한다 (R12 — M3 US5 와 같은 구조).
 *    H 의 화면이 서면 아래 헬퍼의 **로케이터만** 그 마크업에 맞춘다 — 시나리오·판정은 그대로다.
 *    `skipped` 수를 반드시 확인한다.
 *
 * 마감은 화면으로 못 당기므로 DB 로 한다 (tasks.md T030 · fixtures/funding-db.ts — 쓰는 열은
 * `deadline` 하나뿐이다). 상태 전이·환불·차액 결제 자체의 검증은 통합 테스트가 이미 한다
 * (`tests/integration/funding-settle.test.ts` T013). 여기서 보는 것은 **사용자에게 보이는 결과**다.
 *
 * 결제는 항상 mock 이다 — 실키로 돌리면 테스트가 실결제를 만든다 (협업 규칙 §6).
 */
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { closeFundingDb, expireFundingDeadline } from './fixtures/funding-db'
import {
  ensureOnboarded,
  friendDetailLinks,
  onlyFriendId,
  readInvitePath,
  removeAllFriends,
} from './fixtures/friend-ui'

const CARD_BRAND = '신한'
const GOOD_CARD_LAST4 = '4821'

// 금액 설계 — 세 시나리오가 같은 목표로 갈린다 (달성선과 참여 금액만 바꾼다)
const GOAL = 30_000
/** 성사 케이스: 달성선 10,000 ≤ 참여 15,000 < 목표 30,000 → 차액 15,000 이 주최자 카드로 */
const MIN_LOW = 10_000
const CONTRIBUTION = 15_000
const TOPUP = GOAL - CONTRIBUTION
/** 미달 케이스: 참여 15,000 < 달성선 20,000 */
const MIN_HIGH = 20_000

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

/** S 의 확정 문구(lib/notification/display.ts)가 바뀌면 여기만 고친다 */
const TEXT = {
  succeeded: /펀딩이 성사되었어요/,
  topup: new RegExp(`차액 ${won(TOPUP)}이 내 결제수단으로 결제되었어요`),
  shortfall: /펀딩이 달성선에 못 미쳤어요/,
  cancelledByOrganizer: /주최자가 .*펀딩을 취소했어요/,
  refunded: new RegExp(`${won(CONTRIBUTION)}이 환불돼요`),
  /** 환불 안내는 미달·취소 어느 경로든 같은 한 문장이다 (clarify Q4) */
  refundNotice: '영업일 3~5일이 걸릴 수 있어요',
} as const

// ── 준비 ──────────────────────────────────────────────────────────────────────

/** 결제수단 하나를 등록한다 (SCR-M3-06 — 이미 서 있다). 주최자는 차액 부담용으로 필수다 (FR-004) */
async function registerCard(page: Page, last4: string = GOOD_CARD_LAST4): Promise<void> {
  await page.goto('/payment-methods/new')
  // 라디오 input 은 sr-only 라 라벨 텍스트를 누른다 (M1 fixtures/taste-ui.ts 와 같은 패턴)
  await page.getByText(CARD_BRAND, { exact: true }).click()
  await expect(page.getByRole('radio', { name: CARD_BRAND })).toBeChecked()
  await page.getByLabel('카드 뒷자리 4자리').fill(last4)
  await page.getByRole('button', { name: '등록하기' }).click()
  await expect(page).toHaveURL(/\/payment-methods$/)
}

/**
 * 초대 링크로 둘을 친구로 만든다.
 *
 * friend-ui.ts 의 `becomeFriends()` 는 "각자 친구가 정확히 1명"을 전제하는 2계정 헬퍼라
 * 3주체에는 못 쓴다 — B 는 A·C 둘과 친구가 된다. 성사 확인은 호출부에서 A·C 쪽으로 한다.
 */
async function linkFriends(inviter: Page, invitee: Page): Promise<void> {
  await invitee.goto(await readInvitePath(inviter))
  await expect(invitee.getByText(/친구가 되었|친구가 됐|이미 친구/).first()).toBeVisible()
}

/**
 * A·B·C 를 온보딩·친구 관계·결제수단까지 세운다. 친구 관계는 **A–B, B–C** 뿐이라
 * A 의 친구 목록에는 B 하나, C 의 친구 목록에도 B 하나만 남는다 — 개설 화면에서 수령자를
 * 고를 때 "첫 친구 = B" 가 성립하는 근거다.
 */
async function prepareTrio(organizer: Page, receiver: Page, contributor: Page): Promise<void> {
  for (const page of [organizer, receiver, contributor]) {
    await ensureOnboarded(page)
    await removeAllFriends(page)
  }
  await linkFriends(organizer, receiver)
  await linkFriends(receiver, contributor)
  await onlyFriendId(organizer) // A 의 친구 = B 하나 (링크 성사 확인)
  await onlyFriendId(contributor) // C 의 친구 = B 하나
  await registerCard(organizer) // 차액 부담 수단 (FR-004)
  await registerCard(contributor) // 참여 결제 수단
}

// ── 화면 조작 (H 의 화면이 서기 전에는 전부 null/false → skip) ──────────────────

/** 카탈로그에서 상품 하나를 고른다 (SCR-M3-03 — 이미 서 있다) */
async function firstProductId(page: Page): Promise<string | null> {
  await page.goto('/products')
  const link = page.locator('a[href^="/products/"]').first()
  if ((await link.count()) === 0) return null
  const href = await link.getAttribute('href')
  return /\/products\/([0-9a-f-]{36})/.exec(href ?? '')?.[1] ?? null
}

/**
 * 개설 화면(SCR-M4-01)까지 들어간다. 진입점은 두 갈래다 — 상품 상세의 "여럿이 모아서
 * 선물하기"(T021) · `/fundings/new` 직행(T020). 둘 다 없으면 false.
 *
 * 각 테스트가 **3계정 준비 전에** 이걸 먼저 불러 skip 을 판정한다 — 화면도 없는데 공용
 * 테스트 계정의 친구·결제수단을 휘저어 놓지 않으려는 것이다.
 */
async function enterCreateFlow(page: Page): Promise<boolean> {
  const productId = await firstProductId(page)
  if (productId === null) return false

  await page.goto(`/fundings/new?productId=${productId}`)
  if ((await page.getByRole('heading', { name: /펀딩/ }).count()) > 0) return true

  await page.goto(`/products/${productId}`)
  const entry = page.getByRole('link', { name: /여럿이 모아서/ })
  if ((await entry.count()) === 0) return false
  await entry.click()
  return true
}

/**
 * A 가 B 를 수령자로 펀딩을 연다 (SCR-M4-01~03 · 3스텝: 대상 → 목표·달성선·마감 → 차액 동의).
 * 화면이 없으면 null.
 *
 * ⚠️ T020 의 마크업이 서면 **이 함수 안의 로케이터만** 고친다.
 */
async function openFunding(page: Page, minAmount: number): Promise<string | null> {
  if (!(await enterCreateFlow(page))) return null

  // 1스텝 — 대상: "친구에게" → 친구 중 B (A 의 친구는 B 하나뿐이다)
  const toFriend = page.getByRole('button', { name: /친구에게/ })
  if ((await toFriend.count()) === 0) return null
  await toFriend.click()
  const friendOption = friendDetailLinks(page).or(page.getByRole('radio')).first()
  if ((await friendOption.count()) === 0) return null
  await friendOption.click()

  // 2스텝 — 목표·달성선·마감일. 마감은 미래로 넣는다 (과거는 개설이 거부한다 — V1-4)
  const goalField = page.getByLabel(/목표/)
  if ((await goalField.count()) === 0) return null
  await goalField.fill(String(GOAL))
  await page.getByLabel(/달성선|최소/).fill(String(minAmount))
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await page.getByLabel(/마감/).fill(tomorrow)
  await page.getByRole('button', { name: /다음/ }).click()

  // 3스텝 — 차액 동의: 체크 전에는 개설 버튼이 비활성이다 (FR-004)
  const consent = page.getByRole('checkbox')
  if ((await consent.count()) === 0) return null
  await consent.check()
  await page.getByRole('button', { name: /개설|열기|만들기/ }).click()

  await page.waitForURL(/\/fundings\/[0-9a-f-]{36}/)
  return /\/fundings\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? null
}

/** C 가 참여한다 (SCR-M4-05 → 06). 화면이 없으면 false */
async function contribute(page: Page, fundingId: string, amount: number): Promise<boolean> {
  await page.goto(`/fundings/${fundingId}/contribute`)
  const amountField = page.getByLabel(/금액/)
  if ((await amountField.count()) === 0) return false
  await amountField.fill(String(amount))
  await page.getByRole('button', { name: /참여|보태/ }).click()
  // SCR-M4-06 결과 3변형 — "처리 중"을 지나 완료까지 기다린다
  await expect(page.getByText(/완료|보탰|참여했/).first()).toBeVisible({ timeout: 30_000 })
  return true
}

/** 정산 트리거는 "마감 지난 OPEN 펀딩을 지나는 첫 조회"다 (R1) — 아무 화면이나 열면 된다 */
async function viewFunding(page: Page, fundingId: string): Promise<void> {
  await page.goto(`/fundings/${fundingId}`)
}

/** 알림 목록에서 **이 펀딩의** 알림만 고른다 — 계정에 다른 알림이 쌓여 있어도 흔들리지 않는다 */
function fundingNotices(page: Page, fundingId: string) {
  return page.getByRole('list', { name: '알림 목록' }).locator(`a[href*="${fundingId}"]`)
}

async function expectNotice(page: Page, fundingId: string, text: RegExp | string): Promise<void> {
  await page.goto('/notifications')
  await expect(fundingNotices(page, fundingId).filter({ hasText: text }).first()).toBeVisible()
}

// ── 시나리오 ──────────────────────────────────────────────────────────────────

test.describe('US3 — 마감이 성사·미달을 가르고 돈이 정리된다', () => {
  test.afterAll(async () => {
    await closeFundingDb()
  })

  test('V4-1 · 달성선 이상·목표 미만으로 마감 → 성사 + 차액 자동 결제 고지 (FR-016)', async ({
    authedPage: organizer,
    friendPage: receiver,
    thirdPage: contributor,
  }) => {
    test.skip(
      !(await enterCreateFlow(organizer)),
      '개설 화면(SCR-M4-01~03 · T020)이 아직 없다 — 그 화면이 서면 이 시나리오가 켜진다 (R12)',
    )
    await prepareTrio(organizer, receiver, contributor)

    const fundingId = await openFunding(organizer, MIN_LOW)
    test.skip(fundingId === null, '개설 3스텝(SCR-M4-01~03 · T020)을 끝까지 밟지 못했다 (R12)')
    if (fundingId === null) return

    const contributed = await contribute(contributor, fundingId, CONTRIBUTION)
    test.skip(!contributed, '참여 화면(SCR-M4-05 · T027)이 아직 없다 (R12)')

    // 마감만 DB 로 당긴다 — 판정·환불·차액 결제는 전부 제품 코드가 한다
    await expireFundingDeadline(fundingId)
    await viewFunding(contributor, fundingId) // 첫 조회가 정산을 부른다 (clarify Q1)

    // 성사 — 참여자·수령자에게 알림 (Acceptance 1)
    await expectNotice(contributor, fundingId, TEXT.succeeded)
    await expectNotice(receiver, fundingId, TEXT.succeeded)
    // 차액 고지는 주최자에게만 — "동의를 받았어도 고지는 별개다" (Acceptance 2)
    await expectNotice(organizer, fundingId, TEXT.topup)
    await expect(fundingNotices(receiver, fundingId).filter({ hasText: /차액/ })).toHaveCount(0)

    // 결과 화면의 주최자 변형 (SCR-M4-07 · T035) — 아직 없으면 여기까지가 초록이다
    await organizer.goto(`/fundings/${fundingId}/result`)
    const topupLine = organizer.getByText(/차액 .*결제/)
    test.skip((await topupLine.count()) === 0, '결과 화면(SCR-M4-07 · T035)이 아직 없다 (R12)')
    await expect(topupLine.first()).toBeVisible()
  })

  test('V5-1 · 달성선 미만으로 마감 → 미달 · 전액 환불 고지 (FR-017)', async ({
    authedPage: organizer,
    friendPage: receiver,
    thirdPage: contributor,
  }) => {
    test.skip(
      !(await enterCreateFlow(organizer)),
      '개설 화면(SCR-M4-01~03 · T020)이 아직 없다 (R12)',
    )
    await prepareTrio(organizer, receiver, contributor)

    const fundingId = await openFunding(organizer, MIN_HIGH)
    test.skip(fundingId === null, '개설 3스텝(SCR-M4-01~03 · T020)을 끝까지 밟지 못했다 (R12)')
    if (fundingId === null) return

    const contributed = await contribute(contributor, fundingId, CONTRIBUTION) // < MIN_HIGH
    test.skip(!contributed, '참여 화면(SCR-M4-05 · T027)이 아직 없다 (R12)')

    await expireFundingDeadline(fundingId)
    await viewFunding(contributor, fundingId)

    // 미달 — 결제 완료분 전액 환불 + 참여자 고지. 환불 안내는 고정 문구다 (clarify Q4)
    await expectNotice(contributor, fundingId, TEXT.shortfall)
    await expectNotice(contributor, fundingId, TEXT.refunded)
    await expectNotice(contributor, fundingId, TEXT.refundNotice)
    // 성사 알림은 어디에도 없다 (Acceptance 6 — 예약 금액으로 성사를 선언하지 않는다)
    await expect(
      fundingNotices(receiver, fundingId).filter({ hasText: TEXT.succeeded }),
    ).toHaveCount(0)
  })

  test('V5-2 · 주최자 취소 → 환불 + 미달과 다른 문구 (FR-018)', async ({
    authedPage: organizer,
    friendPage: receiver,
    thirdPage: contributor,
  }) => {
    test.skip(
      !(await enterCreateFlow(organizer)),
      '개설 화면(SCR-M4-01~03 · T020)이 아직 없다 (R12)',
    )
    await prepareTrio(organizer, receiver, contributor)

    const fundingId = await openFunding(organizer, MIN_LOW)
    test.skip(fundingId === null, '개설 3스텝(SCR-M4-01~03 · T020)을 끝까지 밟지 못했다 (R12)')
    if (fundingId === null) return

    const contributed = await contribute(contributor, fundingId, CONTRIBUTION)
    test.skip(!contributed, '참여 화면(SCR-M4-05 · T027)이 아직 없다 (R12)')

    // 마감 전에 주최자가 취소한다 (SCR-M4-04 더보기 → 취소 다이얼로그 · T026)
    await viewFunding(organizer, fundingId)
    const more = organizer.getByRole('button', { name: '더보기', exact: true })
    test.skip((await more.count()) === 0, '펀딩 상세(SCR-M4-04 · T026)가 아직 없다 (R12)')
    await more.click()
    await organizer
      .getByRole('button', { name: /취소/ })
      .first()
      .click()
    const dialog = organizer.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /취소할|확인|취소하기/ }).click()

    // 취소는 미달과 **다른 문구**로 간다 — 같은 종류를 reason·cause 로 가른다 (FR-018)
    await expectNotice(contributor, fundingId, TEXT.cancelledByOrganizer)
    await expectNotice(contributor, fundingId, TEXT.refundNotice)
    await expect(
      fundingNotices(contributor, fundingId).filter({ hasText: TEXT.shortfall }),
    ).toHaveCount(0)
  })
})
