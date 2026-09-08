'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'

export function HeaderNotificationLink() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const returnTo = `${pathname}${query ? `?${query}` : ''}`

  return (
    <Link
      href={`/notifications?returnTo=${encodeURIComponent(returnTo)}`}
      aria-label="알림"
      className="grid size-10 shrink-0 place-items-center rounded-full text-neutral-900 active:bg-neutral-100"
    >
      <Bell size={22} aria-hidden />
    </Link>
  )
}
