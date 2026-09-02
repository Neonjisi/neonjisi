import Link from 'next/link'
import { ProductGrid } from '@/components/product/product-card'
import { TopBar } from '@/components/ui/top-bar'
import { getFriendTaste } from '@/lib/dal/friend'
import { getRecommendations } from '@/lib/dal/product'

export default async function FriendRecommendationsPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  const [friend, recommendations] = await Promise.all([
    getFriendTaste(userId),
    getRecommendations(userId),
  ])
  const excluded = recommendations.excludedCategoryNames.join('·')

  return (
    <>
      <TopBar title={`${friend.displayName}님 맞춤 선물`} backHref={`/friends/${userId}`} />
      <main className="flex-1 px-5 pb-8">
        {excluded ? (
          <p className="rounded-2xl bg-info-50 px-4 py-3 text-sm text-info-700">
            {excluded} 카테고리는 빼고 보여드리고 있어요.
          </p>
        ) : (
          <p className="rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700">관심 없다고 표시한 종류가 없어 전체에서 추천해요.</p>
        )}

        <section className="mt-6" aria-labelledby="want-recommendations">
          <h2 id="want-recommendations" className="text-lg font-bold">원하는 것과 딱 맞아요</h2>
          {!recommendations.hasWantItems ? (
            <div className="mt-3 rounded-2xl border border-neutral-200 bg-surface p-5 text-sm text-neutral-600">
              아직 원하는 것을 적지 않았어요. 관심 없는 종류를 제외한 전체 상품을 보여드릴게요.
            </div>
          ) : recommendations.wantMatches.length ? (
            <div className="mt-3"><ProductGrid products={recommendations.wantMatches} friendUserId={userId} /></div>
          ) : (
            <p className="mt-3 text-sm text-neutral-600">직접 고른 상품이 아직 판매 중이지 않아요.</p>
          )}
        </section>

        <section className="mt-8" aria-labelledby="category-recommendations">
          <h2 id="category-recommendations" className="text-lg font-bold">같은 카테고리에서 더 보기</h2>
          {recommendations.categoryMatches.length ? (
            <div className="mt-3"><ProductGrid products={recommendations.categoryMatches} friendUserId={userId} /></div>
          ) : (
            <p className="mt-3 rounded-2xl bg-neutral-100 p-5 text-sm text-neutral-600">더 보여드릴 상품이 없어요.</p>
          )}
        </section>

        <Link href={`/products?for=${userId}`} className="mt-8 block text-center text-sm font-semibold text-rose-700">전체 상품에서 고르기</Link>
      </main>
    </>
  )
}
