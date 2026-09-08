import Link from 'next/link'
import { TopBar } from '@/components/ui/top-bar'
import { GiftHistorySection } from '@/components/gift/gift-history-section'
import { getReceivedGifts, getSentGifts } from '@/lib/dal/gift'

export default async function MyGiftsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const query = await searchParams
  const activeTab = query.tab === 'received' ? 'received' : 'sent'
  const gifts = activeTab === 'received' ? await getReceivedGifts() : await getSentGifts()
  const returnTo = activeTab === 'received' ? '/my/gifts?tab=received' : '/my/gifts'
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
        <GiftHistorySection title="진행 중" gifts={ongoing} returnTo={returnTo} />
        <GiftHistorySection title="지난 선물" gifts={past} returnTo={returnTo} />
      </div>
    </main>
  )
}
