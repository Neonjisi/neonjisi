import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Info, ShieldX } from 'lucide-react'
import { formatPrice } from '@/components/product/product-card'
import { buttonClasses } from '@/components/ui/button'
import { TopBar } from '@/components/ui/top-bar'
import { getFriendTaste } from '@/lib/dal/friend'
import { getMatchBanner, getProduct, type MatchBanner } from '@/lib/dal/product'
import { safeReturnTo } from '@/lib/navigation/return-to'

const BANNERS: Record<Exclude<MatchBanner, null>, { className: string; text: string; Icon: typeof Info }> = {
  want: {
    className: 'bg-success-50 text-success-700',
    text: '원하는 것에 적어둔 항목이에요',
    Icon: CheckCircle2,
  },
  have: {
    className: 'bg-warning-50 text-warning-700',
    text: '이미 갖고 있어요. 그래도 선물할 수 있어요',
    Icon: Info,
  },
  unwanted: {
    className: 'bg-error-50 text-error-700',
    text: '관심 없다고 한 종류예요',
    Icon: ShieldX,
  },
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ for?: string | string[]; returnTo?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const friendUserId = typeof query.for === 'string' ? query.for : query.for?.[0]
  const rawReturnTo = typeof query.returnTo === 'string' ? query.returnTo : query.returnTo?.[0]
  const backHref = safeReturnTo(rawReturnTo, '/products')
  const product = await getProduct(id)
  if (!product) notFound()

  const [friend, match] = friendUserId
    ? await Promise.all([getFriendTaste(friendUserId), getMatchBanner(id, friendUserId)])
    : [null, null]
  const banner = match ? BANNERS[match] : null
  const detailHref = `/products/${product.id}${friend ? `?for=${encodeURIComponent(friend.userId)}&returnTo=${encodeURIComponent(backHref)}` : `?returnTo=${encodeURIComponent(backHref)}`}`
  const giftHref = friend
    ? `/gifts/new?productId=${encodeURIComponent(product.id)}&receiverId=${encodeURIComponent(friend.userId)}&returnTo=${encodeURIComponent(detailHref)}`
    : `/products/${product.id}/receiver?returnTo=${encodeURIComponent(backHref)}`
  const fundingHref = `/fundings/new?productId=${encodeURIComponent(product.id)}&returnTo=${encodeURIComponent(detailHref)}${
    friend ? `&receiverId=${encodeURIComponent(friend.userId)}` : ''
  }`

  return (
    <>
      <TopBar title="상품 상세" backHref={backHref} />
      <main className="flex flex-1 flex-col pb-5">
        <div className="relative aspect-square w-full overflow-hidden bg-neutral-100">
          {product.imageUrl ? <Image src={product.imageUrl} alt="" fill priority sizes="430px" className="object-cover" /> : null}
        </div>
        <div className="flex-1 px-5 pt-5">
          <p className="text-sm font-medium text-neutral-500">{product.categoryName}</p>
          <h1 className="mt-1 break-keep text-xl font-bold leading-7">{product.name}</h1>
          <p className="mt-3 text-xl font-extrabold text-rose-700">{formatPrice(product.price)}</p>

          {banner ? (
            <div className={`mt-5 flex gap-3 rounded-2xl p-4 ${banner.className}`} role="status">
              <banner.Icon size={20} className="mt-0.5 shrink-0" aria-hidden />
              <p className="text-sm font-semibold"><strong>{friend?.displayName}</strong>님이 {banner.text}</p>
            </div>
          ) : friend ? (
            <div className="mt-5 rounded-2xl bg-info-50 p-4 text-sm text-info-700">등록된 취향과 겹치지 않는 상품이에요.</div>
          ) : (
            <div className="mt-5 rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-700">받을 친구를 고르면 취향과 맞는지 알려드려요.</div>
          )}
        </div>

        <div className="flex flex-col gap-3 px-5 pt-6">
          {match === 'unwanted' ? (
            <button disabled className={buttonClasses('primary', 'lg')}>선물하기</button>
          ) : (
            <Link href={giftHref} className={buttonClasses('primary', 'lg')}>
              {friend ? '선물하기' : '받을 친구 선택하기'}
            </Link>
          )}
          {match !== 'unwanted' ? (
            <Link href={fundingHref} className={buttonClasses('secondary', 'lg')}>
              여럿이 모아서 선물하기
            </Link>
          ) : null}
        </div>
      </main>
    </>
  )
}
