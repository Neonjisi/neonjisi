import Image from 'next/image'
import { selectWishlistProduct } from '@/app/taste/products/actions'
import { formatPrice } from '@/components/product/product-card'
import { TopBar } from '@/components/ui/top-bar'
import { getProducts } from '@/lib/dal/product'

export default async function TasteProductPickerPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const [products, query] = await Promise.all([getProducts(), searchParams])
  const error = typeof query.error === 'string' ? query.error : query.error?.[0]
  return (
    <main className="min-h-dvh pb-8">
      <TopBar title="원하는 상품 고르기" backHref="/taste" />
      <div className="px-5 pt-4">
        <p className="text-sm text-neutral-600">상품을 고르면 원하는 것에 바로 추가됩니다.</p>
        {error ? <p role="alert" className="mt-3 rounded-xl bg-error-50 p-3 text-sm text-error-700">{error}</p> : null}
        <ul aria-label="원하는 상품 목록" className="mt-5 grid grid-cols-2 gap-3">
          {products.map((product) => (
            <li key={product.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-surface">
              <div className="relative aspect-square bg-neutral-100">{product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="(max-width: 430px) 50vw, 215px" className="object-cover" /> : null}</div>
              <div className="p-3"><p className="line-clamp-2 min-h-10 text-sm font-semibold">{product.name}</p><p className="mt-1 text-sm font-bold text-rose-700">{formatPrice(product.price)}</p><form action={selectWishlistProduct.bind(null, product.id)}><button className="mt-3 h-9 w-full rounded-xl bg-rose-600 text-sm font-semibold text-white">선택</button></form></div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
