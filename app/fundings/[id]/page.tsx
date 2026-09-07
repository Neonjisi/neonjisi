import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FundingDetailActions } from '@/components/funding/detail-actions'
import { formatPrice } from '@/components/product/product-card'
import { buttonClasses } from '@/components/ui/button'
import { TopBar } from '@/components/ui/top-bar'
import { getFunding, type FundingDetailView } from '@/lib/dal/funding'
import { safeReturnTo } from '@/lib/navigation/return-to'

const STATUS_COPY: Record<FundingDetailView['status'], string> = {
  OPEN: '함께 채우고 있어요',
  SUCCEEDED: '성사됐어요',
  SETTLED: '선물이 확정되었어요',
  FAILED: '최소 달성 금액을 못 채워 취소됐어요',
  // 취소는 두 원인이 한 상태로 들어온다 — 사유 중립이 기본이고, 주최자에게만 statusCopy() 가 가른다
  CANCELLED: '펀딩이 취소됐어요',
}

/**
 * 취소 사유는 `topup` 이 내려오는 **주최자에게만** 갈린다 (lib/dal/funding.ts — organizer 전용).
 * 판정식은 settle.ts 의 cause 판정(`topupAttemptCount > 0`)과 **같은 식**이다. 같은 식을 쓰므로
 * 알림("차액 결제가 완료되지 않아 …")과 이 화면이 구조적으로 어긋날 수 없다 (copy.md §4).
 */
function statusCopy(funding: FundingDetailView): string {
  if (funding.status !== 'CANCELLED') return STATUS_COPY[funding.status]
  if (!funding.topup) return STATUS_COPY.CANCELLED
  return funding.topup.attemptCount > 0 ? '차액 결제가 완료되지 않아 취소됐어요' : '펀딩을 취소했어요'
}

function dDay(deadline: Date, now: Date): string {
  const days = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000))
  return days === 0 ? '오늘 마감' : `D-${days}`
}

export default async function FundingDetailPage({ params, searchParams }: PageProps<'/fundings/[id]'>) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const rawReturnTo = typeof query.returnTo === 'string' ? query.returnTo : query.returnTo?.[0]
  const funding = await getFunding(id)
  if (!funding) notFound()

  const progress = Math.min(100, Math.round((funding.paidTotal / funding.goalAmount) * 100))
  const threshold = Math.min(100, Math.round((funding.minAmount / funding.goalAmount) * 100))
  const reached = funding.paidTotal >= funding.minAmount
  const canContribute = funding.status === 'OPEN' && funding.remaining > 0
  const resultHref = `/fundings/${funding.id}/result`

  return (
    <main className="flex min-h-dvh flex-col pb-6">
      <TopBar
        title={`${funding.receiverDisplayName}님 선물`}
        backHref={safeReturnTo(rawReturnTo, '/')}
        action={funding.role === 'organizer' && funding.status === 'OPEN' ? <FundingDetailActions fundingId={funding.id} /> : null}
      />
      <div className="flex flex-col gap-6 px-5 pt-4">
        <article className="flex items-center gap-4 rounded-[20px] bg-surface p-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
            {funding.productSnapshot.imageUrl ? <Image src={funding.productSnapshot.imageUrl} alt="" fill sizes="80px" className="object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{funding.productSnapshot.name}</p>
            <p className="mt-1 font-bold text-rose-700">{formatPrice(funding.productSnapshot.price)}</p>
          </div>
        </article>

        <section aria-label="펀딩 진행 상황" className="rounded-[20px] bg-surface p-5">
          <p className="text-sm font-semibold text-rose-700">{funding.status === 'OPEN' && funding.remaining === 0 ? '목표를 채웠어요' : statusCopy(funding)}</p>
          <p className="mt-2 text-xl font-extrabold">{formatPrice(funding.paidTotal)} <span className="text-sm font-medium text-neutral-500">/ {formatPrice(funding.goalAmount)}</span></p>
          <div className="relative mt-4 h-2.5 overflow-visible rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-success-500 transition-[width] duration-[400ms]" style={{ width: `${progress}%` }} />
            <span className="absolute top-[-3px] h-4 w-px bg-success-700" style={{ left: `${threshold}%` }} aria-hidden />
          </div>
          <p className="mt-2 text-xs text-neutral-600">최소 달성 금액 {formatPrice(funding.minAmount)} · {reached ? '달성' : '달성 전'}</p>
          <dl className="mt-5 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-neutral-600">남은 금액</dt><dd className="text-right font-bold">{formatPrice(funding.remaining)}</dd>
            {funding.reservedInFlight > 0 ? <><dt className="text-neutral-600">결제 중</dt><dd className="text-right font-semibold">{formatPrice(funding.reservedInFlight)}</dd></> : null}
            <dt className="text-neutral-600">마감까지</dt><dd className="text-right font-semibold">{dDay(funding.deadline, funding.serverNow)}</dd>
          </dl>
        </section>

        <section>
          <h2 className="font-bold">참여자 {funding.contributions.length}명</h2>
          {funding.contributions.length ? (
            <ul className="mt-3 divide-y divide-neutral-100 rounded-[20px] bg-surface px-4">
              {funding.contributions.map((contribution, index) => (
                <li key={`${contribution.displayName}-${index}`} className="flex justify-between py-3 text-sm">
                  <span>{contribution.displayName}</span>
                  <span className="font-semibold">{contribution.amount === null ? '금액 비공개' : formatPrice(contribution.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 rounded-[20px] bg-surface p-5 text-sm text-neutral-600">아직 첫 참여자를 기다리고 있어요.</p>}
          {funding.myContribution ? <p className="mt-3 text-sm text-neutral-600">내 참여 금액 {formatPrice(funding.myContribution.amount)} · {funding.myContribution.status === 'RESERVED' ? '처리 중' : funding.myContribution.status === 'PAID' ? '결제 완료' : '환불됨'}</p> : null}
        </section>

        {canContribute ? <Link href={`/fundings/${funding.id}/contribute`} className={buttonClasses('primary', 'lg')}>참여하기</Link> : null}
        {funding.status !== 'OPEN' ? <Link href={resultHref} className={buttonClasses('secondary', 'lg')}>{funding.status === 'FAILED' || funding.status === 'CANCELLED' ? '환불 내역' : '결과 보기'}</Link> : null}
        {funding.status === 'OPEN' && funding.remaining === 0 ? <button disabled className={buttonClasses('primary', 'lg')}>참여 마감</button> : null}
      </div>
    </main>
  )
}
