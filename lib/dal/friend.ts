import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { TasteKind } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'
import type { TasteItemView, TasteItemsByKind } from '@/lib/dal/taste'

export type FriendListItem = {
  userId: string
  displayName: string
  avatarUrl: string | null
  tags: string[]
}

export type FriendTasteView = {
  userId: string
  displayName: string
  avatarUrl: string | null
  description: string | null
  itemsByKind: TasteItemsByKind
}

/** WANT 항목의 최근 카테고리명 최대 3건. 공개 미리보기와 친구 목록이 같은 규칙을 쓴다. */
export const getRepresentativeTags = cache(async (userId: string): Promise<string[]> => {
  const items = await prisma.tasteItem.findMany({
    where: { profile: { userId }, kind: 'WANT' },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { category: { select: { name: true } } },
  })
  return items.map((item) => item.category.name)
})

/** 친구 취향을 읽는 모든 경로의 단일 접근 제어 관문. */
export const requireActiveFriendship = cache(
  async (friendUserId: string): Promise<{ friendshipId: string }> => {
    const { userId } = await verifySession()
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { requesterId: userId, addresseeId: friendUserId },
          { requesterId: friendUserId, addresseeId: userId },
        ],
      },
      select: { id: true },
    })
    if (!friendship) notFound()
    return { friendshipId: friendship.id }
  },
)

/** 활성 친구와 대표 태그를 한 쿼리로 가져온다. */
export const getFriends = cache(async (): Promise<FriendListItem[]> => {
  const { userId } = await verifySession()
  const friendships = await prisma.friendship.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    orderBy: { acceptedAt: 'desc' },
    select: {
      requesterId: true,
      requester: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          tasteProfile: {
            select: {
              items: {
                where: { kind: 'WANT' },
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: { category: { select: { name: true } } },
              },
            },
          },
        },
      },
      addressee: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          tasteProfile: {
            select: {
              items: {
                where: { kind: 'WANT' },
                orderBy: { createdAt: 'desc' },
                take: 3,
                select: { category: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  })

  return friendships.map((friendship) => {
    const friend = friendship.requesterId === userId ? friendship.addressee : friendship.requester
    return {
      userId: friend.id,
      displayName: friend.displayName,
      avatarUrl: friend.avatarUrl,
      tags: (friend.tasteProfile?.items ?? []).map((item) => item.category.name),
    }
  })
})

export const getFriendTaste = cache(async (friendUserId: string): Promise<FriendTasteView> => {
  await requireActiveFriendship(friendUserId)
  const friend = await prisma.user.findUnique({
    where: { id: friendUserId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      tasteProfile: {
        select: {
          description: true,
          items: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              kind: true,
              categoryId: true,
              detail: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  })
  if (!friend) notFound()

  const grouped: TasteItemsByKind = { WANT: [], HAVE: [], UNWANTED: [] }
  for (const item of friend.tasteProfile?.items ?? []) {
    const view: TasteItemView = {
      id: item.id,
      kind: item.kind as TasteKind,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      detail: item.detail,
    }
    grouped[item.kind].push(view)
  }

  return {
    userId: friend.id,
    displayName: friend.displayName,
    avatarUrl: friend.avatarUrl,
    description: friend.tasteProfile?.description ?? null,
    itemsByKind: grouped,
  }
})
