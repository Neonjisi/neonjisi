'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { cancelFunding } from '@/app/fundings/actions/manage'
import { Button } from '@/components/ui/button'

export function FundingDetailActions({ fundingId }: { fundingId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cancel(): void {
    if (!window.confirm('펀딩을 취소할까요? 결제된 참여금은 전액 환불됩니다.')) return
    startTransition(async () => {
      const result = await cancelFunding({ fundingId })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <button type="button" aria-expanded={isOpen} aria-label="더보기" onClick={() => setIsOpen((open) => !open)} className="grid size-10 place-items-center rounded-full text-xl text-neutral-700 active:bg-neutral-100">⋮</button>
      {isOpen ? (
        <div role="menu" aria-label="펀딩 관리" className="fixed right-3 top-12 z-30 w-40 rounded-xl border border-neutral-200 bg-surface p-1 shadow-toast">
          <button type="button" role="menuitem" className="h-10 w-full rounded-lg px-3 text-left text-sm" onClick={async () => {
            const url = window.location.href
            if (navigator.share) await navigator.share({ title: '함께 선물하기', url })
            else await navigator.clipboard.writeText(url)
            setIsOpen(false)
          }}>공유</button>
          <Button role="menuitem" variant="tertiary" size="md" className="w-full justify-start text-error-600" disabled={isPending} onClick={cancel}>펀딩 취소</Button>
        </div>
      ) : null}
      {error ? <span role="alert" className="sr-only">{error}</span> : null}
    </div>
  )
}
