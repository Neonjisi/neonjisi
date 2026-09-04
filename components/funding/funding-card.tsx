import Link from 'next/link'
import { formatPrice } from '@/components/product/product-card'
import type { FundingCardView } from '@/lib/dal/funding'

const LABEL = {
  OPEN: '진행 중',
  SUCCEEDED: '성사 · 정산 중',
  SETTLED: '성사',
  FAILED: '미달 취소 · 환불 완료',
  CANCELLED: '주최자 취소 · 환불 완료',
} as const

function dDay(deadline: Date, now: Date): string {
  const days = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000))
  return days === 0 ? '오늘 마감' : `D-${days}`
}

export function FundingCard({ funding, returnTo }: { funding: FundingCardView; returnTo: string }) {
  const progress = Math.min(100, Math.round((funding.paidTotal / funding.goalAmount) * 100))
  return (
    <li>
      <Link href={`/fundings/${funding.id}?returnTo=${encodeURIComponent(returnTo)}`} className="block rounded-[20px] bg-surface p-4 active:bg-neutral-50">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-semibold">{funding.receiverDisplayName}님 · {funding.productSnapshot.name}</p>
          <span className="shrink-0 text-xs font-semibold text-rose-700">{LABEL[funding.status]}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-success-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-neutral-600">
          <span>{formatPrice(funding.paidTotal)} / {formatPrice(funding.goalAmount)}</span>
          <span>{funding.status === 'OPEN' ? dDay(funding.deadline, funding.serverNow) : LABEL[funding.status]}</span>
        </div>
      </Link>
    </li>
  )
}
