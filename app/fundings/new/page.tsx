import { notFound } from 'next/navigation'
import { FundingCreateForm } from '@/components/funding/create-form'
import { TopBar } from '@/components/ui/top-bar'
import { getFriends } from '@/lib/dal/friend'
import { getActivePaymentMethod } from '@/lib/dal/payment-method'
import { getProduct } from '@/lib/dal/product'
import { verifySession } from '@/lib/dal/session'
import { safeReturnTo } from '@/lib/navigation/return-to'

export default async function NewFundingPage({
  searchParams,
}: {
  searchParams: Promise<{
    productId?: string | string[]
    receiverId?: string | string[]
    returnTo?: string | string[]
    resume?: string | string[]
    goal?: string | string[]
    minimum?: string | string[]
    deadline?: string | string[]
  }>
}) {
  const query = await searchParams
  const productId = typeof query.productId === 'string' ? query.productId : query.productId?.[0]
  if (!productId) notFound()

  const [{ userId }, product, friends, paymentMethod] = await Promise.all([
    verifySession(),
    getProduct(productId),
    getFriends(),
    getActivePaymentMethod(),
  ])
  if (!product) notFound()

  const requestedReceiver = typeof query.receiverId === 'string' ? query.receiverId : query.receiverId?.[0]
  const rawReturnTo = typeof query.returnTo === 'string' ? query.returnTo : query.returnTo?.[0]
  const returnTo = safeReturnTo(rawReturnTo, `/products/${product.id}`)
  const initialReceiverId = friends.some((friend) => friend.userId === requestedReceiver) ? requestedReceiver : undefined
  const resume = typeof query.resume === 'string' ? query.resume : query.resume?.[0]
  const goal = typeof query.goal === 'string' ? query.goal : query.goal?.[0]
  const minimum = typeof query.minimum === 'string' ? query.minimum : query.minimum?.[0]
  const deadline = typeof query.deadline === 'string' ? query.deadline : query.deadline?.[0]
  const hasValidDraft = Boolean(
    goal &&
    minimum &&
    deadline &&
    Number(goal) > 0 &&
    Number(minimum) > 0 &&
    Number(minimum) <= Number(goal) &&
    /^\d{4}-\d{2}-\d{2}$/.test(deadline),
  )
  const initialStep = paymentMethod && initialReceiverId
    ? resume === 'consent' && hasValidDraft ? 3 : resume === 'amount' ? 2 : 1
    : 1

  return (
    <main className="flex min-h-dvh flex-col">
      <TopBar title="함께 선물하기" backHref={returnTo} />
      <FundingCreateForm
        currentUserId={userId}
        product={product}
        friends={friends}
        initialReceiverId={initialReceiverId}
        hasPaymentMethod={paymentMethod !== null}
        initialStep={initialStep}
        initialGoal={initialStep === 3 ? goal : undefined}
        initialMinimum={initialStep === 3 ? minimum : undefined}
        initialDeadline={initialStep === 3 ? deadline : undefined}
        returnTo={returnTo}
      />
    </main>
  )
}
