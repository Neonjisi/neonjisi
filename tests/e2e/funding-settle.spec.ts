/**
 * T030·T033 — US3 마감이 성사·미달을 가르고 돈이 정리된다 (spec.md User Story 3 · FR-016~FR-018 ·
 * quickstart V4·V5). **이 파일이 초록이 되는 시점이 마일스톤 4 완료 판정(T033)이다.**
 *
 * quickstart ↔ 테스트 대응
 * | quickstart | 테스트 |
 * |---|---|
 * | V4-1 | 달성선 이상·목표 미만으로 채우고 마감을 과거로 → 조회 → **성사 + 차액 자동 결제 고지** |
 * | V5-1 | 달성선 미만으로 마감 → **미달 · 전액 환불** + 환불 안내 고정 문구 |
 * | V5-2 | 주최자가 진행 중 펀딩을 취소 → 환불 + **미달과 다른 문구** |
 *
 * 3주체다 (A=주최자 `authedPage` · B=수령자 `friendPage` · C=참여자 `thirdPage` — T003).
 * C 의 접근 근거는 "수령자의 활성 친구"라서(R6 `canViewFunding`) 친구 관계를 **A–B, B–C** 로 건다.
 *
 * T030 은 화면이 없어 probe 로 전부 skip 하던 골격이었다. H 의 화면(T020~T021·T026~T028·T035)이
 * 서면서 **probe 를 단언으로 바꿨다** — 화면이 없으면 이제 skip 이 아니라 실패다. 시나리오와
 * 판정 기준은 골격 그대로다. 남은 skip 경로는 계정뿐이다: `E2E_USER4_*` 가 비면 `thirdPage`
 * 픽스처가 skip 한다 (fixtures/auth.ts). **`skipped` 수를 반드시 확인한다.**
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
  onlyFriendId,
  readInvitePath,
  removeAllFriends,
} from './fixtures/friend-ui'

const CARD_BRAND = '신한'
const GOOD_CARD_LAST4 = '4821'
/** 결제수단 목록(SCR-M3-07)이 카드를 적는 형태 — 이미 있으면 다시 등록하지 않는다 */
const CARD_LABEL = `${CARD_BRAND} **** ${GOOD_CARD_LAST4}`

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
const NOTICE = {
  succeeded: /펀딩이 성사되었어요/,
  topup: new RegExp(`차액 ${won(TOPUP)}이 내 결제수단으로 결제되었어요`),
  shortfall: /펀딩이 최소 달성 금액을 채우지 못했어요/,
  cancelledByOrganizer: /주최자가 .*펀딩을 취소했어요/,
  refunded: new RegExp(`${won(CONTRIBUTION)}이 환불돼요`),
  /** 환불 안내는 미달·취소 어느 경로든 같은 한 문장이다 (clarify Q4 · display.ts REFUND_NOTICE) */
  refundNotice: '영업일 기준 3~5일이 걸릴 수 있어요',
} as const

/** 화면 문구 — SCR-M4-04 상세의 STATUS_COPY · SCR-M4-07 결과 3변형 */
const SCREEN = {
  settled: '선물이 확정되었어요',
  failed: '달성선에 못 미쳐 취소됐어요',
  cancelled: '주최자가 취소했어요',
  resultSucceeded: '펀딩이 성사됐어요',
  resultFailed: '최소 달성 금액을 채우지 못했어요',
  resultCancelled: '주최자가 펀딩을 취소했어요',
  resultRefund: '참여하신 금액은 전액 환불됩니다.',
  resultTopup: new RegExp(`차액 ${won(TOPUP)}이 등록된 카드로 결제되었습니다`),
} as const

/** 개설 폼의 `min` 과 같은 방식으로 내일을 만든다 — 다르게 계산하면 date 입력이 거부한다 */
function tomorrowISO(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

// ── 준비 ──────────────────────────────────────────────────────────────────────

/**
 * 결제수단 하나를 보장한다 (SCR-M3-06·07). 주최자는 차액 부담용으로 필수다 (FR-004).
 *
 * 이 spec 은 계정 셋을 공유하며 반복 실행된다 — 이미 있으면 그대로 쓴다. 매번 새로 등록하면
 * 카드가 쌓이고, 어느 것이 활성인지가 실행 순서에 좌우된다.
 */
async function ensureCard(page: Page): Promise<void> {
  await page.goto('/payment-methods')
  if ((await page.getByText(CARD_LABEL, { exact: true }).count()) > 0) return

  await page.goto('/payment-methods/new')
  await page.getByRole('radio', { name: CARD_BRAND }).check()
  await page.getByLabel('카드 뒷자리 4자리').fill(GOOD_CARD_LAST4)
  await page.getByRole('button', { name: '등록하기' }).click()
  await expect(page).toHaveURL(/\/payment-methods$/)
  await expect(page.getByText(CARD_LABEL, { exact: true })).toBeVisible()
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
 * 고를 때 "받는 사람 = B" 가 성립하는 근거다.
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
  await ensureCard(organizer) // 차액 부담 수단 (FR-004)
  await ensureCard(contributor) // 참여 결제 수단
}

// ── 화면 조작 ─────────────────────────────────────────────────────────────────

/** 카탈로그에서 상품 하나를 고른다 (SCR-M3-03) */
async function firstProductId(page: Page): Promise<string> {
  await page.goto('/products')
  const hrefs = await page
    .locator('a[href^="/products/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  const id = hrefs.map((href) => /^\/products\/([0-9a-f-]{36})/.exec(href)?.[1]).find(Boolean)
  expect(id, '카탈로그가 비어 있다 — M3 T008 시드(52건)가 들어간 DB 인지 확인한다').toBeTruthy()
  return id as string
}

/** 상품 상세의 "여럿이 모아서 선물하기"(T021)로 개설 화면(SCR-M4-01)에 들어간다 */
async function openCreatePage(page: Page): Promise<void> {
  const productId = await firstProductId(page)
  await page.goto(`/products/${productId}`)
  await page.getByRole('link', { name: '여럿이 모아서 선물하기' }).click()
  await page.waitForURL(/\/fundings\/new\?/)
  await expect(page.getByRole('heading', { name: '누구에게 줄 선물인가요?' })).toBeVisible()
}

/** A 가 B 를 수령자로 펀딩을 연다 (SCR-M4-01~03 · 친구에게는 3스텝) */
async function openFunding(page: Page, minAmount: number): Promise<string> {
  await openCreatePage(page)

  // 1스텝 — 대상: "친구에게" → 받는 사람은 A 의 유일한 친구 B
  await page.getByRole('radio', { name: '친구에게' }).check()
  const receiverSelect = page.getByLabel('받는 사람')
  await receiverSelect.selectOption({ index: 0 })
  await expect(receiverSelect).not.toHaveValue('')
  await page.getByRole('button', { name: '다음' }).click()

  // 2스텝 — 목표·달성선·마감일. 마감은 미래로 넣는다 (과거는 개설이 거부한다 — V1-4)
  await page.getByLabel('목표 금액').fill(String(GOAL))
  await page.getByLabel('최소 달성선').fill(String(minAmount))
  await page.getByLabel('마감일').fill(tomorrowISO())
  await page.getByRole('button', { name: '다음' }).click()

  // 3스텝 — 차액 동의. 최대 부담액은 숫자로 보이고, 체크 전에는 개설 버튼이 비활성이다 (FR-004)
  // 동의 문장에도 같은 금액이 "…최대 N원까지…" 로 들어 있어 exact 로 굵은 금액 줄만 잡는다
  await expect(page.getByText(`최대 ${won(GOAL - minAmount)}`, { exact: true })).toBeVisible()
  const start = page.getByRole('button', { name: '펀딩 시작하기' })
  await expect(start).toBeDisabled()
  await page.getByRole('checkbox', { name: /동의/ }).check()
  await expect(start).toBeEnabled()
  await start.click()

  await page.waitForURL(/\/fundings\/[0-9a-f-]{36}$/)
  return /\/fundings\/([0-9a-f-]{36})/.exec(page.url())?.[1] as string
}

/** C 가 참여한다 (SCR-M4-05 → 06) */
async function contribute(page: Page, fundingId: string, amount: number): Promise<void> {
  await page.goto(`/fundings/${fundingId}/contribute`)
  // 고지 2종은 나란히 선다 (T002 문구 · FR-011)
  await expect(page.getByText(/주최자에게 공개됩니다/)).toBeVisible()
  await expect(page.getByText(/전액 환불됩니다/)).toBeVisible()

  await page.getByLabel('참여 금액').fill(String(amount))
  await page.getByRole('button', { name: '결제하고 참여하기' }).click()
  // SCR-M4-06 — "결제하고 있어요"를 지나 완료 변형까지
  await expect(page.getByRole('heading', { name: '참여가 완료됐어요' })).toBeVisible({
    timeout: 30_000,
  })
}

/**
 * 정산 트리거는 "마감 지난 OPEN 펀딩을 지나는 첫 조회"다 (R1). `getFunding` 이 정산을 부르고
 * **같은 요청 안에서 다시 읽으므로**(lib/dal/funding.ts 주석 ④) 이 한 번의 조회로 결과가 보인다.
 */
async function viewUntilStatus(page: Page, fundingId: string, statusCopy: string): Promise<void> {
  await page.goto(`/fundings/${fundingId}`)
  await expect(page.getByLabel('펀딩 진행 상황')).toContainText(statusCopy)
}

// ── 알림 ──────────────────────────────────────────────────────────────────────

/** 알림 화면까지 확실히 들어간다 — 빈 목록이면 `<ul>` 자체가 없다(EmptyState)는 점에 주의 */
async function openNotifications(page: Page): Promise<void> {
  await page.goto('/notifications')
  await expect(page.getByRole('heading', { name: '알림', level: 1 })).toBeVisible()
}

/** 알림 목록에서 **이 펀딩의** 알림만 고른다 — 계정에 다른 알림이 쌓여 있어도 흔들리지 않는다 */
function fundingNotices(page: Page, fundingId: string) {
  return page.getByRole('list', { name: '알림 목록' }).locator(`a[href*="${fundingId}"]`)
}

async function expectNotice(page: Page, fundingId: string, text: RegExp | string): Promise<void> {
  await openNotifications(page)
  await expect(fundingNotices(page, fundingId).filter({ hasText: text }).first()).toBeVisible()
}

async function expectNoNotice(page: Page, fundingId: string, text: RegExp | string): Promise<void> {
  await openNotifications(page)
  await expect(fundingNotices(page, fundingId).filter({ hasText: text })).toHaveCount(0)
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
    // 3계정을 UI 로 세우고(온보딩·친구·카드) 정산 왕복까지 도는 시나리오다 — 기본 타임아웃을 넘긴다
    test.slow()
    await prepareTrio(organizer, receiver, contributor)

    const fundingId = await openFunding(organizer, MIN_LOW)
    await contribute(contributor, fundingId, CONTRIBUTION)

    // 마감만 DB 로 당긴다 — 판정·환불·차액 결제는 전부 제품 코드가 한다
    await expireFundingDeadline(fundingId)
    await viewUntilStatus(contributor, fundingId, SCREEN.settled) // 첫 조회가 정산을 부른다 (clarify Q1)

    // 성사 — 참여자·수령자에게 알림 (Acceptance 1)
    await expectNotice(contributor, fundingId, NOTICE.succeeded)
    await expectNotice(receiver, fundingId, NOTICE.succeeded)
    // 차액 고지는 주최자에게만 — "동의를 받았어도 고지는 별개다" (Acceptance 2)
    await expectNotice(organizer, fundingId, NOTICE.topup)
    await expectNoNotice(receiver, fundingId, /차액/)

    // 결과 화면의 주최자 변형 (SCR-M4-07 · T035)
    await organizer.goto(`/fundings/${fundingId}/result`)
    await expect(organizer.getByRole('heading', { name: SCREEN.resultSucceeded })).toBeVisible()
    await expect(organizer.getByText(SCREEN.resultTopup)).toBeVisible()
    // 차액 줄은 주최자만 본다 — 참여자 화면에는 없다 (R6)
    await contributor.goto(`/fundings/${fundingId}/result`)
    await expect(contributor.getByText(SCREEN.resultTopup)).toHaveCount(0)
  })

  test('V5-1 · 달성선 미만으로 마감 → 미달 · 전액 환불 고지 (FR-017)', async ({
    authedPage: organizer,
    friendPage: receiver,
    thirdPage: contributor,
  }) => {
    test.slow()
    await prepareTrio(organizer, receiver, contributor)

    const fundingId = await openFunding(organizer, MIN_HIGH)
    await contribute(contributor, fundingId, CONTRIBUTION) // < MIN_HIGH

    await expireFundingDeadline(fundingId)
    await viewUntilStatus(contributor, fundingId, SCREEN.failed)

    // 미달 — 결제 완료분 전액 환불 + 참여자 고지. 환불 안내는 고정 문구다 (clarify Q4)
    await expectNotice(contributor, fundingId, NOTICE.shortfall)
    await expectNotice(contributor, fundingId, NOTICE.refunded)
    await expectNotice(contributor, fundingId, NOTICE.refundNotice)
    // 성사 알림은 어디에도 없다 (Acceptance 6 — 예약 금액으로 성사를 선언하지 않는다)
    await expectNoNotice(receiver, fundingId, NOTICE.succeeded)

    // 결과 화면 미달 변형 (SCR-M4-07 · T035)
    await contributor.goto(`/fundings/${fundingId}/result`)
    await expect(contributor.getByRole('heading', { name: SCREEN.resultFailed })).toBeVisible()
    await expect(contributor.getByText(SCREEN.resultRefund)).toBeVisible()
  })

  test('V5-2 · 주최자 취소 → 환불 + 미달과 다른 문구 (FR-018)', async ({
    authedPage: organizer,
    friendPage: receiver,
    thirdPage: contributor,
  }) => {
    test.slow()
    await prepareTrio(organizer, receiver, contributor)

    const fundingId = await openFunding(organizer, MIN_LOW)
    await contribute(contributor, fundingId, CONTRIBUTION)

    // 마감 전에 주최자가 취소한다 (SCR-M4-04 더보기 → 펀딩 취소 · T026)
    await organizer.goto(`/fundings/${fundingId}`)
    await organizer.getByRole('button', { name: '더보기', exact: true }).click()
    // 확인 단계는 네이티브 confirm 이다 (components/funding/detail-actions.tsx) — 핸들러를
    // **누르기 전에** 걸어야 한다. 안 걸면 Playwright 가 자동으로 닫아 아무 일도 일어나지 않는다.
    organizer.once('dialog', (dialog) => void dialog.accept())
    await organizer.getByRole('menuitem', { name: '펀딩 취소' }).click()
    await expect(organizer.getByLabel('펀딩 진행 상황')).toContainText(SCREEN.cancelled)

    // 취소는 미달과 **다른 문구**로 간다 — 같은 종류를 reason·cause 로 가른다 (FR-018)
    await expectNotice(contributor, fundingId, NOTICE.cancelledByOrganizer)
    await expectNotice(contributor, fundingId, NOTICE.refundNotice)
    await expectNoNotice(contributor, fundingId, NOTICE.shortfall)

    await contributor.goto(`/fundings/${fundingId}/result`)
    await expect(contributor.getByRole('heading', { name: SCREEN.resultCancelled })).toBeVisible()
    await expect(contributor.getByText(SCREEN.resultRefund)).toBeVisible()
  })
})
