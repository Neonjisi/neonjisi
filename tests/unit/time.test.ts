/**
 * 시간 표기 단위 테스트 (US3 · SCR-M2-03 · SCR-M3-02)
 *
 * 화면(Server Component)은 Vitest 로 검증하지 못하므로, 목록에 실제로 찍히는 문자열은
 * 이 순수 함수에서 판정한다. 경계(1분 · 1시간 · 하루 · 어제 · 7일)를 전부 짚는다.
 */
import { describe, expect, it } from 'vitest'
import { formatRelativeTime, formatTimeUntil } from '@/lib/format/time'

const NOW = new Date('2026-08-31T12:00:00.000Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms)
}

function later(ms: number): Date {
  return new Date(NOW.getTime() + ms)
}

describe('formatRelativeTime', () => {
  it('1분이 안 됐으면 방금 전이다', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('방금 전')
    expect(formatRelativeTime(ago(MINUTE - 1), NOW)).toBe('방금 전')
  })

  it('1분부터 1시간 전까지는 분 단위다', () => {
    expect(formatRelativeTime(ago(MINUTE), NOW)).toBe('1분 전')
    expect(formatRelativeTime(ago(3 * MINUTE), NOW)).toBe('3분 전')
    expect(formatRelativeTime(ago(HOUR - 1), NOW)).toBe('59분 전')
  })

  it('1시간부터 하루 전까지는 시간 단위다', () => {
    expect(formatRelativeTime(ago(HOUR), NOW)).toBe('1시간 전')
    expect(formatRelativeTime(ago(DAY - 1), NOW)).toBe('23시간 전')
  })

  it('하루 전은 어제, 이틀부터는 일 단위다', () => {
    expect(formatRelativeTime(ago(DAY), NOW)).toBe('어제')
    expect(formatRelativeTime(ago(2 * DAY), NOW)).toBe('2일 전')
    expect(formatRelativeTime(ago(6 * DAY), NOW)).toBe('6일 전')
  })

  it('7일부터는 날짜로 적는다 — "37일 전"은 읽히지 않는다', () => {
    // 로컬 시간대 기준으로 찍는다 — 목록에 보이는 값도 사용자의 시간대다
    const target = ago(7 * DAY)
    expect(formatRelativeTime(target, NOW)).toBe(
      `${target.getFullYear()}. ${target.getMonth() + 1}. ${target.getDate()}.`,
    )
  })

  it('미래 시각(시계 오차)은 방금 전으로 뭉갠다', () => {
    expect(formatRelativeTime(later(5 * MINUTE), NOW)).toBe('방금 전')
  })
})

describe('formatTimeUntil', () => {
  it('이미 지났으면 null 이다 — 호출부가 "만료됨"으로 갈린다', () => {
    expect(formatTimeUntil(ago(1), NOW)).toBeNull()
    expect(formatTimeUntil(NOW, NOW)).toBeNull()
  })

  it('하루가 안 남았으면 오늘이다', () => {
    expect(formatTimeUntil(later(1), NOW)).toBe('오늘')
    expect(formatTimeUntil(later(DAY - 1), NOW)).toBe('오늘')
  })

  it('하루 이상 남았으면 달력 날짜 차이로 센다', () => {
    expect(formatTimeUntil(later(DAY), NOW)).toBe('1일 후')
    expect(formatTimeUntil(later(DAY + HOUR), NOW)).toBe('1일 후')
    // 갓 발급한 링크 — 발급 + 7일 (FR-003)
    expect(formatTimeUntil(later(7 * DAY), NOW)).toBe('7일 후')
  })

  it('발급 직후에도 7일짜리 링크는 계속 "7일 후"다 — 밀리초 내림이면 1분 만에 6일로 떨어졌다', () => {
    // 링크는 NOW 에 발급돼 NOW+7일에 만료된다. 관리 화면을 1분 뒤에 열어도 발급 화면이
    // 적은 날짜(= 7일 뒤 그 날)와 같은 날을 가리켜야 한다
    const expiresAt = later(7 * DAY)
    const oneMinuteLater = new Date(NOW.getTime() + MINUTE)
    expect(formatTimeUntil(expiresAt, oneMinuteLater)).toBe('7일 후')
  })
})
