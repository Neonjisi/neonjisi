import { expect, test } from './fixtures/auth'
import { becomeFriends, ensureOnboarded, removeAllFriends } from './fixtures/friend-ui'
import {
  CATEGORY,
  addTasteItem,
  addWantItem,
  completeOnboarding,
  expectNoHorizontalScroll,
  resetAccount,
} from './fixtures/taste-ui'

test.describe('US1 — 상품 카탈로그', () => {
  test.beforeEach(async ({ authedPage, friendPage }) => {
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)

    await resetAccount(friendPage)
    await completeOnboarding(friendPage, [{ category: CATEGORY.TOWEL, kind: 'HAVE' }])
    await addWantItem(friendPage, { category: CATEGORY.TUMBLER, detail: '스테인리스 텀블러' })
    await addTasteItem(friendPage, { kind: 'UNWANTED', category: CATEGORY.PERFUME })
  })

  test.afterEach(async ({ authedPage, friendPage }) => {
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)
  })

  test('검색·카테고리 필터가 동작한다', async ({ authedPage }) => {
    await authedPage.goto('/products?q=스타벅스&category=텀블러')
    await expect(authedPage.getByText('스타벅스 스탠리 하우스 보온병 500ml')).toBeVisible()
    await expect(authedPage.getByText('갤럭시워치8 클래식 46mm')).toBeHidden()
  })

  test('대상 친구의 관심 없는 카테고리는 목록에서 빠지고 상세에서도 막힌다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    const { bId } = await becomeFriends(pageA, pageB)
    await pageA.goto(`/products?for=${bId}`)
    await expect(pageA.getByText('조 말론 런던 우드 세이지 앤 씨 솔트 코롱 100ml')).toBeHidden()

    await pageA.goto(`/products?for=${bId}&q=스타벅스`)
    await pageA.getByRole('link', { name: /스타벅스 스탠리/ }).click()
    await expect(pageA.getByText('원하는 것에 적어둔 항목입니다')).toBeVisible()

    await pageA.goto(`/products?for=${bId}&q=송월타올 호텔수건`)
    await pageA.getByRole('link', { name: /송월타올 호텔수건/ }).click()
    await expect(pageA.getByText(/이미 갖고 있어요/)).toBeVisible()
    await expect(pageA.getByRole('link', { name: '선물하기' })).toBeVisible()

    // 목록 검색을 우회해 향수 상세 URL로 직접 들어가도 서버 배너가 마지막으로 막는다.
    await pageA.goto(`/products?category=향수`)
    const blockedHref = await pageA.getByRole('link', { name: /조 말론 런던/ }).getAttribute('href')
    expect(blockedHref).toBeTruthy()
    await pageA.goto(`${blockedHref}?for=${bId}`)
    await expect(pageA.getByText(/관심 없다고 한 종류예요/)).toBeVisible()
    await expect(pageA.getByRole('button', { name: '선물하기' })).toBeDisabled()
  })

  test('맞춤 추천은 원하는 것·확장·제외 근거를 보여준다', async ({
    authedPage: pageA,
    friendPage: pageB,
  }) => {
    const { bId } = await becomeFriends(pageA, pageB)
    await pageA.goto(`/products/for/${bId}`)
    await expect(pageA.getByRole('heading', { name: '원하는 것과 딱 맞아요' })).toBeVisible()
    await expect(pageA.getByRole('heading', { name: '같은 카테고리에서 더 보기' })).toBeVisible()
    await expect(pageA.getByText(/향수.*빼고 보여드리고 있어요/)).toBeVisible()
  })

  test('친구가 아니면 맞춤 추천 접근을 거부한다', async ({ authedPage, friendPage }) => {
    const { bId } = await becomeFriends(authedPage, friendPage)
    await removeAllFriends(authedPage)
    const response = await authedPage.goto(`/products/for/${bId}`)
    expect(response?.status()).toBe(404)
  })

  test('폭 360px에서 가로 스크롤이 없다', async ({ authedPage }) => {
    await authedPage.setViewportSize({ width: 360, height: 740 })
    await authedPage.goto('/products')
    await expectNoHorizontalScroll(authedPage)
  })
})
