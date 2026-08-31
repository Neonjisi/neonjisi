// @vitest-environment node
/**
 * 링크 중지 통합 테스트 (US3 · FR-005 · FR-006)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2 `revokeInviteLink`
 *
 * T040 이 알림을 맡고, 이 파일이 통제 수단의 나머지 한 축인 **중지**를 맡는다.
 * 중지는 링크가 의도치 않은 곳으로 퍼졌을 때 발급자가 쓸 수 있는 유일한 수단이다 (SCR-M2-03).
 *
 *  - 중지는 `revokedAt` 기록이다 — 행을 지우지 않는다. 어느 링크로 누가 왔는지가 남아야 한다
 *  - 이미 중지된 링크의 시각을 **덮어쓰지 않는다** — 언제 끊었는지가 사실로 남는다
 *  - 남의 링크와 없는 링크는 **같은 응답**이다 — 존재 여부를 알리면 링크 id 탐색에 힌트가 된다
 *  - 중지는 **이미 맺어진 관계를 되돌리지 않는다** — 그건 해제(US4)의 몫이다
 *
 * 만료·중지·부재가 미리보기에서 구분되지 않는 것(SC-005)은 `getPreview()` 를 지나므로
 * E2E(invite-control.spec.ts US3-3)와 dal-invite 단위 테스트가 판정한다.
 *
 * 실 DB 통합 테스트라 .env.local 이 필요하다.
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
const { revokeInviteLink } = await import('@/app/friends/actions/invite-link')

const DAY_MS = 24 * 60 * 60 * 1000

describe.skipIf(!hasDatabase)('revokeInviteLink — 링크 중지 (US3 · FR-005)', () => {
  const userIds: string[] = []

  async function createUser(label: string): Promise<string> {
    const id = randomUUID()
    await prisma.user.create({ data: { id, displayName: `${label} ${id.slice(0, 8)}` } })
    userIds.push(id)
    return id
  }

  async function createLink(
    inviterId: string,
    overrides: { expiresAt?: Date; revokedAt?: Date | null } = {},
  ) {
    return prisma.friendInviteLink.create({
      data: {
        inviterId,
        token: `rev-${randomUUID()}`,
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * DAY_MS),
        revokedAt: overrides.revokedAt ?? null,
      },
    })
  }

  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
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

  it('소유자가 중지하면 revokedAt 이 기록되고 행은 남는다 (FR-005)', async () => {
    const owner = await createUser('중지 소유자')
    const link = await createLink(owner)
    const before = Date.now()

    const result = await as(owner, () => revokeInviteLink({ linkId: link.id }))
    expect(result).toEqual({ ok: true, data: { ok: true } })

    const row = await prisma.friendInviteLink.findUniqueOrThrow({ where: { id: link.id } })
    expect(row.revokedAt).toBeInstanceOf(Date)
    expect(row.revokedAt!.getTime()).toBeGreaterThanOrEqual(before - 1_000)
    // 토큰도 발급 이력도 그대로다 — 어느 링크로 누가 왔는지를 계속 추적할 수 있어야 한다
    expect(row.token).toBe(link.token)
  })

  it('이미 중지된 링크를 다시 중지하면 ALREADY_REVOKED 이고 처음 시각이 유지된다', async () => {
    const owner = await createUser('중지 반복')
    const revokedAt = new Date(Date.now() - 60 * 60_000)
    const link = await createLink(owner, { revokedAt })

    const result = await as(owner, () => revokeInviteLink({ linkId: link.id }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ALREADY_REVOKED')

    const row = await prisma.friendInviteLink.findUniqueOrThrow({ where: { id: link.id } })
    expect(row.revokedAt?.getTime()).toBe(revokedAt.getTime())
  })

  it('남의 링크 · 없는 링크 · uuid 가 아닌 입력은 모두 NOT_OWNER 이고 행은 그대로다', async () => {
    const owner = await createUser('중지 주인')
    const intruder = await createUser('중지 침입자')
    const link = await createLink(owner)

    const foreign = await as(intruder, () => revokeInviteLink({ linkId: link.id }))
    expect(foreign.ok).toBe(false)
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_OWNER')

    const missing = await as(intruder, () => revokeInviteLink({ linkId: randomUUID() }))
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('NOT_OWNER')

    const malformed = await as(intruder, () => revokeInviteLink({ linkId: 'not-a-uuid' }))
    expect(malformed.ok).toBe(false)
    if (!malformed.ok) expect(malformed.error.code).toBe('NOT_OWNER')

    const untouched = await prisma.friendInviteLink.findUniqueOrThrow({ where: { id: link.id } })
    expect(untouched.revokedAt).toBeNull()
  })

  it('만료된 링크도 중지할 수 있고, 사용 인원수는 중지로 달라지지 않는다 (FR-006)', async () => {
    const owner = await createUser('중지 만료')
    const link = await createLink(owner, { expiresAt: new Date(Date.now() - DAY_MS) })
    await prisma.friendInviteLink.update({ where: { id: link.id }, data: { usedCount: 3 } })

    const result = await as(owner, () => revokeInviteLink({ linkId: link.id }))
    expect(result.ok).toBe(true)

    // 이미 만료돼 무효였던 링크라도 중지 기록은 남는다 — 두 사유가 겹칠 뿐 상태는 하나가 아니다
    const row = await prisma.friendInviteLink.findUniqueOrThrow({ where: { id: link.id } })
    expect(row.revokedAt).toBeInstanceOf(Date)
    // 지난 링크에도 "몇 명이 썼는지"가 남아야 한다 (SCR-M2-03 지난 링크 목록)
    expect(row.usedCount).toBe(3)
  })

  it('중지는 이미 맺어진 관계를 되돌리지 않는다 — 그건 해제(US4)의 몫이다', async () => {
    const owner = await createUser('중지 발급자')
    const friend = await createUser('중지 수신자')
    const link = await createLink(owner)
    const friendship = await prisma.friendship.create({
      data: {
        requesterId: owner,
        addresseeId: friend,
        status: 'ACTIVE',
        inviteLinkId: link.id,
      },
    })

    const result = await as(owner, () => revokeInviteLink({ linkId: link.id }))
    expect(result.ok).toBe(true)

    const row = await prisma.friendship.findUniqueOrThrow({ where: { id: friendship.id } })
    expect(row.status).toBe('ACTIVE')
    // 관계가 어느 링크에서 왔는지도 그대로다 (Friendship.inviteLinkId)
    expect(row.inviteLinkId).toBe(link.id)
  })
})
