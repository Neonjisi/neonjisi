// @vitest-environment node
/**
 * T040 — 알림 통합 테스트 (US3 · FR-017 · FR-028~FR-032)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §1 `lib/dal/notification.ts` · §2 `actions/notification.ts`
 *
 * 여기서 판정하는 것 셋:
 *  - 성사 시 **발급자에게만** 알림이 생기고, payload 가 발생 시점의 스냅샷을 담는다 (data-model.md)
 *  - 목록·미읽음 수는 **본인 것만** 내보낸다 — 호출부에 소유자 검사가 없다 (research R4)
 *  - 읽음 처리가 **이미 읽은 알림의 시각을 덮어쓰지 않는다** — 덮어쓰면 언제 읽었는지가 사라진다
 *
 * 마지막 항목이 이 파일의 이유다. `readAt: null` 조건 없이 "전부 now() 로" 갱신하면 화면상으로는
 * 완전히 정상으로 보이고, 읽은 시각만 조용히 밀린다.
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

// 호출마다 다른 세션을 묶는다 — accept-invite.test.ts(T018)와 같은 AsyncLocalStorage 패턴이다.
// mockResolvedValueOnce 의 호출 순서에 기대지 않으므로 중첩 호출에서도 그대로 쓸 수 있다.
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
// lib/prisma 는 임포트 시점에 DATABASE_URL 을 요구하므로 env 로드 뒤에 동적 임포트한다.
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }
// 성사는 **트랜잭션 프리미티브**로 일으킨다. `acceptInvite` 액션을 부르면 lib/dal/invite.ts 를
// 거쳐 H 의 lib/dal/friend.ts(T022)까지 끌려오는데, 알림이 생기는 자리는 이 트랜잭션이다.
// 액션 경로(검사 순서·오류 코드)는 T018 accept-invite.test.ts 가 판정한다.
const { acceptInviteTransaction } = await import('@/lib/dal/accept-invite')
const { getMyNotifications, getUnreadCount } = await import('@/lib/dal/notification')
const { markAllNotificationsRead, markNotificationRead } = await import(
  '@/app/friends/actions/notification'
)

const DAY_MS = 24 * 60 * 60 * 1000

describe.skipIf(!hasDatabase)('알림 — 생성 · 목록 · 읽음 처리 (T040 · US3)', () => {
  /** 이 파일이 만든 사용자 전부 — afterAll 에서 관련 행을 순서대로 지운다 */
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
        token: `t40-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 7 * DAY_MS),
      },
    })
  }

  /** 성사를 거치지 않고 알림만 심는다 — 목록·읽음 처리의 입력만 필요할 때 쓴다 */
  async function seedNotification(userId: string, createdAt: Date, readAt: Date | null = null) {
    return prisma.notification.create({
      data: {
        userId,
        type: 'FRIEND_JOINED_VIA_LINK',
        payload: {
          friendshipId: randomUUID(),
          friendUserId: randomUUID(),
          friendDisplayName: '심어둔 친구',
        },
        createdAt,
        readAt,
      },
    })
  }

  /** userId 의 세션으로 fn 을 실행한다 */
  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
  }

  beforeAll(async () => {
    // 연결 확인 — 스키마가 없으면 여기서 바로 드러난다
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

  it('성사 시 발급자에게만 알림이 생기고 payload 가 발생 시점의 스냅샷을 담는다 (FR-017 · FR-028)', async () => {
    const inviter = await createUser('T040 발급자')
    const accepter = await createUser('T040 수신자')
    const link = await createLink(inviter.id)

    const { friendshipId } = await acceptInviteTransaction({
      linkId: link.id,
      inviterId: inviter.id,
      addresseeId: accepter.id,
      addresseeDisplayName: accepter.displayName,
    })

    const received = await as(inviter.id, getMyNotifications)
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      type: 'FRIEND_JOINED_VIA_LINK',
      readAt: null,
      payload: {
        friendUserId: accepter.id,
        // 표시명은 조회 시점에 User 를 다시 읽지 않고 복사해 둔 값이다 (data-model.md)
        friendDisplayName: accepter.displayName,
      },
    })
    // 방금 생긴 관계를 가리킨다 — 알림이 어느 성사에서 왔는지가 payload 안에 있다
    expect(received[0].payload.friendshipId).toBe(friendshipId)

    // 링크를 연 쪽에는 알림이 생기지 않는다 — 통제 수단은 발급자의 것이다
    await expect(as(accepter.id, getMyNotifications)).resolves.toHaveLength(0)
  })

  it('목록은 본인 것만 최신순으로 내보낸다 (FR-029)', async () => {
    const owner = await createUser('T040 주인')
    const other = await createUser('T040 남')
    const base = Date.now()

    const older = await seedNotification(owner.id, new Date(base - 2 * 60_000))
    const newer = await seedNotification(owner.id, new Date(base - 60_000))
    const foreign = await seedNotification(other.id, new Date(base))

    const mine = await as(owner.id, getMyNotifications)
    expect(mine.map((n) => n.id)).toEqual([newer.id, older.id])
    expect(mine.map((n) => n.id)).not.toContain(foreign.id)
  })

  it('미읽음 수는 읽지 않은 본인 알림만 센다 (FR-030)', async () => {
    const owner = await createUser('T040 배지')
    const other = await createUser('T040 배지 남')
    const now = Date.now()

    await seedNotification(owner.id, new Date(now - 3 * 60_000))
    await seedNotification(owner.id, new Date(now - 2 * 60_000))
    await seedNotification(owner.id, new Date(now - 60_000), new Date(now - 30_000))
    await seedNotification(other.id, new Date(now))

    await expect(as(owner.id, getUnreadCount)).resolves.toBe(2)
  })

  it('읽음 처리는 readAt 을 남기고, 다시 불러도 그 시각을 덮어쓰지 않는다 (FR-031)', async () => {
    const owner = await createUser('T040 읽음')
    const seeded = await seedNotification(owner.id, new Date())

    const first = await as(owner.id, () => markNotificationRead({ notificationId: seeded.id }))
    expect(first.ok).toBe(true)

    const afterFirst = await prisma.notification.findUniqueOrThrow({ where: { id: seeded.id } })
    expect(afterFirst.readAt).toBeInstanceOf(Date)

    // 같은 알림을 다시 눌러도 성공이되 시각은 그대로다 — 언제 읽었는지가 사실로 남는다
    const again = await as(owner.id, () => markNotificationRead({ notificationId: seeded.id }))
    expect(again.ok).toBe(true)
    const afterSecond = await prisma.notification.findUniqueOrThrow({ where: { id: seeded.id } })
    expect(afterSecond.readAt?.getTime()).toBe(afterFirst.readAt?.getTime())
  })

  it('남의 알림 · 없는 알림을 읽음 처리하면 NOT_OWNER 이고 그 행은 그대로다', async () => {
    const owner = await createUser('T040 소유자')
    const intruder = await createUser('T040 침입자')
    const seeded = await seedNotification(owner.id, new Date())

    const foreign = await as(intruder.id, () => markNotificationRead({ notificationId: seeded.id }))
    expect(foreign.ok).toBe(false)
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_OWNER')
    const untouched = await prisma.notification.findUniqueOrThrow({ where: { id: seeded.id } })
    expect(untouched.readAt).toBeNull()

    // 없는 id 도 같은 응답이다 — 남의 것인지 없는 것인지 구분해 알리지 않는다
    const missing = await as(intruder.id, () =>
      markNotificationRead({ notificationId: randomUUID() }),
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('NOT_OWNER')
  })

  it('모두 읽음은 읽지 않은 것만 갱신하고, 이미 읽은 알림의 시각을 덮어쓰지 않는다 (T040 핵심)', async () => {
    const owner = await createUser('T040 모두읽음')
    const other = await createUser('T040 모두읽음 남')
    const now = Date.now()
    const readLongAgo = new Date(now - 60 * 60_000)

    const alreadyRead = await seedNotification(owner.id, new Date(now - 3 * 60_000), readLongAgo)
    const unreadA = await seedNotification(owner.id, new Date(now - 2 * 60_000))
    const unreadB = await seedNotification(owner.id, new Date(now - 60_000))
    const foreign = await seedNotification(other.id, new Date(now))

    const result = await as(owner.id, markAllNotificationsRead)
    expect(result).toEqual({ ok: true, data: { count: 2 } })

    // 이미 읽은 알림의 시각은 한 시간 전 그대로다 — 여기가 밀리면 "언제 읽었나"가 사라진다
    const kept = await prisma.notification.findUniqueOrThrow({ where: { id: alreadyRead.id } })
    expect(kept.readAt?.getTime()).toBe(readLongAgo.getTime())

    for (const id of [unreadA.id, unreadB.id]) {
      const row = await prisma.notification.findUniqueOrThrow({ where: { id } })
      expect(row.readAt).toBeInstanceOf(Date)
    }
    await expect(as(owner.id, getUnreadCount)).resolves.toBe(0)

    // 남의 알림은 건드리지 않는다
    const untouched = await prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })
    expect(untouched.readAt).toBeNull()
  })

  it('읽지 않은 알림이 없으면 모두 읽음은 0건을 돌려준다', async () => {
    const owner = await createUser('T040 빈 모두읽음')
    await expect(as(owner.id, markAllNotificationsRead)).resolves.toEqual({
      ok: true,
      data: { count: 0 },
    })
  })
})
