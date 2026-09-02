import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'

export type MyProfileSummary = {
  displayName: string
  avatarUrl: string | null
  tasteCount: number
  friendCount: number
  isOnboarded: boolean
}

export const getMyProfileSummary = cache(async (): Promise<MyProfileSummary> => {
  const { userId } = await verifySession()
  const [user, tasteCount, friendCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        displayName: true,
        avatarUrl: true,
        tasteProfile: { select: { onboardedAt: true } },
      },
    }),
    prisma.tasteItem.count({ where: { profile: { userId } } }),
    prisma.friendship.count({
      where: {
        status: 'ACTIVE',
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
    }),
  ])

  return {
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    tasteCount,
    friendCount,
    isOnboarded: Boolean(user.tasteProfile?.onboardedAt),
  }
})

export async function setMyDisplayName(userId: string, displayName: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { displayName } })
}
