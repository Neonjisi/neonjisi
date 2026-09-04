import Image from 'next/image'
import Link from 'next/link'
import type { ProductView } from '@/lib/dal/product'

export function formatPrice(price: number): string {
  return `${new Intl.NumberFormat('ko-KR').format(price)}원`
}

export function ProductCard({
  product,
  friendUserId,
  badge,
  returnTo,
  href: customHref,
}: {
  product: ProductView
  friendUserId?: string
  badge?: string
  returnTo: string
  href?: string
}) {
  const query = new URLSearchParams({ returnTo })
  if (friendUserId) query.set('for', friendUserId)
  const href = customHref ?? `/products/${product.id}?${query.toString()}`
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="block overflow-hidden rounded-2xl border border-neutral-200 bg-surface active:bg-neutral-50"
      >
        <div className="relative aspect-square overflow-hidden bg-neutral-100">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt=""
              fill
              sizes="(max-width: 430px) 50vw, 215px"
              className="object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center text-3xl" aria-hidden>
              🎁
            </span>
          )}
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-neutral-500">{product.categoryName}</span>
            {badge ? (
              <span className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-700">
                {badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 min-h-10 break-keep text-sm font-semibold leading-5 text-neutral-900">
            {product.name}
          </p>
          <p className="mt-1 text-sm font-bold text-rose-700">{formatPrice(product.price)}</p>
        </div>
      </Link>
    </li>
  )
}

export function ProductGrid({
  products,
  friendUserId,
  haveCategoryIds = [],
  returnTo,
}: {
  products: ProductView[]
  friendUserId?: string
  haveCategoryIds?: string[]
  returnTo: string
}) {
  const haveCategories = new Set(haveCategoryIds)
  return (
    <ul aria-label="상품 목록" className="grid grid-cols-2 gap-3">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          friendUserId={friendUserId}
          badge={haveCategories.has(product.categoryId) ? '이미 갖고 있어요' : undefined}
          returnTo={returnTo}
        />
      ))}
    </ul>
  )
}
