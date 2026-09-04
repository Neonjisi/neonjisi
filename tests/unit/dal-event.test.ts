// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  verifySession: vi.fn(),
  friendshipFindMany: vi.fn(),
  friendshipFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
  eventCreate: vi.fn(),
  eventUpdateMany: vi.fn(),
  eventDeleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    friendship: { findMany: h.friendshipFindMany, findFirst: h.friendshipFindFirst },
    event: {
      findMany: h.eventFindMany,
      create: h.eventCreate,
      updateMany: h.eventUpdateMany,
      deleteMany: h.eventDeleteMany,
    },
  },
}))
vi.mock('@/lib/dal/session', () => ({ verifySession: h.verifySession }))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}))

import { createMyEvent, deleteMyEvent, getFriendEvents, getUpcomingEvents, updateMyEvent } from '@/lib/dal/event'

const ME = '0b9f8a1e-1111-4222-8333-444455556666'
const FRIEND = '9f9f9f9f-2222-4333-8444-555566667777'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))
  h.verifySession.mockResolvedValue({ userId: ME })
  h.friendshipFindMany.mockResolvedValue([])
  h.eventFindMany.mockResolvedValue([])
})

afterEach(() => vi.useRealTimers())

describe('일정 조회', () => {
  it('활성 친구와 내 일정만 조회하고 다음 발생일 순으로 정렬한다', async () => {
    h.friendshipFindMany.mockResolvedValue([{ requesterId: ME, addresseeId: FRIEND }])
    h.eventFindMany.mockResolvedValue([
      { id: 'mine', userId: ME, type: 'CUSTOM', title: '내 일정', date: new Date('2026-10-01'), isRecurring: false, user: { displayName: '나' } },
      { id: 'friend', userId: FRIEND, type: 'BIRTHDAY', title: '생일', date: new Date('2000-09-10'), isRecurring: true, user: { displayName: '친구' } },
    ])

    const events = await getUpcomingEvents()

    expect(h.eventFindMany.mock.calls[0][0].where.userId.in).toEqual([ME, FRIEND])
    expect(events.map((event) => event.id)).toEqual(['friend', 'mine'])
    expect(events[0].nextDate.toISOString()).toBe('2026-09-10T00:00:00.000Z')
  })

  it('반복 일정이 올해 지났으면 다음 해 같은 월·일로 계산한다', async () => {
    h.eventFindMany.mockResolvedValue([
      { id: 'birthday', userId: ME, type: 'BIRTHDAY', title: '생일', date: new Date('2000-01-02'), isRecurring: true, user: { displayName: '나' } },
    ])

    const [event] = await getUpcomingEvents()
    expect(event.nextDate.toISOString()).toBe('2027-01-02T00:00:00.000Z')
  })

  it('활성 친구가 아니면 친구 일정을 읽지 않는다', async () => {
    h.friendshipFindFirst.mockResolvedValue(null)
    expect(await getFriendEvents(FRIEND)).toEqual([])
    expect(h.eventFindMany).not.toHaveBeenCalled()
  })
})

describe('일정 변경 인가', () => {
  it('생성 시 세션 사용자 id를 강제한다', async () => {
    h.eventCreate.mockResolvedValue({ id: 'event-id' })
    await createMyEvent({ type: 'CUSTOM', title: '기념일', date: new Date('2026-10-01'), isRecurring: false })
    expect(h.eventCreate.mock.calls[0][0].data.userId).toBe(ME)
  })

  it('수정과 삭제는 세션 사용자 소유 행만 대상으로 한다', async () => {
    h.eventUpdateMany.mockResolvedValue({ count: 1 })
    h.eventDeleteMany.mockResolvedValue({ count: 1 })
    const data = { type: 'CUSTOM' as const, title: '기념일', date: new Date('2026-10-01'), isRecurring: false }
    expect(await updateMyEvent('event-id', data)).toBe(true)
    expect(await deleteMyEvent('event-id')).toBe(true)
    expect(h.eventUpdateMany.mock.calls[0][0].where).toEqual({ id: 'event-id', userId: ME })
    expect(h.eventDeleteMany.mock.calls[0][0].where).toEqual({ id: 'event-id', userId: ME })
  })
})
