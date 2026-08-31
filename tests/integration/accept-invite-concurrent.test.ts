// @vitest-environment node
/**
 * T019 — 링크 동시 사용 통합 테스트 (US1 · SC-008 · research R4 · R5)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2 `acceptInvite`
 *
 * 같은 링크를 여러 명이 동시에 써도 usedCount 가 정확히 누적되고(원자 increment),
 * 같은 쌍은 관계가 하나만 생기는지(C3 partial unique index + P2002 → ALREADY_FRIENDS)
 * 확인한다. 애플리케이션 검사(4번)는 동시 요청에서 새므로 정확성은 제약이 책임진다 —
 * 이 테스트가 그 제약이 실제로 걸렸는지의 두 번째 판정이다 (첫 번째는 T005).
 *
 * 실 DB 통합 테스트라 .env.local 이 필요하다. 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

// 동시 호출 각각에 다른 세션을 묶어야 한다. mockResolvedValueOnce 는 호출 순서에 기대므로
// AsyncLocalStorage 로 비동기 문맥마다 userId 를 실어 보낸다 — getClaims 목이 그것을 읽는다.
const h = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return { sessionUser: new AsyncLocalStorage<string>() }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () => {
        const sub = h.sessionUser.getStore()
        return sub
          ? { data: { claims: { sub } }, error: null }
          : { data: null, error: { message: '세션 없음 (테스트)' } }
      }),
    },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }
const { acceptInvite } = await import('@/app/friends/actions/accept-invite')

const DAY_MS = 24 * 60 * 60 * 1000
/** 같은 링크를 동시에 여는 인원 */
const CONCURRENT_USERS = 5
/** 경합 창이 좁아 한 번으로는 재현되지 않을 수 있다 — 라운드마다 새 사용자로 반복한다 */
const ROUNDS = 3
/** 원격 DB 왕복이 라운드당 수십 번이라 기본 5초로는 부족하다 */
const RACE_TEST_TIMEOUT = 60_000

type AcceptResult = Awaited<ReturnType<typeof acceptInvite>>

function errorCode(result: AcceptResult): string | null {
  return result.ok ? null : result.error.code
}

describe.skipIf(!hasDatabase)('acceptInvite — 동시 사용 (T019 · SC-008)', () => {
  const userIds: string[] = []

  async function createUser(label: string): Promise<{ id: string; displayName: string }> {
    const id = randomUUID()
    const displayName = `${label} ${id.slice(0, 8)}`
    await prisma.user.create({ data: { id, displayName } })
    userIds.push(id)
    return { id, displayName }
  }

  async function createLink(inviterId: string) {
    return prisma.friendInviteLink.create({
      data: {
        inviterId,
        token: `t19-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 7 * DAY_MS),
      },
    })
  }

  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
  }

  async function usedCountOf(linkId: string): Promise<number> {
    const link = await prisma.friendInviteLink.findUniqueOrThrow({ where: { id: linkId } })
    return link.usedCount
  }

  function activeFriendshipsBetween(a: string, b: string) {
    return prisma.friendship.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
    })
  }

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`
  })

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] },
    })
    await prisma.friendInviteLink.deleteMany({ where: { inviterId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })

  it(
    `같은 링크를 ${CONCURRENT_USERS}명이 동시에 열면 전원 성사되고 usedCount === ${CONCURRENT_USERS}`,
    async () => {
      const inviter = await createUser('T019 A')
      const link = await createLink(inviter.id)
      const accepters = await Promise.all(
        Array.from({ length: CONCURRENT_USERS }, (_, i) => createUser(`T019 U${i}`)),
      )

      const results = await Promise.all(
        accepters.map((u) => as(u.id, () => acceptInvite({ token: link.token }))),
      )

      // 다회용 — 전부 성사된다 (FR-002)
      expect(results.map(errorCode)).toEqual(Array(CONCURRENT_USERS).fill(null))
      for (const result of results) {
        expect(result).toEqual({ ok: true, data: { friendUserId: inviter.id } })
      }

      // 관계 N행, 상대가 전부 다르다 — 중복 0
      const friendships = await prisma.friendship.findMany({
        where: { requesterId: inviter.id, status: 'ACTIVE' },
      })
      expect(friendships).toHaveLength(CONCURRENT_USERS)
      expect(new Set(friendships.map((f) => f.addresseeId)).size).toBe(CONCURRENT_USERS)
      expect(friendships.every((f) => f.inviteLinkId === link.id)).toBe(true)

      // usedCount — 원자 increment 라 lost update 가 없다 (R5)
      expect(await usedCountOf(link.id)).toBe(CONCURRENT_USERS)

      // 알림 — 성사 N건에 N건, 누락 0 (SC-009)
      const notifications = await prisma.notification.findMany({ where: { userId: inviter.id } })
      expect(notifications).toHaveLength(CONCURRENT_USERS)
      const notifiedFriendIds = new Set(
        notifications.map((n) => (n.payload as { friendUserId: string }).friendUserId),
      )
      expect(notifiedFriendIds).toEqual(new Set(accepters.map((u) => u.id)))
    },
    RACE_TEST_TIMEOUT,
  )

  it(
    '같은 사람이 같은 링크를 동시에 두 번 열면 관계 1행 · 한쪽 ALREADY_FRIENDS · usedCount 는 1만 오른다',
    async () => {
      const inviter = await createUser('T019 A')
      const link = await createLink(inviter.id)

      for (let round = 0; round < ROUNDS; round++) {
        const accepter = await createUser(`T019 B${round}`)

        const results = await Promise.all([
          as(accepter.id, () => acceptInvite({ token: link.token })),
          as(accepter.id, () => acceptInvite({ token: link.token })),
        ])

        expect(results.map(errorCode).sort(), `round ${round}`).toEqual([
          'ALREADY_FRIENDS',
          null,
        ])
        expect(
          await activeFriendshipsBetween(inviter.id, accepter.id),
          `round ${round}: 관계`,
        ).toHaveLength(1)
        // 실패한 쪽의 increment 는 롤백돼 라운드마다 정확히 1만 오른다
        expect(await usedCountOf(link.id), `round ${round}: usedCount`).toBe(round + 1)
        expect(
          await prisma.notification.count({
            where: { userId: inviter.id, payload: { path: ['friendUserId'], equals: accepter.id } },
          }),
          `round ${round}: 알림`,
        ).toBe(1)
      }
    },
    RACE_TEST_TIMEOUT,
  )

  it(
    '두 사람이 서로의 링크를 동시에 열면 관계는 한 쌍당 하나만 생긴다 (spec Edge Case)',
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const a = await createUser(`T019 A${round}`)
        const b = await createUser(`T019 B${round}`)
        const linkA = await createLink(a.id)
        const linkB = await createLink(b.id)

        const results = await Promise.all([
          as(a.id, () => acceptInvite({ token: linkB.token })),
          as(b.id, () => acceptInvite({ token: linkA.token })),
        ])

        // 한쪽만 성사, 다른 쪽은 ALREADY_FRIENDS — 검사에서 걸리든 P2002 에서 걸리든 같다
        expect(results.map(errorCode).sort(), `round ${round}`).toEqual([
          'ALREADY_FRIENDS',
          null,
        ])
        expect(await activeFriendshipsBetween(a.id, b.id), `round ${round}: 관계`).toHaveLength(1)

        // 성사된 쪽의 링크만 1 오른다 — 합이 1
        const counts = [await usedCountOf(linkA.id), await usedCountOf(linkB.id)]
        expect(counts[0] + counts[1], `round ${round}: usedCount 합`).toBe(1)

        // 알림도 성사 1건에 1건 — 둘 중 한 명에게만
        const notificationCount = await prisma.notification.count({
          where: { userId: { in: [a.id, b.id] } },
        })
        expect(notificationCount, `round ${round}: 알림`).toBe(1)
      }
    },
    RACE_TEST_TIMEOUT,
  )
})
