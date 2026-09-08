'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createFunding } from '@/app/fundings/actions/create'
import { suggestMinAmount } from '@/lib/config/funding'
import { formatPrice } from '@/components/product/product-card'
import { Button, buttonClasses } from '@/components/ui/button'
import { RadioOption } from '@/components/ui/radio-option'
import { TextField } from '@/components/ui/text-field'
import { fundingConsentSentences } from '@/lib/funding/consent'

type FriendOption = { userId: string; displayName: string }
type ProductOption = { id: string; name: string; imageUrl: string | null; price: number }

type Props = {
  currentUserId: string
  product: ProductOption
  friends: FriendOption[]
  initialReceiverId?: string
  hasPaymentMethod: boolean
  /** 최소 달성 금액 = 목표 x 이 비율 (FR-002). 서버가 `getMinAmountRatio()` 로 읽어 내려준다 */
  minAmountRatio: number
  initialStep: 1 | 2 | 3
  initialGoal?: string
  initialMinimum?: string
  initialDeadline?: string
  returnTo: string
}

function tomorrow(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

function numberValue(value: string): number {
  return Number(value.replaceAll(',', ''))
}

export function FundingCreateForm({
  currentUserId,
  product,
  friends,
  initialReceiverId,
  hasPaymentMethod,
  minAmountRatio,
  initialStep,
  initialGoal,
  initialMinimum,
  initialDeadline,
  returnTo,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<1 | 2 | 3>(initialStep)
  const [target, setTarget] = useState<'self' | 'friend'>(initialReceiverId ? 'friend' : 'self')
  const [receiverId, setReceiverId] = useState(initialReceiverId ?? friends[0]?.userId ?? '')
  const [goal, setGoal] = useState(initialGoal ?? String(product.price))
  const [minimumInput, setMinimumInput] = useState(initialMinimum ?? '')
  // 이어하기(resume)로 돌아온 초안의 최소 금액은 사용자가 이미 정한 값이다 — 비율로 덮지 않는다
  const [minimumEdited, setMinimumEdited] = useState(initialMinimum !== undefined)
  const [deadline, setDeadline] = useState(initialDeadline ?? tomorrow())
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSelf = target === 'self'
  const selectedFriend = friends.find((friend) => friend.userId === receiverId)
  const receiverName = isSelf ? '나' : (selectedFriend?.displayName ?? '친구')
  const goalAmount = numberValue(goal)
  /**
   * 최소 달성 금액은 **목표 금액**을 따라간다 (FR-002) — 비율은 서버가 정한다.
   * 기준을 `product.price` 로 두면 목표를 올려도 최소가 상품가에 묶인 채 남는다(피드백 지적).
   * 사용자가 한 번이라도 직접 고치면 그 값이 이긴다 — 자동값은 기본값이지 강제가 아니다.
   */
  const suggestedMinimum = goalAmount > 0 ? String(suggestMinAmount(goalAmount, minAmountRatio)) : ''
  const minimum = minimumEdited ? minimumInput : suggestedMinimum
  const minAmount = isSelf ? goalAmount : numberValue(minimum)
  const maxBurden = Math.max(0, goalAmount - minAmount)
  const totalSteps = isSelf ? 2 : 3

  /**
   * 마감일은 **입력 즉시** 판정해 필드에 붙인다 (TextField 의 error prop — 테두리·aria-invalid
   * 까지 함께 간다). 제출해야만 알 수 있으면 사용자는 왜 막히는지 모른 채 버튼을 누른다.
   */
  const deadlineError =
    deadline === ''
      ? '마감일을 정해주세요'
      : new Date(`${deadline}T23:59:59`).getTime() <= Date.now()
        ? '마감일은 오늘 이후로 정해주세요'
        : undefined

  /** 값이 바뀌면 지난 제출에서 남은 오류를 지운다 — 이미 고친 값 위에 옛 오류가 남으면 안 된다 */
  function editField(set: (value: string) => void): (value: string) => void {
    return (value) => {
      setError(null)
      set(value)
    }
  }

  function validateAmounts(): boolean {
    if (!(goalAmount > 0) || !(minAmount > 0) || minAmount > goalAmount) {
      setError('최소 달성 금액은 목표 금액보다 클 수 없어요')
      return false
    }
    // 마감일 사정은 필드가 이미 말하고 있다 — 같은 문장을 폼 상단에 겹쳐 쓰지 않는다
    if (deadlineError) {
      setError(null)
      return false
    }
    setError(null)
    return true
  }

  function advance(): void {
    if (step === 1) {
      if (!isSelf && !receiverId) {
        setError('받는 친구를 선택해주세요')
        return
      }
      setError(null)
      if (!isSelf && !hasPaymentMethod) {
        const returnTo = fundingReturnTo('amount')
        router.push(`/payment-methods/new?returnTo=${encodeURIComponent(returnTo)}`)
        return
      }
      setStep(2)
      return
    }
    if (!validateAmounts()) return
    if (!isSelf) setStep(3)
    else submit()
  }

  function fundingReturnTo(resume: 'amount' | 'consent'): string {
    const query = new URLSearchParams({
      productId: product.id,
      receiverId,
      resume,
      returnTo,
    })
    if (resume === 'consent') {
      query.set('goal', String(goalAmount))
      query.set('minimum', String(minAmount))
      query.set('deadline', deadline)
    }
    return `/fundings/new?${query.toString()}`
  }

  function submit(): void {
    if (!validateAmounts()) return
    startTransition(async () => {
      const result = await createFunding({
        receiverId: isSelf ? currentUserId : receiverId,
        productId: product.id,
        goalAmount,
        minAmount,
        deadline: new Date(`${deadline}T23:59:59`),
        consent: isSelf ? undefined : consent,
      })
      if (!result.ok) {
        setError(result.error.message)
        if (result.error.code === 'NO_PAYMENT_METHOD') {
          const returnTo = fundingReturnTo('consent')
          router.push(`/payment-methods/new?returnTo=${encodeURIComponent(returnTo)}`)
        }
        return
      }
      router.push(`/fundings/${result.data.fundingId}`)
    })
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      <p className="text-right text-xs font-semibold text-neutral-500">{step} / {totalSteps}</p>

      {step === 1 ? (
        <section className="flex flex-col gap-6 pt-5">
          <div>
            <h2 className="text-xl font-bold">누구에게 줄 선물인가요?</h2>
            <div className="mt-5 flex gap-7">
              <RadioOption label="나에게" name="funding-target" checked={isSelf} onChange={() => setTarget('self')} />
              <RadioOption label="친구에게" name="funding-target" checked={!isSelf} onChange={() => setTarget('friend')} />
            </div>
          </div>

          {!isSelf ? (
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-neutral-600">
              받는 사람
              <select
                value={receiverId}
                onChange={(event) => setReceiverId(event.target.value)}
                className="h-12 rounded-xl border border-neutral-200 bg-surface px-3.5 text-sm"
              >
                {friends.length === 0 ? <option value="">친구가 없습니다</option> : null}
                {friends.map((friend) => <option key={friend.userId} value={friend.userId}>{friend.displayName}</option>)}
              </select>
            </label>
          ) : null}

          <article className="flex items-center gap-4 rounded-[20px] bg-surface p-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
              {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{product.name}</p>
              <p className="mt-1 text-sm font-bold text-rose-700">{formatPrice(product.price)}</p>
            </div>
          </article>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-5 pt-5">
          <TextField id="funding-goal" label="목표 금액" inputMode="numeric" value={goal} onChange={(e) => editField(setGoal)(e.target.value)} helper={`상품 가격 ${formatPrice(product.price)}`} />
          {isSelf ? (
            <TextField id="funding-minimum" label="최소 달성 금액" value={goalAmount > 0 ? formatPrice(goalAmount) : ''} disabled helper="내가 받는 선물이라 목표를 다 채워야 성사됩니다. 목표 금액과 동일" />
          ) : (
            <TextField id="funding-minimum" label="최소 달성 금액" inputMode="numeric" value={minimum} onChange={(e) => { setMinimumEdited(true); editField(setMinimumInput)(e.target.value) }} helper="이 금액 이상이면 펀딩이 성사되고, 부족한 금액은 주최자가 부담합니다." />
          )}
          <TextField id="funding-deadline" label="마감일" type="date" min={tomorrow()} value={deadline} onChange={(e) => editField(setDeadline)(e.target.value)} error={deadlineError} />
          {goalAmount < product.price ? <p className="rounded-xl bg-warning-50 p-3 text-sm text-warning-700">목표 금액이 상품 가격보다 낮아요. 그대로 진행할 수 있어요.</p> : null}
        </section>
      ) : null}

      {step === 3 ? (
        <section className="pt-5">
          <h2 className="text-xl font-bold">시작 전 확인해주세요</h2>
          <div className="mt-5 rounded-[20px] bg-surface p-5 text-sm leading-6">
            <dl className="grid grid-cols-2 gap-y-2">
              <dt className="text-neutral-600">목표</dt><dd className="text-right font-semibold">{formatPrice(goalAmount)}</dd>
              <dt className="text-neutral-600">최소 달성 금액</dt><dd className="text-right font-semibold">{formatPrice(minAmount)}</dd>
            </dl>
            <div className="my-4 h-px bg-neutral-100" />
            {fundingConsentSentences({ receiverDisplayName: receiverName, minAmount, goalAmount, maxBurdenAmount: maxBurden }).map((sentence) => <p key={sentence}>{sentence}</p>)}
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm font-semibold">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 accent-rose-500" />
            위 내용에 동의합니다
          </label>
        </section>
      ) : null}

      {error ? <p role="alert" className="mt-4 text-sm font-semibold text-error-700">{error}</p> : null}

      <div className="mt-auto flex gap-3 pt-8">
        {step > 1 ? <Button variant="secondary" size="lg" onClick={() => { setError(null); setStep((step - 1) as 1 | 2) }}>이전</Button> : null}
        {step === 3 ? (
          <Button size="lg" disabled={!consent || isPending} onClick={submit}>{isPending ? '시작하는 중...' : '펀딩 시작하기'}</Button>
        ) : (
          <button type="button" className={buttonClasses('primary', 'lg')} onClick={advance} disabled={!isSelf && step === 1 && friends.length === 0}>{isSelf && step === 2 ? '펀딩 시작하기' : '다음'}</button>
        )}
      </div>
    </div>
  )
}
