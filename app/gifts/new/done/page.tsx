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
      <div className="flex flex-1 flex-col items-center px-5 pb-4 pt-12 text-center">
        <CircleCheck size={48} className="text-success-600" aria-hidden />
        <h2 className="mt-5 text-xl font-bold">요청을 보냈어요</h2>
        <p className="mt-2 text-sm text-neutral-600">{gift.counterpartDisplayName}님이 확인하면 자동으로 결제됩니다.</p>
        <p className="mt-10 text-sm font-semibold text-neutral-600">남은 시간</p>
        <GiftCountdown respondDueAt={gift.respondDueAt} serverNow={gift.serverNow} className="mt-3" />
        <div className="mt-auto w-full">
          <Link href={`/gifts/${gift.id}`} className={buttonClasses('primary', 'lg')}>요청 상세 보기</Link>
          <Link href="/" className={buttonClasses('tertiary', 'lg', 'mt-2')}>홈으로</Link>
        </div>
      </div>
    </main>
  )
}
