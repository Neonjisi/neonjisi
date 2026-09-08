import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }))

const { HomeNotificationSync } = await import('@/components/notification/home-notification-sync')

describe('HomeNotificationSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('새 알림이 확인되면 홈 서버 컴포넌트를 다시 렌더링한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unreadCount: 2, latestNotificationId: 'new-notification' }),
    }))

    render(<HomeNotificationSync initialIndicator={{ unreadCount: 1, latestNotificationId: 'old-notification' }} />)
    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(h.refresh).toHaveBeenCalledOnce()
  })

  it('알림 상태가 같으면 불필요하게 홈을 다시 렌더링하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unreadCount: 1, latestNotificationId: 'same-notification' }),
    }))

    render(<HomeNotificationSync initialIndicator={{ unreadCount: 1, latestNotificationId: 'same-notification' }} />)
    await act(async () => {
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(h.refresh).not.toHaveBeenCalled()
  })
})
