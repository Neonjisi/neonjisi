'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationIndicator } from '@/lib/dal/notification'

const POLL_INTERVAL_MS = 10_000

export function HomeNotificationSync({ initialIndicator }: { initialIndicator: NotificationIndicator }) {
  const router = useRouter()
  const indicatorRef = useRef(initialIndicator)

  useEffect(() => {
    const controller = new AbortController()
    let checking = false

    async function checkForNotifications() {
      if (checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const response = await fetch('/api/notifications/indicator', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const next = (await response.json()) as NotificationIndicator
        const current = indicatorRef.current
        if (
          next.unreadCount !== current.unreadCount ||
          next.latestNotificationId !== current.latestNotificationId
        ) {
          indicatorRef.current = next
          router.refresh()
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('[home-notification-sync] 알림 확인 실패', error)
        }
      } finally {
        checking = false
      }
    }

    const intervalId = window.setInterval(checkForNotifications, POLL_INTERVAL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkForNotifications()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', checkForNotifications)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', checkForNotifications)
    }
  }, [router])

  return null
}
