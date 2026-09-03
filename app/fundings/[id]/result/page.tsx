import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { formatPrice } from '@/components/product/product-card'
import { buttonClasses } from '@/components/ui/button'
import { getFunding } from '@/lib/dal/funding'

export default async function FundingResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const funding = await getFunding(id)
  if (!funding) notFound()
  if (funding.status === 'OPEN') redirect(`/fundings/${id}`)

  const success = funding.status === 'SUCCEEDED' || funding.status === 'SETTLED'
  const cancelled = funding.status === 'CANCELLED'

  return (
    <main className="flex min-h-dvh flex-col px-5 pb-8 pt-16 text-center">
      <div className={`mx-auto grid size-16 place-items-center rounded-full text-3xl ${success ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}`}>{success ? '✓' : '!'}</div>
      <h1 className="mt-5 text-2xl font-extrabold">{success ? '펀딩이 성사됐어요' : cancelled ? '주최자가 펀딩을 취소했어요' : '달성선에 못 미쳤어요'}</h1>

      <article className="mt-7 flex items-center gap-4 rounded-[20px] bg-surface p-4 text-left">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
          {funding.productSnapshot.imageUrl ? <Image src={funding.productSnapshot.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
        </div>
        <div><p className="font-semibold">{funding.productSnapshot.name}</p><p className="mt-1 text-sm font-bold text-rose-700">{formatPrice(funding.productSnapshot.price)}</p></div>
      </article>

      <dl className="mt-5 grid grid-cols-2 gap-y-3 rounded-[20px] bg-surface p-5 text-sm text-left">
        <dt className="text-neutral-600">받는 분</dt><dd className="text-right font-semibold">{funding.receiverDisplayName}</dd>
        <dt className="text-neutral-600">모인 금액</dt><dd className="text-right font-semibold">{formatPrice(funding.paidTotal)}</dd>
        <dt className="text-neutral-600">{success ? '목표 금액' : '최소 달성선'}</dt><dd className="text-right font-semibold">{formatPrice(success ? funding.goalAmount : funding.minAmount)}</dd>
        {funding.myContribution ? <><dt className="text-neutral-600">내 참여</dt><dd className="text-right font-semibold">{formatPrice(funding.myContribution.amount)}</dd></> : null}
      </dl>

      {!success ? <p className="mt-5 rounded-[14px] bg-warning-50 p-4 text-sm leading-6 text-warning-700">참여하신 금액은 전액 환불됩니다.<br />영업일 기준 3~5일 소요됩니다.</p> : null}
      {success && funding.role === 'organizer' && funding.topup?.amount ? <p className="mt-5 rounded-[14px] bg-info-50 p-4 text-sm text-info-700">차액 {formatPrice(funding.topup.amount)}이 등록된 카드로 결제되었습니다.</p> : null}
      <Link href="/my/fundings" className={buttonClasses('primary', 'lg', 'mt-auto')}>확인</Link>
    </main>
  )
}
