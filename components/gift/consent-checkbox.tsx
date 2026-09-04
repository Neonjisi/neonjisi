'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createGiftRequest } from '@/app/gifts/actions/request'
import { Button } from '@/components/ui/button'
import { isRedirectError } from '@/lib/actions/redirect-error'

type Props = {
  productId: string
  receiverId: string
}

export function ConsentCheckbox({ productId, receiverId }: Props) {
  const router = useRouter()
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(): void {
    if (!consent || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await createGiftRequest({ receiverId, productId, consent })
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        router.push(`/gifts/new/done?id=${encodeURIComponent(result.data.giftRequestId)}`)
      } catch (cause) {
        if (isRedirectError(cause)) throw cause
        console.error('[gift/consent-checkbox] 선물 요청 생성 실패', cause)
        setError('선물 요청을 보내지 못했어요. 잠시 후 다시 시도해주세요.')
      }
    })
  }

  return (
    <div className="mt-5 flex flex-1 flex-col">
      <label className="flex items-start gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 size-5 accent-rose-500"
        />
        위 내용에 동의합니다
      </label>
      {error ? <p role="alert" className="mt-4 text-sm font-semibold text-error-700">{error}</p> : null}
      <Button size="lg" className="mt-auto" disabled={!consent || isPending} onClick={submit}>
        {isPending ? '보내는 중...' : '선물 요청 보내기'}
      </Button>
    </div>
  )
}
