import { notFound } from 'next/navigation'
import { GiftCountdown } from '@/components/gift/countdown'
import { ProductCard, formatPrice } from '@/components/product/product-card'
import { TopBar } from '@/components/ui/top-bar'
import { getGiftRequest } from '@/lib/dal/gift'
import { getProductsUnderAmount } from '@/lib/dal/product'

export default async function GiftReselectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gift = await getGiftRequest(id)
  if (!gift || gift.role !== 'receiver' || gift.status !== 'PENDING') notFound()
  const products = await getProductsUnderAmount(gift.requestedAmount)

  return (
    <main className="flex min-h-dvh flex-col pb-8">
      <TopBar title="다른 선물 고르기" backHref={`/gifts/${gift.id}`} />
      <div className="px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">{formatPrice(gift.requestedAmount)} 이하에서 골라주세요</p>
          <GiftCountdown respondDueAt={gift.respondDueAt} serverNow={gift.serverNow} className="text-base" />
        </div>
        {products.length ? (
          <ul aria-label="선택할 수 있는 상품" className="mt-5 grid grid-cols-2 gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                returnTo={`/gifts/${gift.id}`}
                href={`/gifts/${gift.id}/respond/shipping?counterProductId=${encodeURIComponent(product.id)}`}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">이 금액대에 고를 수 있는 상품이 없어요. 원래 상품으로 받아주세요.</p>
        )}
      </div>
    </main>
  )
}
