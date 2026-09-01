// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  verifySession: vi.fn(),
  friendshipFindFirst: vi.fn(),
  friendshipFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  tasteItemFindMany: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
}))

vi.mock('@/lib/prisma', () => ({ prisma: {
  friendship: { findFirst: h.friendshipFindFirst, findMany: h.friendshipFindMany },
  user: { findUnique: h.userFindUnique },
  tasteItem: { findMany: h.tasteItemFindMany },
} }))
vi.mock('@/lib/dal/session', () => ({ verifySession: h.verifySession }))
vi.mock('next/navigation', () => ({ notFound: h.notFound }))
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()), cache: <T,>(fn: T) => fn,
}))

import { getFriendTaste, getFriends, getRepresentativeTags, requireActiveFriendship } from '@/lib/dal/friend'

const ME = '11111111-1111-4111-8111-111111111111'
const FRIEND = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  h.verifySession.mockResolvedValue({ userId: ME })
})

describe('친구 DAL 접근 제어', () => {
  it('양방향 활성 관계를 찾고 friendshipId만 반환한다', async () => {
    h.friendshipFindFirst.mockResolvedValue({ id: 'friendship-1' })
    await expect(requireActiveFriendship(FRIEND)).resolves.toEqual({ friendshipId: 'friendship-1' })
    expect(h.friendshipFindFirst.mock.calls[0][0].where).toEqual({
      status: 'ACTIVE',
      OR: [
        { requesterId: ME, addresseeId: FRIEND },
        { requesterId: FRIEND, addresseeId: ME },
      ],
    })
  })

  it('활성 관계가 없으면 notFound로 차단한다', async () => {
    h.friendshipFindFirst.mockResolvedValue(null)
    await expect(requireActiveFriendship(FRIEND)).rejects.toThrow('NOT_FOUND')
  })

  it('친구 취향 조회 전에 접근 제어를 통과하고 세 종류를 묶는다', async () => {
    h.friendshipFindFirst.mockResolvedValue({ id: 'friendship-1' })
    h.userFindUnique.mockResolvedValue({
      id: FRIEND, displayName: '친구', avatarUrl: null,
      tasteProfile: { description: '산미 있는 커피를 좋아해요', items: [
        { id: 'a', kind: 'WANT', categoryId: 'c1', detail: null, category: { name: '커피' } },
        { id: 'b', kind: 'HAVE', categoryId: 'c2', detail: '검정색', category: { name: '텀블러' } },
      ] },
    })
    const result = await getFriendTaste(FRIEND)
    expect(result.itemsByKind.WANT[0].categoryName).toBe('커피')
    expect(result.itemsByKind.HAVE[0].detail).toBe('검정색')
    expect(result.itemsByKind.UNWANTED).toEqual([])
    expect(h.friendshipFindFirst.mock.invocationCallOrder[0]).toBeLessThan(h.userFindUnique.mock.invocationCallOrder[0])
  })
})

describe('친구 목록과 대표 태그', () => {
  it('대표 태그는 WANT 최근 3건 쿼리 결과 순서를 유지한다', async () => {
    h.tasteItemFindMany.mockResolvedValue([
      { category: { name: '커피' } }, { category: { name: '캠핑' } }, { category: { name: '러닝' } },
    ])
    await expect(getRepresentativeTags(FRIEND)).resolves.toEqual(['커피', '캠핑', '러닝'])
    expect(h.tasteItemFindMany.mock.calls[0][0]).toMatchObject({ where: { profile: { userId: FRIEND }, kind: 'WANT' }, take: 3 })
  })

  it('양쪽 방향의 상대를 고르고 목록과 태그를 한 쿼리에서 조립한다', async () => {
    const me = { id: ME, displayName: '나', avatarUrl: null, tasteProfile: null }
    const friend = { id: FRIEND, displayName: '친구', avatarUrl: null, tasteProfile: { items: [{ category: { name: '향수' } }] } }
    h.friendshipFindMany.mockResolvedValue([{ requesterId: ME, requester: me, addressee: friend }])
    await expect(getFriends()).resolves.toEqual([{ userId: FRIEND, displayName: '친구', avatarUrl: null, tags: ['향수'] }])
    expect(h.friendshipFindMany).toHaveBeenCalledTimes(1)
  })
})
