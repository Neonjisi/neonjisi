import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { FriendAvatar } from '@/components/friend/avatar'
import { formatPrice } from '@/components/product/product-card'
import { buttonClasses } from '@/components/ui/button'
import { TopBar } from '@/components/ui/top-bar'
import { getFriendTaste } from '@/lib/dal/friend'
import { getActivePaymentMethod } from '@/lib/dal/payment-method'
import { getMatchBanner, getProduct } from '@/lib/dal/product'
import { safeReturnTo } from '@/lib/navigation/return-to'

export default async function NewGiftPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string | string[]; receiverId?: string | string[]; returnTo?: string | string[] }>
}) {
  const query = await searchParams
  const productId = typeof query.productId === 'string' ? query.productId : query.productId?.[0]
  const receiverId = typeof query.receiverId === 'string' ? query.receiverId : query.receiverId?.[0]
  const rawReturnTo = typeof query.returnTo === 'string' ? query.returnTo : query.returnTo?.[0]
  if (!productId || !receiverId) notFound()

  const [product, receiver, paymentMethod, match] = await Promise.all([
    getProduct(productId),
    getFriendTaste(receiverId),
    getActivePaymentMethod(),
    getMatchBanner(productId, receiverId),
  ])
  if (!product || match === 'unwanted') notFound()

  const fallback = `/products/${product.id}?for=${encodeURIComponent(receiver.userId)}`
  const returnTo = safeReturnTo(rawReturnTo, fallback)
  const currentPath = `/gifts/new?productId=${encodeURIComponent(product.id)}&receiverId=${encodeURIComponent(receiver.userId)}&returnTo=${encodeURIComponent(returnTo)}`
  if (!paymentMethod) {
    redirect(`/payment-methods/new?returnTo=${encodeURIComponent(currentPath)}`)
  }

  return (
    <main className="flex min-h-dvh flex-col pb-6">
      <TopBar
        title="선물 보내기"
        backHref={returnTo}
      />
      <div className="flex flex-1 flex-col px-5">
        <p className="text-right text-xs font-semibold text-neutral-500">1 / 2</p>
        <section className="pt-5">
          <h2 className="text-xl font-bold">선물 요청을 확인해주세요</h2>
          <div className="mt-5 flex items-center gap-3 rounded-[20px] bg-surface p-4">
            <FriendAvatar name={receiver.displayName} avatarUrl={receiver.avatarUrl} />
            <div><p className="text-xs text-neutral-500">받는 사람</p><p className="font-semibold">{receiver.displayName}</p></div>
          </div>
          <article className="mt-3 flex items-center gap-4 rounded-[20px] bg-surface p-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
              {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
            </div>
            <div className="min-w-0"><p className="truncate font-semibold">{product.name}</p><p className="mt-1 font-bold text-rose-700">{formatPrice(product.price)}</p></div>
          </article>
          <div className="mt-5 rounded-[20px] bg-surface p-4 text-sm">
            <div className="flex justify-between gap-3"><span className="text-neutral-600">결제수단</span><span className="font-semibold">{paymentMethod.cardBrand} **** {paymentMethod.cardLast4}</span></div>
            <Link href={`/payment-methods?returnTo=${encodeURIComponent(currentPath)}`} className="mt-2 block text-right text-sm font-semibold text-rose-700">변경</Link>
            <div className="my-3 h-px bg-neutral-100" />
            <div className="flex justify-between"><span className="text-neutral-600">결제 금액</span><strong>{formatPrice(product.price)}</strong></div>
          </div>
          <p className="mt-4 text-sm text-neutral-600">{receiver.displayName}님이 5분 안에 확인하면 결제됩니다.</p>
        </section>
        <Link
          href={`/gifts/new/consent?productId=${encodeURIComponent(product.id)}&receiverId=${encodeURIComponent(receiver.userId)}&returnTo=${encodeURIComponent(returnTo)}`}
          className={buttonClasses('primary', 'lg', 'mt-auto')}
        >
          다음
        </Link>
      </div>
    </main>
  )
}
