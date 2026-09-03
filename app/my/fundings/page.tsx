import Link from 'next/link'
import { FundingCard } from '@/components/funding/funding-card'
import { TopBar } from '@/components/ui/top-bar'
import { getMyFundings } from '@/lib/dal/funding'

export default async function MyFundingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, fundings] = await Promise.all([searchParams, getMyFundings()])
  const activeTab = tab === 'contributed' ? 'contributed' : 'organized'
  const list = fundings[activeTab]
  const active = list.filter((funding) => funding.status === 'OPEN' || funding.status === 'SUCCEEDED')
  const ended = list.filter((funding) => funding.status !== 'OPEN' && funding.status !== 'SUCCEEDED')

  return (
    <main className="min-h-dvh pb-8">
      <TopBar title="펀딩 내역" backHref="/my" />
      <nav aria-label="펀딩 내역 구분" className="mx-5 mt-3 grid grid-cols-2 rounded-xl bg-neutral-100 p-1">
        <Link href="/my/fundings" aria-current={activeTab === 'organized' ? 'page' : undefined} className={`rounded-lg py-2 text-center text-sm font-semibold ${activeTab === 'organized' ? 'bg-surface text-rose-700' : 'text-neutral-600'}`}>내가 연 것</Link>
        <Link href="/my/fundings?tab=contributed" aria-current={activeTab === 'contributed' ? 'page' : undefined} className={`rounded-lg py-2 text-center text-sm font-semibold ${activeTab === 'contributed' ? 'bg-surface text-rose-700' : 'text-neutral-600'}`}>참여한 것</Link>
      </nav>
      <div className="space-y-7 px-5 pt-6">
        <section>
          <h2 className="font-bold">진행 중</h2>
          {active.length ? <ul className="mt-3 space-y-3">{active.map((funding) => <FundingCard key={funding.id} funding={funding} />)}</ul> : <p className="mt-3 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">진행 중인 펀딩이 없어요. 선물에서 함께 준비할 상품을 골라보세요.</p>}
        </section>
        <section>
          <h2 className="font-bold">끝난 펀딩</h2>
          {ended.length ? <ul className="mt-3 space-y-3">{ended.map((funding) => <FundingCard key={funding.id} funding={funding} />)}</ul> : <p className="mt-3 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">아직 끝난 펀딩이 없어요.</p>}
        </section>
      </div>
    </main>
  )
}
