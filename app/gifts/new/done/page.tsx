import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CircleCheck } from 'lucide-react'
import { GiftCountdown } from '@/components/gift/countdown'
import { buttonClasses } from '@/components/ui/button'
import { TopBar } from '@/components/ui/top-bar'
import { getGiftRequest } from '@/lib/dal/gift'

export default async function GiftDonePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>
}) {
  const query = await searchParams
  const id = typeof query.id === 'string' ? query.id : query.id?.[0]
  if (!id) notFound()
  const gift = await getGiftRequest(id)
  if (!gift || gift.role !== 'giver' || gift.status !== 'PENDING') notFound()

  return (
    <main className="flex min-h-dvh flex-col pb-6">
      <TopBar title="전송 완료" backHref="/" />
      <div className="flex flex-1 flex-col items-center px-5 pb-4 pt-6 text-center">
        <div className="mt-auto grid size-16 place-items-center rounded-full bg-success-50">
          <CircleCheck size={32} className="text-success-700" aria-hidden />
        </div>
        <h2 className="mt-5 text-xl font-bold">요청을 보냈어요</h2>
        <p className="mt-2 text-sm text-neutral-600">{gift.counterpartDisplayName}님이 확인하면 자동으로 결제됩니다.</p>
        <dl className="mt-6 w-full divide-y divide-neutral-100 rounded-[18px] border border-neutral-200 bg-surface px-4 text-sm">
          <div className="flex justify-between py-3"><dt className="text-neutral-600">받는 분</dt><dd className="font-semibold">{gift.counterpartDisplayName}</dd></div>
          <div className="flex justify-between py-3"><dt className="text-neutral-600">전송 상태</dt><dd className="font-semibold text-success-700">요청 완료</dd></div>
          <div className="flex items-center justify-between py-3"><dt className="text-neutral-600">응답 기한</dt><dd><GiftCountdown respondDueAt={gift.respondDueAt} serverNow={gift.serverNow} className="text-sm font-semibold" /></dd></div>
        </dl>
        <div className="mt-auto w-full pt-8">
          <Link href="/" className={buttonClasses('primary', 'lg')}>홈으로</Link>
        </div>
      </div>
    </main>
  )
}
