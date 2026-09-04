import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FriendAvatar } from '@/components/friend/avatar'
import { TopBar } from '@/components/ui/top-bar'
import { getFriends } from '@/lib/dal/friend'
import { getProduct } from '@/lib/dal/product'
import { safeReturnTo } from '@/lib/navigation/return-to'

export default async function ProductReceiverPage({
  params,
  searchParams,
}: PageProps<'/products/[id]/receiver'>) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const rawReturnTo = typeof query.returnTo === 'string' ? query.returnTo : query.returnTo?.[0]
  const listReturnTo = safeReturnTo(rawReturnTo, '/products')
  const [product, friends] = await Promise.all([getProduct(id), getFriends()])
  if (!product) notFound()

  const detailReturnTo = `/products/${product.id}?returnTo=${encodeURIComponent(listReturnTo)}`

  return (
    <main className="flex min-h-dvh flex-col pb-8">
      <TopBar title="받을 친구 선택" backHref={detailReturnTo} />
      <div className="px-5 pt-4">
        <p className="text-sm text-neutral-600">{product.name}을(를) 받을 친구를 선택해주세요.</p>
        {friends.length ? (
          <ul aria-label="받을 친구 목록" className="mt-4 divide-y divide-neutral-100 rounded-[20px] bg-surface px-4">
            {friends.map((friend) => (
              <li key={friend.userId}>
                <Link
                  href={`/products/${product.id}?for=${encodeURIComponent(friend.userId)}&returnTo=${encodeURIComponent(listReturnTo)}`}
                  className="flex min-h-[76px] items-center gap-3 py-3 active:bg-neutral-50"
                >
                  <FriendAvatar name={friend.displayName} avatarUrl={friend.avatarUrl} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-neutral-900">
                    {friend.displayName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-[20px] bg-surface p-5 text-center">
            <p className="font-semibold">아직 친구가 없어요</p>
            <p className="mt-1 text-sm text-neutral-600">친구를 추가한 뒤 선물을 보낼 수 있어요.</p>
            <Link href="/friends/invite" className="mt-5 inline-block text-sm font-semibold text-rose-700">
              친구 초대하기
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
