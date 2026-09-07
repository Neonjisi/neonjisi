import Link from 'next/link'
import { Search } from 'lucide-react'
import { ProductGrid } from '@/components/product/product-card'
import { BottomNav } from '@/components/ui/bottom-nav'
import { TopBar } from '@/components/ui/top-bar'
import { getFriends } from '@/lib/dal/friend'
import { getProductCategories, getProducts } from '@/lib/dal/product'

type SearchParams = Promise<{
  q?: string | string[]
  category?: string | string[]
  for?: string | string[]
}>

function first(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : value?.[0] ?? ''
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const query = first(params.q)
  const categoryName = first(params.category)
  const friendUserId = first(params.for)
  const [friends, categories, products] = await Promise.all([
    getFriends(),
    getProductCategories(),
    getProducts({ query, categoryName, friendUserId: friendUserId || undefined }),
  ])
  const selectedFriend = friends.find(({ userId }) => userId === friendUserId)
  const productListReturnTo = `/products?${new URLSearchParams({ q: query, category: categoryName, for: friendUserId }).toString()}`

  return (
    <>
      <TopBar title="선물" />
      <main className="flex-1 px-5 pb-8">
        <form action="/products" className="space-y-3" aria-label="상품 검색과 필터">
          <label className="flex h-12 items-center gap-2 rounded-2xl border border-neutral-200 bg-surface px-4 focus-within:border-rose-400">
            <Search size={18} className="shrink-0 text-neutral-500" aria-hidden />
            <span className="sr-only">상품 검색</span>
            <input
              name="q"
              defaultValue={query}
              placeholder="어떤 선물을 찾으세요?"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className="sr-only">카테고리</span>
              <select name="category" defaultValue={categoryName} className="h-11 w-full rounded-xl border border-neutral-200 bg-surface px-3 text-sm">
                <option value="">전체 카테고리</option>
                {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only">받을 친구</span>
              {/* 친구가 없으면 고를 것이 없다 — 멀쩡해 보이는 빈 드롭다운 대신 왜 비었는지
                  말한다 (/fundings/new 가 "친구가 없습니다"로 이미 그렇게 한다) */}
              <select name="for" defaultValue={friendUserId} disabled={friends.length === 0} className="h-11 w-full rounded-xl border border-neutral-200 bg-surface px-3 text-sm disabled:bg-neutral-100 disabled:text-neutral-400">
                <option value="">{friends.length === 0 ? "친구가 없습니다" : "받을 친구 선택"}</option>
                {friends.map((friend) => <option key={friend.userId} value={friend.userId}>{friend.displayName}</option>)}
              </select>
            </label>
          </div>
          <button className="h-10 w-full rounded-xl bg-neutral-900 text-sm font-semibold text-white">검색·필터 적용</button>
        </form>

        {selectedFriend ? (
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-rose-50 px-4 py-3 text-sm">
            <span><strong>{selectedFriend.displayName}</strong>님에게 맞지 않는 종류는 뺐어요.</span>
            <Link href={`/products/for/${selectedFriend.userId}?returnTo=${encodeURIComponent(productListReturnTo)}`} className="shrink-0 font-semibold text-rose-700">맞춤 추천</Link>
          </div>
        ) : null}

        <div className="mt-5">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-lg font-bold">상품 {products.length}개</h2>
          </div>
          {products.length ? (
            <ProductGrid products={products} friendUserId={friendUserId || undefined} returnTo={productListReturnTo} />
          ) : (
            <div className="rounded-2xl border border-neutral-200 bg-surface px-5 py-10 text-center">
              <p className="font-semibold">조건에 맞는 상품이 없어요</p>
              <p className="mt-1 text-sm text-neutral-600">대상이나 필터를 해제하고 전체 상품에서 골라보세요.</p>
              <Link href="/products" className="mt-4 inline-block text-sm font-semibold text-rose-700">전체 상품 보기</Link>
            </div>
          )}
        </div>
      </main>
      <BottomNav active="gifts" />
    </>
  )
}
