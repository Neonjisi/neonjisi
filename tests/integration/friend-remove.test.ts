// @vitest-environment node
/**
 * T050 — 친구 해제 통합 테스트 (spec.md US4 · FR-024~FR-027 · research R9)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2 `removeFriend`
 *
 *  - 해제는 **행 삭제가 아니라 상태 전이**다 — status=REMOVED, removedAt, removedBy(누른 사람)
 *  - 해제는 **양방향**이다 — 어느 쪽이 눌러도 한 행이 바뀌고, 양쪽 `requireActiveFriendship` 이 거부한다
 *  - 활성 관계가 없으면 NOT_FRIENDS (낯선 사람 · 이미 해제된 관계 · 자기 자신)
 *  - 과거 성사 알림은 남는다 — 그러나 알림의 friendUserId 로 접근해도 거부된다 (Edge Case)
 *  - 재추가는 **새 행**이다 — REMOVED 행이 남아 있어도 C3(partial unique) 가 새 ACTIVE 행을 허용한다
 *
 * 실 DB 에 붙는 통합 테스트라 .env.local 이 필요하다. 스키마(①)가 merge 되기 전엔 실패한다.
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

const h = vi.hoisted(() => ({ getClaims: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getClaims: h.getClaims } })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }
const { removeFriend } = await import('@/app/friends/actions/friendship')
// H 의 T032 — 친구 데이터를 읽는 모든 경로의 유일한 관문. 여기서 "거부"는 곧 접근 차단이다.
const { requireActiveFriendship } = await import('@/lib/dal/friend')

function actAs(userId: string) {
  h.getClaims.mockResolvedValue({
    data: { claims: { sub: userId, email: `${userId}@example.com` } },
    error: null,
  })
}

/** `notFound()` 는 digest `NEXT_HTTP_ERROR_FALLBACK;404` 를 가진 예외를 던진다 */
async function expectAccessDenied(run: () => Promise<unknown>): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404'),
  })
}

describe.skipIf(!hasDatabase)('removeFriend (T050 · US4)', () => {
  const requesterId = randomUUID() // A — 링크 발급자
  const addresseeId = randomUUID() // B — 링크를 받은 쪽
  const strangerId = randomUUID() // C — 누구와도 친구가 아니다
  let friendshipId: string
  let notificationId: string

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: requesterId, displayName: 'US4 발급자 A' },
        { id: addresseeId, displayName: 'US4 수신자 B' },
        { id: strangerId, displayName: 'US4 낯선 사람 C' },
      ],
    })
    const friendship = await prisma.friendship.create({
      data: { requesterId, addresseeId, status: 'ACTIVE' },
    })
    friendshipId = friendship.id
    // 성사 시점에 발급자가 받은 알림 — 표시명은 스냅샷으로 복사돼 있다 (data-model.md)
    const notification = await prisma.notification.create({
      data: {
        userId: requesterId,
        type: 'FRIEND_JOINED_VIA_LINK',
        payload: { friendshipId, friendUserId: addresseeId, friendDisplayName: 'US4 수신자 B' },
      },
    })
    notificationId = notification.id
  })

  afterAll(async () => {
    // User 삭제가 Friendship(requester·addressee Cascade)·Notification 을 함께 지운다
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, addresseeId, strangerId] } } })
    await prisma.$disconnect()
  })

  it('해제 전에는 양쪽 모두 requireActiveFriendship 을 통과한다 (전제)', async () => {
    actAs(requesterId)
    await expect(requireActiveFriendship(addresseeId)).resolves.toEqual({ friendshipId })
    actAs(addresseeId)
    await expect(requireActiveFriendship(requesterId)).resolves.toEqual({ friendshipId })
  })

  it('친구가 아닌 상대를 해제하면 NOT_FRIENDS 이고 아무 행도 바뀌지 않는다', async () => {
    actAs(addresseeId)
    const result = await removeFriend({ friendUserId: strangerId })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_FRIENDS')

    const untouched = await prisma.friendship.findUnique({ where: { id: friendshipId } })
    expect(untouched?.status).toBe('ACTIVE')
  })

  it('자기 자신을 해제하면 NOT_FRIENDS', async () => {
    actAs(addresseeId)
    const result = await removeFriend({ friendUserId: addresseeId })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_FRIENDS')
  })

  it('수신자(B)가 해제하면 행은 남고 status=REMOVED · removedAt · removedBy=B 가 기록된다 (R9 · FR-027)', async () => {
    const before = Date.now()
    actAs(addresseeId)
    const result = await removeFriend({ friendUserId: requesterId })
    expect(result.ok).toBe(true)

    // 행을 지우지 않는다 — 이력으로 남는다 (FR-026)
    const row = await prisma.friendship.findUnique({ where: { id: friendshipId } })
    expect(row).not.toBeNull()
    expect(row?.status).toBe('REMOVED')
    expect(row?.removedBy).toBe(addresseeId)
    expect(row?.removedAt).toBeInstanceOf(Date)
    expect(row?.removedAt?.getTime()).toBeGreaterThanOrEqual(before - 1_000)
    // 쌍을 이루는 다른 행이 생기지도 않았다
    const pairRows = await prisma.friendship.count({
      where: {
        OR: [
          { requesterId, addresseeId },
          { requesterId: addresseeId, addresseeId: requesterId },
        ],
      },
    })
    expect(pairRows).toBe(1)
  })

  it('해제는 양방향이다 — 양쪽 모두 requireActiveFriendship 이 거부한다 (FR-025)', async () => {
    actAs(requesterId)
    await expectAccessDenied(() => requireActiveFriendship(addresseeId))
    actAs(addresseeId)
    await expectAccessDenied(() => requireActiveFriendship(requesterId))
  })

  it('이미 해제된 관계를 다시 해제하면 NOT_FRIENDS — 어느 쪽이 눌러도 같다', async () => {
    actAs(addresseeId)
    const again = await removeFriend({ friendUserId: requesterId })
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.code).toBe('NOT_FRIENDS')

    actAs(requesterId)
    const otherSide = await removeFriend({ friendUserId: addresseeId })
    expect(otherSide.ok).toBe(false)
    if (!otherSide.ok) expect(otherSide.error.code).toBe('NOT_FRIENDS')

    // removedBy 는 처음 누른 사람(B) 그대로다 — 덮어쓰지 않는다
    const row = await prisma.friendship.findUnique({ where: { id: friendshipId } })
    expect(row?.removedBy).toBe(addresseeId)
  })

  it('과거 성사 알림은 남아 있지만, 그 알림의 friendUserId 로 접근해도 거부된다 (Edge Case)', async () => {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } })
    expect(notification).not.toBeNull()
    const payload = notification?.payload as { friendUserId: string }
    expect(payload.friendUserId).toBe(addresseeId)

    actAs(requesterId)
    await expectAccessDenied(() => requireActiveFriendship(payload.friendUserId))
  })

  it('재추가는 새 행이다 — REMOVED 이력이 남아 있어도 새 ACTIVE 관계가 성립한다 (FR-026 · C3)', async () => {
    // 성사(acceptInvite, ③)를 거치지 않고 DB 수준에서 새 행을 만든다 — 방향이 바뀌어도 같은 쌍이다
    const readded = await prisma.friendship.create({
      data: { requesterId: addresseeId, addresseeId: requesterId, status: 'ACTIVE' },
    })
    expect(readded.id).not.toBe(friendshipId)

    // 기존 행은 되살아나지 않고 REMOVED 그대로다
    const old = await prisma.friendship.findUnique({ where: { id: friendshipId } })
    expect(old?.status).toBe('REMOVED')

    // 이제 양쪽 모두 새 행으로 통과한다
    actAs(requesterId)
    await expect(requireActiveFriendship(addresseeId)).resolves.toEqual({ friendshipId: readded.id })
    actAs(addresseeId)
    await expect(requireActiveFriendship(requesterId)).resolves.toEqual({ friendshipId: readded.id })

    // 이번엔 발급자(A)가 끊는다 — removedBy 가 A 로 기록된다
    actAs(requesterId)
    const result = await removeFriend({ friendUserId: addresseeId })
    expect(result.ok).toBe(true)
    const removed = await prisma.friendship.findUnique({ where: { id: readded.id } })
    expect(removed?.status).toBe('REMOVED')
    expect(removed?.removedBy).toBe(requesterId)
    actAs(addresseeId)
    await expectAccessDenied(() => requireActiveFriendship(requesterId))
  })
})
