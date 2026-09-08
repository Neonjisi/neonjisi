import Image from 'next/image'
import { notFound } from 'next/navigation'
import { cancelGiftRequestFromForm } from '@/app/gifts/actions/request'
import { GiftCountdown } from '@/components/gift/countdown'
import { formatPrice } from '@/components/product/product-card'
import { TopBar } from '@/components/ui/top-bar'
import { buttonClasses } from '@/components/ui/button'
import Link from 'next/link'
import { getGiftRequest } from '@/lib/dal/gift'
import { safeReturnTo } from '@/lib/navigation/return-to'

const STATUS_LABEL = {
  PENDING: '응답 기다리는 중',
  PAYING: '결제 중',
  PAID: '결제 완료',
  PAYMENT_FAILED: '결제 실패',
  CANCELLED: '취소됨',
  EXPIRED: '응답 기한 만료',
} as const

function visibleStatus(role: 'giver' | 'receiver', status: keyof typeof STATUS_LABEL): string {
  // 주는 사람의 결제 실패와 재시도 진행은 사적 정보다(FR-030).
  // 수령자에게는 확정된 선물을 처리 중이라는 사실만 보여준다.
  if (role === 'receiver' && status === 'PAYMENT_FAILED') return '선물 준비 중'
  return STATUS_LABEL[status]
}

export default async function GiftDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string | string[]; returnTo?: string | string[] }>
}) {
  const { id } = await params
  const query = await searchParams
  const error = typeof query.error === 'string' ? query.error : query.error?.[0]
  const rawReturnTo = typeof query.returnTo === 'string' ? query.returnTo : query.returnTo?.[0]
  const gift = await getGiftRequest(id)
  if (!gift) notFound()

  return (
    <main className="flex min-h-dvh flex-col pb-6">
      <TopBar title={gift.role === 'giver' ? '보낸 선물' : '받은 선물'} backHref={safeReturnTo(rawReturnTo, '/')} />
      <div className="flex flex-1 flex-col px-5 pt-4">
        <div className="rounded-[20px] bg-surface p-5">
          <p className="text-sm text-neutral-600">{gift.role === 'giver' ? '받는 사람' : '보낸 사람'}</p>
          <p className="mt-1 text-lg font-bold">{gift.counterpartDisplayName}</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <strong className="text-rose-700">{visibleStatus(gift.role, gift.status)}</strong>
            {gift.status === 'PENDING' ? <GiftCountdown respondDueAt={gift.respondDueAt} serverNow={gift.serverNow} className="text-xl" /> : null}
          </div>
        </div>

        <article className="mt-4 flex items-center gap-4 rounded-[20px] bg-surface p-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
            {gift.productSnapshot.imageUrl ? <Image src={gift.productSnapshot.imageUrl} alt="" fill sizes="80px" className="object-cover" /> : null}
          </div>
          <div className="min-w-0"><p className="font-semibold">{gift.productSnapshot.name}</p><p className="mt-1 font-bold text-rose-700">{formatPrice(gift.requestedAmount)}</p></div>
        </article>

        {gift.role === 'giver' && gift.resolution === 'COUNTERED' && gift.counterProductSnapshot ? (
          <section className="mt-4 rounded-[20px] bg-info-50 p-4" aria-label="변경된 선물">
            <p className="text-sm font-semibold text-info-700">받는 분이 다른 상품을 골랐어요</p>
            <p className="mt-2 text-sm text-neutral-600">원래 상품 · {gift.productSnapshot.name} ({formatPrice(gift.requestedAmount)})</p>
            <p className="mt-1 font-semibold">최종 상품 · {gift.counterProductSnapshot.name} ({formatPrice(gift.finalAmount ?? gift.counterProductSnapshot.price)})</p>
            <p className="mt-2 text-sm text-neutral-600">차액 {formatPrice(Math.max(0, gift.requestedAmount - (gift.finalAmount ?? gift.counterProductSnapshot.price)))}은 청구되지 않았어요.</p>
          </section>
        ) : null}

        {gift.role === 'giver' && gift.paymentMethodLabel ? (
          <p className="mt-4 text-sm text-neutral-600">결제수단 <strong className="text-neutral-900">{gift.paymentMethodLabel}</strong></p>
        ) : null}

        {error ? <p role="alert" className="mt-4 text-sm font-semibold text-error-700">{error}</p> : null}
        {gift.role === 'giver' && gift.status === 'PENDING' ? (
          <form action={cancelGiftRequestFromForm} className="mt-auto pt-8">
            <input type="hidden" name="giftRequestId" value={gift.id} />
            <button type="submit" className={buttonClasses('secondary', 'lg')}>요청 취소</button>
          </form>
        ) : null}
        {gift.role === 'receiver' && gift.status === 'PENDING' ? (
          <div className="mt-auto pt-8">
            <Link href={`/gifts/${gift.id}/respond/shipping`} className={buttonClasses('primary', 'lg')}>이걸로 받을게요</Link>
            <Link href={`/gifts/${gift.id}/respond/reselect`} className={buttonClasses('tertiary', 'lg', 'mt-2')}>다른 선물이 더 좋아요</Link>
            <p className="mt-3 text-center text-xs text-neutral-600">{formatPrice(gift.requestedAmount)} 이하에서 직접 고를 수 있어요.</p>
          </div>
        ) : null}
      </div>
    </main>
  )
}
