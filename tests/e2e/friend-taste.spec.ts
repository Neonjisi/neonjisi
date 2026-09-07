import { expect, test } from './fixtures/auth'
import { becomeFriends, ensureOnboarded, friendDetailLinks, removeAllFriends } from './fixtures/friend-ui'
import { CATEGORY, addWantItem, completeOnboarding, expectNoHorizontalScroll, resetAccount } from './fixtures/taste-ui'

const FRIEND_DESCRIPTION = '주말에는 산미 있는 커피를 천천히 내려 마셔요'
const WANT_DETAIL = '산미가 또렷한 원두'

test.describe('US2 — 친구의 취향을 본다', () => {
  test.beforeEach(async ({ authedPage, friendPage }) => {
    await ensureOnboarded(authedPage)
    await ensureOnboarded(friendPage)
    await removeAllFriends(authedPage)
    await removeAllFriends(friendPage)
  })

  test('친구 목록의 대표 태그와 상세의 전체 취향을 보여준다', async ({ authedPage: pageA, friendPage: pageB }) => {
    await resetAccount(pageA)
    await completeOnboarding(pageA, [{ category: CATEGORY.TUMBLER, kind: 'HAVE', detail: '검정색' }], { description: FRIEND_DESCRIPTION })
    await addWantItem(pageA, { category: CATEGORY.PERFUME, detail: WANT_DETAIL })

    const { aId } = await becomeFriends(pageA, pageB)
    await pageB.goto('/friends')
    await expect(pageB.getByText(CATEGORY.PERFUME).first()).toBeVisible()
    await friendDetailLinks(pageB).first().click()
    await expect(pageB).toHaveURL(new RegExp(`/friends/${aId}`))
    await expect(pageB.getByText(FRIEND_DESCRIPTION)).toBeVisible()
    await expect(pageB.getByText(WANT_DETAIL)).toBeVisible()
    await expect(pageB.getByText('검정색')).toBeVisible()
    await expect(pageB.getByRole('heading', { name: /원하는 것/ })).toBeVisible()
    await expect(pageB.getByRole('heading', { name: /이미 있어요/ })).toBeVisible()
  })

  test('want와 서술이 비어 있어도 상세 화면이 성립한다', async ({ authedPage: pageA, friendPage: pageB }) => {
    await resetAccount(pageA)
    await completeOnboarding(pageA, [{ category: CATEGORY.TUMBLER, kind: 'HAVE' }])
    const { aId } = await becomeFriends(pageA, pageB)
    await pageB.goto(`/friends/${aId}`)
    await expect(pageB.getByText(CATEGORY.TUMBLER)).toBeVisible()
    await expect(pageB.getByText('아직 적은 게 많지 않아요')).toBeVisible()
  })

  // SC-006 은 폭 360 에서만 의미가 있다 — expectNoHorizontalScroll 이 뷰포트를 단언한다.
  // 프로젝트 뷰포트를 그대로 쓰면 chromium(1280) 에서도 수집돼 실패한다.
  // onboarding·want-items·invite-control·payment-method 와 같은 방식으로 여기서 폭을 고정한다.
  test.describe('SC-006 · 폭 360', () => {
    test.use({ viewport: { width: 360, height: 740 } })

    test('목록과 상세에 가로 스크롤이 없다', async ({ authedPage: pageA, friendPage: pageB }) => {
      const { aId } = await becomeFriends(pageA, pageB)
      await pageB.goto('/friends')
      await expectNoHorizontalScroll(pageB)
      await pageB.goto(`/friends/${aId}`)
      await expectNoHorizontalScroll(pageB)
    })
  })
})
