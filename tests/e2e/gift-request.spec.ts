/**
 * T036 — US3 선물 요청을 보낸다 (spec.md User Story 3 · FR-013~FR-019)
 *
 * spec.md 시나리오 ↔ 테스트 대응
 * | spec.md | 테스트 |
 * |---------|--------|
 * | US3-1   | 상품 → 확인 → 동의 → 전송하면 요청이 생기고 수령자에게 도착한다 |
 * | US3-2   | 동의 체크 전에는 전송 버튼이 비활성이다 (FR-014) |
 * | US3-3   | 동의 문구에 요청 금액이 숫자로 박혀 있다 (FR-014) |
 * | SCR-M3-11 | pending 에서만 취소할 수 있고, 취소하면 "취소됨"이 된다 |
 *
 * 두 계정이 필요하다 — A(authedPage)가 보내고 B(friendPage)가 받는다.
 * env 가 비면 실패가 아니라 **skip** 된다 — `skipped` 수를 본다.
 *
 * ⚠️ 화면 의존 probe (M2 invite-control.spec.ts / T048 방식):
 * 이 여정은 **다른 사람 몫의 화면**을 지나야 검증된다 — H 의 카탈로그(T022~T027)·요청
 * 확인/동의/완료(T039~T041 화면부)·D 의 결제수단 등록(SCR-M3-06). 그 전에는 라우트가
 * 404/500 을 내므로 실패로 두지 않고 skip 한다. 정적 skip 이 아니라 probe 라서 화면이
 * 서는 날부터 아무도 이 파일을 고치지 않아도 다시 돈다.
 *
 * e2e 에서는 DB 를 직접 만지지 않는다 — 결제수단·친구 관계 준비도 전부 UI 로 한다.
 * 결제수단 등록 폼은 D 의 mock 계약(contracts §1 issueBillingKey — 브랜드 선택 ·
 * 마지막 4자리 입력)에 맞춘 **임시 로케이터**다. 화면이 서면 여기만 조정한다.
 */
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures/auth'
import { becomeFriends, ensureOnboarded } from './fixtures/friend-ui'

const PENDING_SCREENS_REASON =
  'US3 화면 의존 대기 — H 의 카탈로그(T022~)·요청 화면(T039~T041) · D 의 결제수단 등록(SCR-M3-06)'

/** 화면 하나라도 서지 않았으면 그 자리에서 skip 한다. setup(온보딩·친구 준비)보다 먼저 부른다 */
async function skipUntilScreensExist(page: Page): Promise<void> {
  for (const path of ['/products', '/payment-methods']) {
    const response = await page.goto(path)
    const status = response?.status()
    if (status === undefined || status >= 400) {
      test.skip(true, `${PENDING_SCREENS_REASON} — ${path} → ${status ?? '응답 없음'}`)
    }
  }
}

// ── 화면 헬퍼 ────────────────────────────────────────────────────────────────

/** 카드 표시 규칙 — 브랜드 + 마스킹 4자리 (SCR-M3-07 "신한 **** 4821") */
const CARD_MASK_TEXT = /\*{4}\s*\d{4}/
/** 금액이 숫자로 — "89,000원" 꼴 (FR-014 "상한을 숫자로") */
const WON_AMOUNT = /[0-9][0-9,]*원/

/**
 * A 계정에 활성 결제수단이 있게 만든다 (요청 진입 차단 FR-013 ② 해소).
 * 이미 있으면 그대로 둔다 — 빌링키는 사용자당 재사용이 원칙이다 (FR-009).
 */
export async function ensurePaymentMethod(page: Page): Promise<void> {
  await page.goto('/payment-methods')
  const cards = page.getByText(CARD_MASK_TEXT)
  if (await cards.filter({ hasNotText: '0000' }).first().isVisible().catch(() => false)) return

  await page.goto('/payment-methods/new')
  // mock 폼 — contracts §1: cardBrand 는 선택, cardLast4 는 입력. '0000' 은 실패 규약이라 피한다
  const last4 = page.getByLabel(/마지막 4자리|뒷 ?4자리|카드 번호/).first()
  await last4.fill('4821')
  await page.getByRole('button', { name: /등록|저장|완료/ }).first().click()
  await expect(page.getByText(CARD_MASK_TEXT).first()).toBeVisible({ timeout: 15_000 })
}

/** 친구(bId)용 카탈로그에서 첫 상품 상세로 들어가 [ 선물하기 ] 를 누른다 → SCR-M3-08 */
export async function startGiftRequest(page: Page, bId: string): Promise<void> {
  // 대상 필터가 걸린 목록(SCR-M3-05) — unwanted 카테고리는 이미 걸러져 있다 (FR-003)
  await page.goto(`/products/for/${bId}`)
  await page.locator('a[href^="/products/"]:not([href*="/for/"])').first().click()
  const giftButton = page.getByRole('button', { name: '선물하기', exact: true })
    .or(page.getByRole('link', { name: '선물하기', exact: true }))
  await expect(giftButton.first()).toBeEnabled()
  await giftButton.first().click()
}

export function consentCheckbox(page: Page): Locator {
  return page.getByRole('checkbox', { name: /동의/ })
}

export function sendButton(page: Page): Locator {
  return page.getByRole('button', { name: /선물 요청 보내기/ })
}

export function nextButton(page: Page): Locator {
  return page.getByRole('link', { name: '다음', exact: true })
    .or(page.getByRole('button', { name: '다음', exact: true }))
}

test.describe('US3 — 선물 요청을 보낸다', () => {
  test.describe.configure({ timeout: 180_000 })
  test('요청 생성 → 동의 → 전송 → 수령자 도착 → 취소까지 한 여정', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await skipUntilScreensExist(pageA)
    await ensureOnboarded(pageA)
    await ensureOnboarded(pageB)
    const { bId } = await becomeFriends(pageA, pageB)

    await ensurePaymentMethod(pageA)

    // ── SCR-M3-08 요청 확인 — 금액이 숫자로 보인다
    await startGiftRequest(pageA, bId)
    await expect(pageA.getByText(WON_AMOUNT).first()).toBeVisible()
    await nextButton(pageA).click()

    // ── SCR-M3-09 재결제 동의 — 체크 전 비활성 · 문구에 금액 숫자 (FR-014)
    await expect(pageA.getByText(/이하의 상품으로 결제됩니다/)).toBeVisible()
    await expect(pageA.getByText(WON_AMOUNT).first()).toBeVisible()
    await expect(pageA.getByText(/차액은 청구하지도, 돌려드리지도 않습니다/)).toBeVisible()
    await expect(sendButton(pageA)).toBeDisabled()
    await consentCheckbox(pageA).check()
    await expect(sendButton(pageA)).toBeEnabled()
    await sendButton(pageA).click()

    // ── SCR-M3-10 전송 완료 — 카운트다운이 보인다 (respond_due_at 절대 시각)
    await expect(pageA.getByText('요청을 보냈습니다')).toBeVisible({ timeout: 15_000 })
    await expect(pageA.getByText(/남은 시간/)).toBeVisible()

    // ── 수령자 홈 최상단 승인 대기 + 알림 도착 (FR-038 · gift_request_received)
    await pageB.goto('/')
    await expect(pageB.getByText(/응답 기다리는 중|보낸 선물/).first()).toBeVisible()
    await pageB.goto('/notifications')
    await expect(pageB.getByText(/선물 요청이 도착했습니다/).first()).toBeVisible()

    // ── SCR-M3-11 주는 사람 상세 — pending 에서만 취소할 수 있다
    await pageA.getByRole('link', { name: /요청 상세 보기/ }).click()
    await expect(pageA.getByText(/응답 기다리는 중/)).toBeVisible()
    const giftPath = new URL(pageA.url()).pathname
    await pageA.getByRole('button', { name: /요청 취소/ }).click()
    // 확인 다이얼로그가 있으면 거친다 — 없으면 그대로 진행 (화면 확정 전 유연화)
    const confirm = pageA.getByRole('alertdialog').getByRole('button', { name: /취소하기|확인/ })
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
    await expect(pageA.getByText('취소됨')).toBeVisible({ timeout: 15_000 })

    await pageB.goto(giftPath)
    await expect(pageB.getByText('취소됨')).toBeVisible()
    await expect(pageB.getByRole('link', { name: '이걸로 받을게요' })).toHaveCount(0)
    await expect(pageB.getByRole('link', { name: '다른 것도 좋아요' })).toHaveCount(0)
  })

  test('수령자가 원래 상품을 승인하고 배송지를 입력하면 자동 결제된다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await ensureOnboarded(pageA)
    await ensureOnboarded(pageB)
    const { bId } = await becomeFriends(pageA, pageB)
    await ensurePaymentMethod(pageA)
    await startGiftRequest(pageA, bId)
    await nextButton(pageA).click()
    await consentCheckbox(pageA).check()
    await sendButton(pageA).click()
    await expect(pageA.getByText('요청을 보냈습니다')).toBeVisible({ timeout: 15_000 })

    await pageB.goto('/')
    await pageB.getByRole('link', { name: /응답 기다리는 중/ }).click()
    await pageB.getByRole('link', { name: '이걸로 받을게요' }).click()
    await pageB.getByLabel('받는 분').fill('테스트 수령자')
    await pageB.getByLabel('연락처').fill('01012345678')
    await pageB.getByLabel('주소', { exact: true }).fill('서울시 테스트로 1')
    await pageB.getByLabel('상세 주소').fill('101호')
    await pageB.getByRole('button', { name: '완료' }).click()
    await expect(pageB).toHaveURL(/\/gifts\/[0-9a-f-]{36}\/result$/)
    await expect(pageB.getByText(/선물이 확정됐어요|결제가 완료됐어요/)).toBeVisible()
  })

  test('수령자가 요청 금액 이하의 다른 상품을 골라 자동 결제한다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    await ensureOnboarded(pageA)
    await ensureOnboarded(pageB)
    const { bId } = await becomeFriends(pageA, pageB)
    await ensurePaymentMethod(pageA)
    await startGiftRequest(pageA, bId)
    await nextButton(pageA).click()
    await consentCheckbox(pageA).check()
    await sendButton(pageA).click()
    await expect(pageA.getByText('요청을 보냈습니다')).toBeVisible({ timeout: 15_000 })

    await pageB.goto('/')
    await pageB.getByRole('link', { name: /응답 기다리는 중/ }).click()
    await pageB.getByRole('link', { name: '다른 것도 좋아요' }).click()
    await expect(pageB.getByText(/이하에서 골라주세요/)).toBeVisible()
    await pageB.getByRole('list', { name: '선택할 수 있는 상품' }).getByRole('link').first().click()
    await expect(pageB.getByText(/다른 상품을 골랐다고 알려집니다/)).toBeVisible()
    await pageB.getByLabel('받는 분').fill('테스트 수령자')
    await pageB.getByLabel('연락처').fill('01012345678')
    await pageB.getByLabel('주소', { exact: true }).fill('서울시 테스트로 1')
    await pageB.getByRole('button', { name: '완료' }).click()
    await expect(pageB).toHaveURL(/\/gifts\/[0-9a-f-]{36}\/result$/)
  })
})
