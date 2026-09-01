// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

const h = vi.hoisted(() => ({ getClaims: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims } })),
}))

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }
const { getFriendTaste } = await import('@/lib/dal/friend')

function actAs(userId: string) {
  h.getClaims.mockResolvedValue({ data: { claims: { sub: userId, email: `${userId}@example.com` } }, error: null })
}

async function expectDenied(userId: string, friendUserId: string) {
  actAs(userId)
  await expect(getFriendTaste(friendUserId)).rejects.toMatchObject({
    digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404'),
  })
}

describe.skipIf(!hasDatabase)('친구 취향 접근 제어 (T031)', () => {
  const viewerId = randomUUID()
  const friendId = randomUUID()
  const strangerId = randomUUID()
  let friendshipId: string

  beforeAll(async () => {
    const category = await prisma.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
    await prisma.user.createMany({ data: [
      { id: viewerId, displayName: '접근자' },
      { id: friendId, displayName: '친구' },
      { id: strangerId, displayName: '낯선 사람' },
    ] })
    const profile = await prisma.tasteProfile.create({ data: { userId: friendId, description: '친구만 볼 수 있는 서술' } })
    await prisma.tasteItem.create({ data: { profileId: profile.id, kind: 'WANT', categoryId: category.id, detail: '친구만 볼 수 있는 상세' } })
    const friendship = await prisma.friendship.create({ data: { requesterId: viewerId, addresseeId: friendId } })
    friendshipId = friendship.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [viewerId, friendId, strangerId] } } })
    await prisma.$disconnect()
  })

  it('활성 친구에게는 세 종류 구조와 서술을 반환한다', async () => {
    actAs(viewerId)
    const taste = await getFriendTaste(friendId)
    expect(taste.description).toBe('친구만 볼 수 있는 서술')
    expect(taste.itemsByKind.WANT[0].detail).toBe('친구만 볼 수 있는 상세')
  })

  it('친구가 아닌 사용자는 직접 userId를 알아도 접근할 수 없다', async () => {
    await expectDenied(strangerId, friendId)
  })

  it('해제된 관계는 양방향 모두 접근할 수 없다', async () => {
    await prisma.friendship.update({ where: { id: friendshipId }, data: { status: 'REMOVED', removedAt: new Date(), removedBy: viewerId } })
    await expectDenied(viewerId, friendId)
    await expectDenied(friendId, viewerId)
  })
})
