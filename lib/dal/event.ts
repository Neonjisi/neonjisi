import { cache } from 'react'
import type { EventType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'

export type EventView = {
  id: string
  userId: string
  ownerDisplayName: string
  type: EventType
  title: string
  date: Date
  isRecurring: boolean
  nextDate: Date
  isMine: boolean
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function nextOccurrence(date: Date, recurring: boolean, today: Date): Date | null {
  if (!recurring) return date >= today ? date : null
  let next = new Date(Date.UTC(today.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  if (next < today) next = new Date(Date.UTC(today.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()))
  return next
}

async function eventsForUserIds(viewerId: string, userIds: string[]): Promise<EventView[]> {
  const today = startOfToday()
  const rows = await prisma.event.findMany({
    where: { userId: { in: userIds } },
    include: { user: { select: { displayName: true } } },
  })
  return rows.flatMap((row) => {
    const nextDate = nextOccurrence(row.date, row.isRecurring, today)
    return nextDate ? [{ ...row, ownerDisplayName: row.user.displayName, nextDate, isMine: row.userId === viewerId }] : []
  }).sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
}

export const getMyEvents = cache(async (): Promise<EventView[]> => {
  const { userId } = await verifySession()
  return eventsForUserIds(userId, [userId])
})

export const getUpcomingEvents = cache(async (): Promise<EventView[]> => {
  const { userId } = await verifySession()
  const friendships = await prisma.friendship.findMany({
    where: { status: 'ACTIVE', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  })
  const friendIds = friendships.map((row) => row.requesterId === userId ? row.addresseeId : row.requesterId)
  return eventsForUserIds(userId, [userId, ...friendIds])
})

export const getFriendEvents = cache(async (friendUserId: string): Promise<EventView[]> => {
  const { userId } = await verifySession()
  const friendship = await prisma.friendship.findFirst({
    where: { status: 'ACTIVE', OR: [{ requesterId: userId, addresseeId: friendUserId }, { requesterId: friendUserId, addresseeId: userId }] },
    select: { id: true },
  })
  if (!friendship) return []
  return eventsForUserIds(userId, [friendUserId])
})

export async function createMyEvent(data: { type: EventType; title: string; date: Date; isRecurring: boolean }): Promise<string> {
  const { userId } = await verifySession()
  const event = await prisma.event.create({ data: { ...data, userId }, select: { id: true } })
  return event.id
}

export async function updateMyEvent(id: string, data: { type: EventType; title: string; date: Date; isRecurring: boolean }): Promise<boolean> {
  const { userId } = await verifySession()
  return (await prisma.event.updateMany({ where: { id, userId }, data })).count === 1
}

export async function deleteMyEvent(id: string): Promise<boolean> {
  const { userId } = await verifySession()
  return (await prisma.event.deleteMany({ where: { id, userId } })).count === 1
}
