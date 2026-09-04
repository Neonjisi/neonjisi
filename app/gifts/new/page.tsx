import { notFound, redirect } from 'next/navigation'
import { GiftCreateForm } from '@/components/gift/create-form'
import { TopBar } from '@/components/ui/top-bar'
import { getFriendTaste } from '@/lib/dal/friend'
import { getActivePaymentMethod } from '@/lib/dal/payment-method'
import { getMatchBanner, getProduct } from '@/lib/dal/product'

export default async function NewGiftPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string | string[]; receiverId?: string | string[] }>
}) {
  const query = await searchParams
  const productId = typeof query.productId === 'string' ? query.productId : query.productId?.[0]
  const receiverId = typeof query.receiverId === 'string' ? query.receiverId : query.receiverId?.[0]
  if (!productId || !receiverId) notFound()

  const [product, receiver, paymentMethod, match] = await Promise.all([
    getProduct(productId),
    getFriendTaste(receiverId),
    getActivePaymentMethod(),
    getMatchBanner(productId, receiverId),
  ])
  if (!product || match === 'unwanted') notFound()

  const currentPath = `/gifts/new?productId=${encodeURIComponent(product.id)}&receiverId=${encodeURIComponent(receiver.userId)}`
  if (!paymentMethod) {
    redirect(`/payment-methods/new?returnTo=${encodeURIComponent(currentPath)}`)
  }

  return (
    <main className="flex min-h-dvh flex-col pb-6">
      <TopBar
        title="선물 보내기"
        backHref={`/products/${product.id}?for=${encodeURIComponent(receiver.userId)}`}
      />
      <GiftCreateForm product={product} receiver={receiver} paymentMethod={paymentMethod} />
    </main>
  )
}
