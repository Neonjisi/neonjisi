import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GiftHistorySection } from '@/components/gift/gift-history-section'
import type { GiftListItem } from '@/lib/dal/gift'

const changedGift: GiftListItem = {
  id: 'gift-1',
  role: 'receiver',
  status: 'PAID',
  resolution: 'COUNTERED',
  isOngoing: false,
  productSnapshot: { name: '기존 머그컵', imageUrl: null, price: 32_000 },
  counterProductSnapshot: { name: '변경한 립밤', imageUrl: null, price: 15_000 },
  requestedAmount: 32_000,
  finalAmount: 15_000,
  counterpartDisplayName: '김민수',
  respondDueAt: new Date('2026-09-09T00:00:00Z'),
  serverNow: new Date('2026-09-08T00:00:00Z'),
  createdAt: new Date('2026-09-08T00:00:00Z'),
}

describe('선물 내역', () => {
  it.each(['receiver', 'giver'] as const)('%s 내역에서 기존 선택 선물과 변경한 선물을 모두 표시한다', (role) => {
    const returnTo = role === 'receiver' ? '/my/gifts?tab=received' : '/my/gifts'
    render(<GiftHistorySection title="지난 선물" gifts={[{ ...changedGift, role }]} returnTo={returnTo} />)

    const giftLink = screen.getByRole('link', { name: /김민수님과의 선물/ })
    expect(within(giftLink).getByText('기존 선택 선물')).toBeInTheDocument()
    expect(within(giftLink).getByText('기존 머그컵')).toBeInTheDocument()
    expect(within(giftLink).getByText('변경한 선물')).toBeInTheDocument()
    expect(within(giftLink).getByText('변경한 립밤')).toBeInTheDocument()
    expect(giftLink).toHaveAttribute('href', `/gifts/gift-1?returnTo=${encodeURIComponent(returnTo)}`)
  })
})
