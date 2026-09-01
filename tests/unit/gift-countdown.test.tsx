import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GiftCountdown } from '@/components/gift/countdown'

const CLIENT_NOW = new Date('2026-09-01T03:00:00.000Z')

describe('GiftCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(CLIENT_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('클라이언트 시계가 달라도 serverNow 기준으로 남은 시간을 표시한다', () => {
    render(
      <GiftCountdown
        serverNow="2026-09-01T05:00:00.000Z"
        respondDueAt="2026-09-01T05:02:00.000Z"
      />,
    )

    expect(screen.getByRole('timer', { name: '남은 시간 2분 0초' })).toHaveTextContent('02 : 00')
  })

  it('5분 미만은 본문색, 1분 미만은 경보색으로 단계적으로 강조한다', () => {
    const { rerender } = render(
      <GiftCountdown serverNow={CLIENT_NOW} respondDueAt={new Date(CLIENT_NOW.getTime() + 299_000)} />,
    )
    expect(screen.getByRole('timer')).toHaveClass('text-neutral-900')

    rerender(
      <GiftCountdown serverNow={CLIENT_NOW} respondDueAt={new Date(CLIENT_NOW.getTime() + 59_000)} />,
    )
    expect(screen.getByRole('timer')).toHaveClass('text-error-600')
  })

  it('1초마다 줄어들고 0초가 되면 만료 표시로 전환한다', () => {
    render(
      <GiftCountdown serverNow={CLIENT_NOW} respondDueAt={new Date(CLIENT_NOW.getTime() + 2_000)} />,
    )

    expect(screen.getByRole('timer')).toHaveTextContent('00 : 02')
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('timer')).toHaveTextContent('00 : 01')
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('timer')).toHaveTextContent('만료됨')
  })
})
