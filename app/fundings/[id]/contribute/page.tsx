import { notFound, redirect } from 'next/navigation'
import { FundingContributeForm } from '@/components/funding/contribute-form'
import { TopBar } from '@/components/ui/top-bar'
import { getFunding } from '@/lib/dal/funding'
import { getActivePaymentMethod } from '@/lib/dal/payment-method'

export default async function ContributeFundingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [funding, paymentMethod] = await Promise.all([getFunding(id), getActivePaymentMethod()])
  if (!funding) notFound()
  if (funding.status !== 'OPEN' || funding.remaining <= 0) redirect(`/fundings/${id}`)
  if (!paymentMethod) {
    const returnTo = `/fundings/${id}/contribute`
    redirect(`/payment-methods/new?returnTo=${encodeURIComponent(returnTo)}`)
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <TopBar title="참여하기" backHref={`/fundings/${id}`} />
      <FundingContributeForm
        fundingId={id}
        receiverDisplayName={funding.receiverDisplayName}
        productName={funding.productSnapshot.name}
        remaining={funding.remaining}
        cardLabel={`${paymentMethod.cardBrand} **** ${paymentMethod.cardLast4}`}
      />
    </main>
  )
}
