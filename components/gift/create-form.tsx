'use client'

import Image from 'next/image'
import Link from 'next/link'
import { CircleCheck } from 'lucide-react'
import { useState, useTransition } from 'react'
import { createGiftRequest } from '@/app/gifts/actions/request'
import { FriendAvatar } from '@/components/friend/avatar'
import { GiftCountdown } from '@/components/gift/countdown'
import { formatPrice } from '@/components/product/product-card'
import { Button, buttonClasses } from '@/components/ui/button'
import { isRedirectError } from '@/lib/actions/redirect-error'
import { consentSentences } from '@/lib/gift/consent'
import type { FriendTasteView } from '@/lib/dal/friend'
import type { PaymentMethodView } from '@/lib/dal/payment-method'
import type { ProductView } from '@/lib/dal/product'

type Props = {
  product: ProductView
  receiver: FriendTasteView
  paymentMethod: PaymentMethodView
}

type SentRequest = { giftRequestId: string; respondDueAt: Date; serverNow: Date }

export function GiftCreateForm({ product, receiver, paymentMethod }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [consent, setConsent] = useState(false)
  const [sentRequest, setSentRequest] = useState<SentRequest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(): void {
    if (!consent || isPending) return
    setError(null)
    startTransition(async () => {
      const result = await callCreateGiftRequest({
        receiverId: receiver.userId,
        productId: product.id,
        consent,
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setSentRequest(result.data)
    })
  }

  if (sentRequest) {
    return (
      <div className="flex flex-1 flex-col items-center px-5 pb-4 pt-16 text-center">
        <CircleCheck size={48} className="text-success-600" aria-hidden />
        <h2 className="mt-5 text-xl font-bold">요청을 보냈습니다</h2>
        <p className="mt-2 text-sm text-neutral-600">
          {receiver.displayName}님이 확인하면 자동으로 결제됩니다.
        </p>
        <p className="mt-10 text-sm font-semibold text-neutral-600">남은 시간</p>
        <GiftCountdown respondDueAt={sentRequest.respondDueAt} serverNow={sentRequest.serverNow} className="mt-3" />
        <Link href="/" className={buttonClasses('primary', 'lg', 'mt-auto')}>홈으로</Link>
      </div>
    )
  }

  const returnTo = `/gifts/new?productId=${encodeURIComponent(product.id)}&receiverId=${encodeURIComponent(receiver.userId)}`

  return (
    <div className="flex flex-1 flex-col px-5">
      <p className="text-right text-xs font-semibold text-neutral-500">{step} / 2</p>
      {step === 1 ? (
        <section className="pt-5">
          <h2 className="text-xl font-bold">선물 요청을 확인해주세요</h2>
          <div className="mt-5 flex items-center gap-3 rounded-[20px] bg-surface p-4">
            <FriendAvatar name={receiver.displayName} avatarUrl={receiver.avatarUrl} />
            <div><p className="text-xs text-neutral-500">받는 사람</p><p className="font-semibold">{receiver.displayName}</p></div>
          </div>
          <article className="mt-3 flex items-center gap-4 rounded-[20px] bg-surface p-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
              {product.imageUrl ? <Image src={product.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : null}
            </div>
            <div className="min-w-0"><p className="truncate font-semibold">{product.name}</p><p className="mt-1 font-bold text-rose-700">{formatPrice(product.price)}</p></div>
          </article>
          <div className="mt-5 rounded-[20px] bg-surface p-4 text-sm">
            <div className="flex justify-between gap-3"><span className="text-neutral-600">결제수단</span><span className="font-semibold">{paymentMethod.cardBrand} **** {paymentMethod.cardLast4}</span></div>
            <Link href={`/payment-methods?returnTo=${encodeURIComponent(returnTo)}`} className="mt-2 block text-right text-sm font-semibold text-rose-700">변경</Link>
            <div className="my-3 h-px bg-neutral-100" />
            <div className="flex justify-between"><span className="text-neutral-600">결제 금액</span><strong>{formatPrice(product.price)}</strong></div>
          </div>
          <p className="mt-4 text-sm text-neutral-600">{receiver.displayName}님이 5분 안에 확인하면 결제됩니다.</p>
        </section>
      ) : (
        <section className="pt-5">
          <h2 className="text-xl font-bold">결제 전 확인해주세요</h2>
          <div className="mt-5 rounded-[20px] bg-surface p-5 text-sm leading-6">
            {consentSentences({ receiverDisplayName: receiver.displayName, requestedAmount: product.price }).map((sentence) => <p key={sentence}>{sentence}</p>)}
          </div>
          <label className="mt-5 flex items-start gap-3 text-sm font-semibold">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-5 accent-rose-500" />
            위 내용에 동의합니다
          </label>
        </section>
      )}
      {error ? <p role="alert" className="mt-4 text-sm font-semibold text-error-700">{error}</p> : null}
      <div className="mt-auto flex gap-3 pt-8">
        {step === 2 ? <Button variant="secondary" size="lg" onClick={() => setStep(1)}>이전</Button> : null}
        {step === 1
          ? <Button size="lg" onClick={() => setStep(2)}>다음</Button>
          : <Button size="lg" disabled={!consent || isPending} onClick={submit}>{isPending ? '보내는 중...' : '선물 요청 보내기'}</Button>}
      </div>
    </div>
  )
}

async function callCreateGiftRequest(input: {
  receiverId: string
  productId: string
  consent: boolean
}): Promise<Awaited<ReturnType<typeof createGiftRequest>>> {
  try {
    return await createGiftRequest(input)
  } catch (error) {
    if (isRedirectError(error)) throw error
    console.error('[gift/create-form] 선물 요청 생성 실패', error)
    return {
      ok: false,
      error: { code: 'STORAGE_FAILED', message: '선물 요청을 보내지 못했어요. 잠시 후 다시 시도해주세요.' },
    }
  }
}
