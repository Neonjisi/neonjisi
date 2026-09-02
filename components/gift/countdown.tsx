'use client'

import { useEffect, useState } from 'react'

const INK_THRESHOLD_SECONDS = 5 * 60
const ALARM_THRESHOLD_SECONDS = 60

type CountdownProps = {
  respondDueAt: Date | string
  serverNow: Date | string
  className?: string
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function remainingSeconds(respondDueAt: Date | string, serverNow: Date | string): number {
  return Math.max(0, Math.ceil((toTime(respondDueAt) - toTime(serverNow)) / 1_000))
}

function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')} : ${String(seconds).padStart(2, '0')}`
}

function emphasisClass(totalSeconds: number): string {
  if (totalSeconds < ALARM_THRESHOLD_SECONDS) return 'text-error-600'
  if (totalSeconds < INK_THRESHOLD_SECONDS) return 'text-neutral-900'
  return 'text-neutral-600'
}

/**
 * T020 · R8 — 여섯 화면이 공유하는 응답 기한 카운트다운.
 * 서버 시각을 기준점으로 삼아 클라이언트 시계 편차를 제거한다. 0초는 표시만 만료로
 * 전환하며, 실제 GiftRequest 상태 확정은 다음 서버 왕복의 evaluateExpiry()가 담당한다.
 */
export function GiftCountdown({ respondDueAt, serverNow, className = '' }: CountdownProps) {
  const dueAtTime = toTime(respondDueAt)
  const serverNowTime = toTime(serverNow)
  const initialSeconds = remainingSeconds(respondDueAt, serverNow)

  return (
    <RunningCountdown
      key={`${dueAtTime}:${serverNowTime}`}
      initialSeconds={initialSeconds}
      className={className}
    />
  )
}

function RunningCountdown({
  initialSeconds,
  className,
}: {
  initialSeconds: number
  className: string
}) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds)
  const [clientStartedAt] = useState(() => Date.now())

  useEffect(() => {
    if (initialSeconds === 0) return

    const intervalId = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - clientStartedAt) / 1_000)
      const nextSeconds = Math.max(0, initialSeconds - elapsedSeconds)
      setSecondsLeft(nextSeconds)
      if (nextSeconds === 0) window.clearInterval(intervalId)
    }, 1_000)
    return () => window.clearInterval(intervalId)
  }, [clientStartedAt, initialSeconds])

  if (secondsLeft === 0) {
    return (
      <span role="timer" aria-live="polite" className={`font-semibold text-error-600 ${className}`}>
        만료됨
      </span>
    )
  }

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <time
      role="timer"
      dateTime={`PT${minutes}M${seconds}S`}
      aria-label={`남은 시간 ${minutes}분 ${seconds}초`}
      className={`tabular-nums text-[30px] font-semibold leading-none ${emphasisClass(secondsLeft)} ${className}`}
    >
      {formatRemaining(secondsLeft)}
    </time>
  )
}
