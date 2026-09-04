import Image from 'next/image'
import Link from 'next/link'
import { TopBar } from '@/components/ui/top-bar'
import { getReceivedGifts, getSentGifts, type GiftListItem } from '@/lib/dal/gift'
import { formatPrice } from '@/components/product/product-card'

function GiftSection({ title, gifts }: { title: string; gifts: GiftListItem[] }) {
  return (
    <section>
      <h2 className="font-bold">{title}</h2>
      {gifts.length ? (
        <ul className="mt-3 space-y-3">
          {gifts.map((gift) => {
            const product = gift.counterProductSnapshot ?? gift.productSnapshot
            return (
              <li key={gift.id}>
                <Link href={`/gifts/${gift.id}`} className="flex items-center gap-4 rounded-[20px] bg-surface p-4 active:bg-neutral-50">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                    {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{gift.counterpartDisplayName}님 · {product.name}</p>
                    <p className="mt-1 text-sm text-neutral-600">{formatPrice(gift.finalAmount ?? gift.requestedAmount)}</p>
                    {gift.resolution === 'COUNTERED' ? <span className="mt-1 inline-block rounded-full bg-info-50 px-2 py-0.5 text-xs font-semibold text-info-700">다른 상품으로 변경</span> : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : <p className="mt-3 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">아직 선물 내역이 없어요.</p>}
    </section>
  )
}

export default async function MyGiftsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const query = await searchParams
  const activeTab = query.tab === 'received' ? 'received' : 'sent'
  const gifts = activeTab === 'received' ? await getReceivedGifts() : await getSentGifts()
  const ongoing = gifts.filter((gift) => gift.isOngoing)
  const past = gifts.filter((gift) => !gift.isOngoing)

  return (
    <main className="min-h-dvh pb-8">
      <TopBar title="선물 내역" backHref="/my" />
      <nav aria-label="선물 내역 구분" className="mx-5 mt-3 grid grid-cols-2 rounded-xl bg-neutral-100 p-1">
        <Link href="/my/gifts" aria-current={activeTab === 'sent' ? 'page' : undefined} className={`rounded-lg py-2 text-center text-sm font-semibold ${activeTab === 'sent' ? 'bg-surface text-rose-700' : 'text-neutral-600'}`}>보낸 선물</Link>
        <Link href="/my/gifts?tab=received" aria-current={activeTab === 'received' ? 'page' : undefined} className={`rounded-lg py-2 text-center text-sm font-semibold ${activeTab === 'received' ? 'bg-surface text-rose-700' : 'text-neutral-600'}`}>받은 선물</Link>
      </nav>
      <div className="space-y-8 px-5 pt-6">
        <GiftSection title="진행 중" gifts={ongoing} />
        <GiftSection title="지난 선물" gifts={past} />
      </div>
    </main>
  )
}
