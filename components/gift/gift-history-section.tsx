import Image from 'next/image'
import Link from 'next/link'
import { formatPrice } from '@/components/product/product-card'
import type { GiftListItem, ProductSnapshot } from '@/lib/dal/gift'

function ProductSummary({ label, product }: { label: string; product: ProductSnapshot }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
        {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="56px" className="object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-neutral-500">{label}</p>
        <p className="mt-0.5 truncate font-semibold">{product.name}</p>
        <p className="mt-0.5 text-sm text-neutral-600">{formatPrice(product.price)}</p>
      </div>
    </div>
  )
}

export function GiftHistorySection({ title, gifts, returnTo }: { title: string; gifts: GiftListItem[]; returnTo: string }) {
  return (
    <section>
      <h2 className="font-bold">{title}</h2>
      {gifts.length ? (
        <ul className="mt-3 space-y-3">
          {gifts.map((gift) => {
            const hasChangedProduct = gift.resolution === 'COUNTERED' && gift.counterProductSnapshot !== null
            return (
              <li key={gift.id}>
                <Link href={`/gifts/${gift.id}?returnTo=${encodeURIComponent(returnTo)}`} className="block rounded-[20px] bg-surface p-4 active:bg-neutral-50">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="truncate font-semibold">{gift.counterpartDisplayName}님과의 선물</p>
                    {hasChangedProduct ? <span className="shrink-0 rounded-full bg-info-50 px-2 py-0.5 text-xs font-semibold text-info-700">선물 변경</span> : null}
                  </div>
                  {hasChangedProduct ? (
                    <div className="space-y-3">
                      <ProductSummary label="기존 선택 선물" product={gift.productSnapshot} />
                      <div className="border-t border-neutral-100" />
                      <ProductSummary label="변경한 선물" product={gift.counterProductSnapshot!} />
                    </div>
                  ) : (
                    <ProductSummary label="선택한 선물" product={gift.productSnapshot} />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : <p className="mt-3 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">아직 선물 내역이 없어요.</p>}
    </section>
  )
}
