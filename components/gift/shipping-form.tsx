'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { approveGift, counterGift, type ShippingAddressInput } from '@/app/gifts/actions/respond'
import { formatPrice } from '@/components/product/product-card'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { isRedirectError } from '@/lib/actions/redirect-error'
import type { GiftDetailView } from '@/lib/dal/gift'
import type { ProductView } from '@/lib/dal/product'

export function ShippingForm({ gift, counterProduct }: { gift: GiftDetailView; counterProduct: ProductView | null }) {
  const router = useRouter()
  const [address, setAddress] = useState<ShippingAddressInput>({ recipientName: '', phone: '', address: '', addressDetail: '' })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const canSubmit = address.recipientName.trim() && address.phone.trim() && address.address.trim()

  function submit(): void {
    if (!canSubmit || isPending) return
    startTransition(async () => {
      setError(null)
      try {
        const result = counterProduct
          ? await counterGift({ giftRequestId: gift.id, counterProductId: counterProduct.id, shippingAddress: address })
          : await approveGift({ giftRequestId: gift.id, shippingAddress: address })
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        router.replace(result.data.outcome === 'PAYMENT_FAILED' ? `/gifts/${gift.id}` : `/gifts/${gift.id}/result`)
        router.refresh()
      } catch (caught) {
        if (isRedirectError(caught)) throw caught
        setError('응답을 처리하지 못했어요. 잠시 후 다시 시도해주세요.')
      }
    })
  }

  return (
    <div className="flex flex-1 flex-col px-5 pt-4">
      <h2 className="text-xl font-bold">어디로 받으시겠어요?</h2>
      {counterProduct ? (
        <div className="mt-4 rounded-[20px] bg-surface p-4 text-sm">
          <p className="font-semibold">{counterProduct.name} · {formatPrice(counterProduct.price)}</p>
          <p className="mt-2 text-neutral-600">{gift.counterpartDisplayName}님에게 다른 상품을 골랐다고 알려집니다.</p>
          <p className="mt-1 text-neutral-600">차액 {formatPrice(gift.requestedAmount - counterProduct.price)}은 청구되지 않습니다.</p>
        </div>
      ) : null}
      <div className="mt-6 flex flex-col gap-4">
        <TextField id="recipient-name" label="받는 분" value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} />
        <TextField id="recipient-phone" label="연락처" inputMode="tel" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
        <TextField id="recipient-address" label="주소" value={address.address} onChange={(e) => setAddress({ ...address, address: e.target.value })} />
        <TextField id="recipient-address-detail" label="상세 주소" value={address.addressDetail} onChange={(e) => setAddress({ ...address, addressDetail: e.target.value })} />
      </div>
      <p className="mt-4 rounded-xl bg-info-50 p-3 text-sm text-info-700">이 주소는 이 선물에만 사용됩니다.</p>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-error-700">{error}</p> : null}
      <Button size="lg" className="mt-auto" disabled={!canSubmit || isPending} onClick={submit}>{isPending ? '처리 중...' : '완료'}</Button>
    </div>
  )
}
