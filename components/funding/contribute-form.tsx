'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { contributeToFunding, type ContributeOutcome } from '@/app/fundings/actions/contribute'
import { formatPrice } from '@/components/product/product-card'
import { Button, buttonClasses } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

export function FundingContributeForm({
  fundingId,
  receiverDisplayName,
  productName,
  remaining,
  minAmount,
  cardLabel,
}: {
  fundingId: string
  receiverDisplayName: string
  productName: string
  remaining: number
  /** 최소 달성 금액 — 환불 고지에 숫자로 박는다 (FR-010 · copy.md §2②) */
  minAmount: number
  cardLabel: string
}) {
  const [amount, setAmount] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ amount: number; outcome: ContributeOutcome } | null>(null)
  const numericAmount = Number(amount)
  const overRemaining = numericAmount > remaining
  const valid = Number.isInteger(numericAmount) && numericAmount > 0 && !overRemaining
  const chips = [20_000, 50_000, remaining].filter((value, index, values) => value <= remaining && values.indexOf(value) === index)

  if (result) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center px-5 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-success-50 text-3xl text-success-700">✓</div>
        <h2 className="mt-5 text-xl font-bold">{result.outcome === 'GOAL_REACHED' ? '목표를 채웠어요' : '참여가 완료됐어요'}</h2>
        <p className="mt-2 text-2xl font-extrabold text-rose-700">{formatPrice(result.amount)}</p>
        <p className="mt-4 text-sm text-neutral-600">{receiverDisplayName}님 선물 · {productName}</p>
        <Link href={`/fundings/${fundingId}`} className={buttonClasses('primary', 'lg', 'mt-8')}>펀딩 보기</Link>
      </section>
    )
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-6 pt-5">
      <h2 className="text-xl font-bold">얼마나 보태시겠어요?</h2>
      <div className="mt-6">
        <TextField id="contribution-amount" label="참여 금액" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))} error={overRemaining ? `남은 금액은 ${formatPrice(remaining)}이에요` : undefined} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => <button key={chip} type="button" onClick={() => setAmount(String(chip))} className="rounded-full border border-neutral-200 bg-surface px-4 py-2 text-sm font-semibold">{chip === remaining ? `${formatPrice(chip)} 전액` : formatPrice(chip)}</button>)}
      </div>
      <div className="mt-4 flex items-center justify-between p-1">
        <span className="text-base font-semibold text-neutral-900">남은 금액</span>
        <strong className="text-xl font-bold text-neutral-900">{formatPrice(remaining)}</strong>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <p className="py-1 text-sm text-info-700">참여 금액은 {receiverDisplayName}님과 주최자에게만 공개됩니다.</p>
        <p className="py-1 text-sm text-warning-700">모인 금액이 최소 달성 금액({formatPrice(minAmount)})에 못 미치면 전액 환불됩니다.</p>
      </div>
      <p className="mt-5 text-sm">결제수단 <strong>{cardLabel}</strong> <Link href={`/payment-methods?returnTo=${encodeURIComponent(`/fundings/${fundingId}/contribute`)}`} className="ml-2 text-rose-700">변경</Link></p>
      {error ? <p role="alert" className="mt-4 text-sm font-semibold text-error-700">{error}</p> : null}
      <div className="mt-auto pt-8">
        <Button
          size="lg"
          disabled={!valid || isPending}
          onClick={() => startTransition(async () => {
            setError(null)
            const response = await contributeToFunding({ fundingId, amount: numericAmount })
            if (!response.ok) {
              setError(response.error.message)
              return
            }
            setResult({ amount: numericAmount, outcome: response.data.outcome })
          })}
        >
          {isPending ? '결제하고 있어요' : '결제하고 참여하기'}
        </Button>
      </div>
    </div>
  )
}
