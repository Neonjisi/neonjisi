// @vitest-environment node
/**
 * T018 — 링크 성사 트랜잭션 통합 테스트 (US1 · research R5 · FR-006 · FR-017)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2 `acceptInvite`
 *
 * 성사 시 관계 · usedCount · 발급자 알림이 **한 트랜잭션**으로 함께 생기는지, 실패(C3 유니크
 * 위반)하면 셋이 함께 롤백되는지 확인한다. 검사 순서(세션 → 유효성 → 본인 → 기존 관계 →
 * 트랜잭션)와 오류 코드도 여기서 본다. 동시 사용은 accept-invite-concurrent.test.ts (T019).
 *
 * 실 DB 통합 테스트라 .env.local 이 필요하다. 스키마(gnuke/m2-schema)가 merge 되고
 * `npx prisma generate` 가 돼 있어야 한다. 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다.
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

// 호출마다 다른 세션을 묶기 위해 AsyncLocalStorage 로 userId 를 전달한다 — getClaims 목이
// 현재 비동기 문맥의 userId 를 읽는다. mockResolvedValueOnce 의 호출 순서에 기대지 않으므로
// 같은 패턴을 동시 호출(T019)에서도 그대로 쓴다.
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
const { acceptInvite } = await import('@/app/friends/actions/accept-invite')
const { acceptInviteTransaction } = await import('@/lib/dal/accept-invite')

const DAY_MS = 24 * 60 * 60 * 1000

describe.skipIf(!hasDatabase)('acceptInvite — 성사 트랜잭션 (T018)', () => {
  /** 이 파일이 만든 사용자 전부 — afterAll 에서 관련 행을 순서대로 지운다 */
  const userIds: string[] = []

  async function createUser(label: string): Promise<{ id: string; displayName: string }> {
    const id = randomUUID()
    const displayName = `${label} ${id.slice(0, 8)}`
    await prisma.user.create({ data: { id, displayName } })
    userIds.push(id)
    return { id, displayName }
  }

  async function createLink(
    inviterId: string,
    overrides: { expiresAt?: Date; revokedAt?: Date | null } = {},
  ) {
    return prisma.friendInviteLink.create({
      data: {
        inviterId,
        token: `t18-${randomUUID()}`,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * DAY_MS),
        revokedAt: overrides.revokedAt ?? null,
      },
    })
  }

  /** userId 의 세션으로 fn 을 실행한다 */
  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
  }

  async function usedCountOf(linkId: string): Promise<number> {
    const link = await prisma.friendInviteLink.findUniqueOrThrow({ where: { id: linkId } })
    return link.usedCount
  }

  function friendshipsBetween(a: string, b: string) {
    return prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: a, addresseeId: b },
          { requesterId: b, addresseeId: a },
        ],
      },
      orderBy: { acceptedAt: 'asc' },
    })
  }

  function notificationsOf(userId: string) {
    return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  }

  beforeAll(async () => {
    // 연결 확인 — 스키마가 merge 되지 않았으면 여기서 바로 드러난다
    await prisma.$queryRaw`SELECT 1`
  })

  afterAll(async () => {
    // FK 가 Cascade 라도 순서를 명시한다 — 스키마 변경에 기대지 않는다
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] },
    })
    await prisma.friendInviteLink.deleteMany({ where: { inviterId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })

  it('유효한 링크를 열면 관계 · usedCount · 발급자 알림이 함께 생긴다', async () => {
    const inviter = await createUser('T018 A')
    const accepter = await createUser('T018 B')
    const link = await createLink(inviter.id)

    const result = await as(accepter.id, () => acceptInvite({ token: link.token }))

    expect(result).toEqual({ ok: true, data: { friendUserId: inviter.id } })

    // 관계 — 발급자가 requester, 연 사람이 addressee (data-model.md)
    const friendships = await friendshipsBetween(inviter.id, accepter.id)
    expect(friendships).toHaveLength(1)
    const [friendship] = friendships
    expect(friendship).toMatchObject({
      requesterId: inviter.id,
      addresseeId: accepter.id,
      status: 'ACTIVE',
      inviteLinkId: link.id,
      removedAt: null,
      removedBy: null,
    })
    expect(friendship.acceptedAt).toBeInstanceOf(Date)

    // usedCount — 같은 트랜잭션에서 1 증가 (FR-006)
    expect(await usedCountOf(link.id)).toBe(1)

    // 알림 — 발급자에게만, payload 는 표시명 스냅샷 (FR-017, data-model.md Notification)
    const notifications = await notificationsOf(inviter.id)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      type: 'FRIEND_JOINED_VIA_LINK',
      readAt: null,
      payload: {
        friendshipId: friendship.id,
        friendUserId: accepter.id,
        friendDisplayName: accepter.displayName,
      },
    })
    expect(await notificationsOf(accepter.id)).toHaveLength(0)
  })

  it('만료 · 중지 · 부재 · 형식 불량 링크는 전부 LINK_INVALID 하나로, 같은 문구로 응답한다 (FR-007)', async () => {
    const inviter = await createUser('T018 A')
    const accepter = await createUser('T018 B')
    const expired = await createLink(inviter.id, { expiresAt: new Date(Date.now() - 60_000) })
    const revoked = await createLink(inviter.id, { revokedAt: new Date() })

    const results = await Promise.all([
      as(accepter.id, () => acceptInvite({ token: expired.token })),
      as(accepter.id, () => acceptInvite({ token: revoked.token })),
      as(accepter.id, () => acceptInvite({ token: `t18-missing-${randomUUID()}` })),
      as(accepter.id, () => acceptInvite({ token: '' })),
    ])

    for (const result of results) {
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.code).toBe('LINK_INVALID')
    }
    // 세 경우를 외부에서 구분할 수 없어야 한다 (SC-005) — 문구까지 같다
    const messages = new Set(results.map((r) => (r.ok ? '' : r.error.message)))
    expect(messages.size).toBe(1)

    // 아무것도 생기지 않는다
    expect(await friendshipsBetween(inviter.id, accepter.id)).toHaveLength(0)
    expect(await usedCountOf(expired.id)).toBe(0)
    expect(await usedCountOf(revoked.id)).toBe(0)
    expect(await notificationsOf(inviter.id)).toHaveLength(0)
  })

  it('본인 링크는 SELF_INVITE — 성사하지 않고 usedCount 도 오르지 않는다 (FR-016)', async () => {
    const inviter = await createUser('T018 A')
    const link = await createLink(inviter.id)

    const result = await as(inviter.id, () => acceptInvite({ token: link.token }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('SELF_INVITE')
    expect(
      await prisma.friendship.count({
        where: { OR: [{ requesterId: inviter.id }, { addresseeId: inviter.id }] },
      }),
    ).toBe(0)
    expect(await usedCountOf(link.id)).toBe(0)
    expect(await notificationsOf(inviter.id)).toHaveLength(0)
  })

  it('이미 활성 친구면 ALREADY_FRIENDS — 방향과 무관하고 usedCount · 알림이 늘지 않는다 (FR-015)', async () => {
    const inviter = await createUser('T018 A')
    const accepter = await createUser('T018 B')
    const linkA = await createLink(inviter.id)
    const linkB = await createLink(accepter.id)

    const first = await as(accepter.id, () => acceptInvite({ token: linkA.token }))
    expect(first.ok).toBe(true)

    // 같은 링크를 같은 사람이 다시 연다
    const again = await as(accepter.id, () => acceptInvite({ token: linkA.token }))
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.code).toBe('ALREADY_FRIENDS')

    // 반대 방향 — B 의 링크를 A 가 연다. (A,B) 와 (B,A) 는 같은 쌍이다
    const reverse = await as(inviter.id, () => acceptInvite({ token: linkB.token }))
    expect(reverse.ok).toBe(false)
    if (!reverse.ok) expect(reverse.error.code).toBe('ALREADY_FRIENDS')

    expect(await friendshipsBetween(inviter.id, accepter.id)).toHaveLength(1)
    expect(await usedCountOf(linkA.id)).toBe(1)
    expect(await usedCountOf(linkB.id)).toBe(0)
    expect(await notificationsOf(inviter.id)).toHaveLength(1)
    expect(await notificationsOf(accepter.id)).toHaveLength(0)
  })

  it('C3 위반으로 트랜잭션이 실패하면 usedCount 증가와 알림도 함께 롤백된다 (R5)', async () => {
    const inviter = await createUser('T018 A')
    const accepter = await createUser('T018 B')
    const linkA = await createLink(inviter.id)
    const linkB = await createLink(accepter.id)

    // 액션의 4 번 검사를 건너뛰고 트랜잭션만 직접 부른다 — 이미 활성 관계가 있는 상태
    await prisma.friendship.create({
      data: { requesterId: inviter.id, addresseeId: accepter.id, status: 'ACTIVE' },
    })

    await expect(
      acceptInviteTransaction({
        linkId: linkA.id,
        inviterId: inviter.id,
        addresseeId: accepter.id,
        addresseeDisplayName: accepter.displayName,
      }),
    ).rejects.toMatchObject({ code: 'P2002' })

    // 반대 방향도 같은 키다 — LEAST/GREATEST 표현식 인덱스 (R4)
    await expect(
      acceptInviteTransaction({
        linkId: linkB.id,
        inviterId: accepter.id,
        addresseeId: inviter.id,
        addresseeDisplayName: inviter.displayName,
      }),
    ).rejects.toMatchObject({ code: 'P2002' })

    // 관계는 그대로 1행, 카운트와 알림은 롤백
    expect(await friendshipsBetween(inviter.id, accepter.id)).toHaveLength(1)
    expect(await usedCountOf(linkA.id)).toBe(0)
    expect(await usedCountOf(linkB.id)).toBe(0)
    expect(await notificationsOf(inviter.id)).toHaveLength(0)
    expect(await notificationsOf(accepter.id)).toHaveLength(0)
  })

  it('해제된(REMOVED) 이력은 재추가를 막지 않는다 — 새 행이 생긴다 (FR-026)', async () => {
    const inviter = await createUser('T018 A')
    const accepter = await createUser('T018 B')
    const link = await createLink(inviter.id)

    await prisma.friendship.create({
      data: {
        requesterId: inviter.id,
        addresseeId: accepter.id,
        status: 'REMOVED',
        removedAt: new Date(Date.now() - DAY_MS),
        removedBy: accepter.id,
      },
    })

    const result = await as(accepter.id, () => acceptInvite({ token: link.token }))
    expect(result).toEqual({ ok: true, data: { friendUserId: inviter.id } })

    const rows = await friendshipsBetween(inviter.id, accepter.id)
    expect(rows.map((r) => r.status).sort()).toEqual(['ACTIVE', 'REMOVED'])
    expect(rows.find((r) => r.status === 'ACTIVE')?.inviteLinkId).toBe(link.id)
    expect(await usedCountOf(link.id)).toBe(1)
    expect(await notificationsOf(inviter.id)).toHaveLength(1)
  })
})
