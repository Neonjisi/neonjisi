import { notFound } from 'next/navigation'
import { ShippingForm } from '@/components/gift/shipping-form'
import { TopBar } from '@/components/ui/top-bar'
import { getGiftRequest } from '@/lib/dal/gift'
import { getProduct } from '@/lib/dal/product'

export default async function GiftShippingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ counterProductId?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const gift = await getGiftRequest(id)
  if (!gift || gift.role !== 'receiver' || gift.status !== 'PENDING') notFound()
  const counterProductId = typeof query.counterProductId === 'string' ? query.counterProductId : query.counterProductId?.[0]
  const counterProduct = counterProductId ? await getProduct(counterProductId) : null
  if (counterProductId && (!counterProduct || counterProduct.price > gift.requestedAmount)) notFound()

  return (
    <main className="flex min-h-dvh flex-col pb-6">
      <TopBar title="받을 곳" backHref={counterProduct ? `/gifts/${gift.id}/respond/reselect` : `/gifts/${gift.id}`} />
      <ShippingForm gift={gift} counterProduct={counterProduct} />
    </main>
  )
}
