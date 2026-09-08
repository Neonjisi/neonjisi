import { notFound, redirect } from 'next/navigation'
import { ConsentCheckbox } from '@/components/gift/consent-checkbox'
import { formatPrice } from '@/components/product/product-card'
import { TopBar } from '@/components/ui/top-bar'
import { getFriendTaste } from '@/lib/dal/friend'
import { getActivePaymentMethod } from '@/lib/dal/payment-method'
import { getMatchBanner, getProduct } from '@/lib/dal/product'
import { consentSentences } from '@/lib/gift/consent'
import { safeReturnTo } from '@/lib/navigation/return-to'

export default async function GiftConsentPage({
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

  const returnTo = safeReturnTo(rawReturnTo, `/products/${product.id}?for=${encodeURIComponent(receiver.userId)}`)
  const reviewPath = `/gifts/new?productId=${encodeURIComponent(product.id)}&receiverId=${encodeURIComponent(receiver.userId)}&returnTo=${encodeURIComponent(returnTo)}`
  if (!paymentMethod) redirect(`/payment-methods/new?returnTo=${encodeURIComponent(reviewPath)}`)

  return (
    <main className="flex min-h-dvh flex-col pb-6">
      <TopBar title="결제 동의" backHref={reviewPath} />
      <div className="flex flex-1 flex-col px-5">
        <p className="text-right text-xs font-semibold text-neutral-500">2 / 2</p>
        <section className="pt-5">
          <h2 className="text-xl font-bold">결제 전 확인해주세요</h2>
          <p className="mt-2 text-sm text-neutral-600">결제 상한은 {formatPrice(product.price)}입니다.</p>
          <div className="mt-5 rounded-[20px] bg-surface p-5 text-sm leading-6">
            {consentSentences({ receiverDisplayName: receiver.displayName, requestedAmount: product.price }).map((sentence) => <p key={sentence}>{sentence}</p>)}
          </div>
        </section>
        <ConsentCheckbox productId={product.id} receiverId={receiver.userId} />
      </div>
    </main>
  )
}
