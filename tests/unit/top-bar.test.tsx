import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/products',
  useSearchParams: () => new URLSearchParams('for=friend-1'),
}))

const { TopBar } = await import('@/components/ui/top-bar')

describe('TopBar', () => {
  it('뒤로가기와 알림 이동에 현재 경로를 보존한다', () => {
    render(<TopBar title="선물" backHref="/friends" />)

    expect(screen.getByRole('link', { name: '뒤로 가기' })).toHaveAttribute('href', '/friends')
    expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute(
      'href',
      `/notifications?returnTo=${encodeURIComponent('/products?for=friend-1')}`,
    )
  })

  it('알림 화면에서는 알림 아이콘을 숨길 수 있다', () => {
    render(<TopBar title="알림" backHref="/my" showNotifications={false} />)
    expect(screen.queryByRole('link', { name: '알림' })).not.toBeInTheDocument()
  })
})
