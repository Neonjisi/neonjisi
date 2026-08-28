// @vitest-environment node
/**
 * T005 / T008 — C3·C4 제약 검증 (data-model.md, FR-015·FR-016·FR-026, quickstart V5-1)
 *
 * Friendship 의 두 불변식은 Prisma 문법으로 표현되지 않아 raw SQL 마이그레이션으로 넣었다 (R4):
 *   C3 friendship_pair_active — 같은 쌍의 활성 관계는 순서와 무관하게 최대 하나
 *                               (LEAST/GREATEST 표현식 partial unique index, status <> 'REMOVED')
 *   C4 friendship_not_self    — 자기 자신과의 관계 금지 (CHECK requesterId <> addresseeId)
 *
 * 애플리케이션 검사만 있는 불변식은 조용히 새고 화면으로는 알 수 없다 — M1 T010/T011 의 교훈.
 * 이 테스트가 제약이 **실제로 걸렸는지** 판정하는 유일한 장치다. T006·T007 이 빠지면 (a)(b) 가
 * 실패한다. `db push` 로 만든 DB 에도 둘 다 없다.
 *
 * 실 DB 에 붙는 통합 테스트라 .env.local 이 필요하다. 4개 워크트리가 같은 DB 를 보므로
 * 픽스처는 randomUUID() 로 격리하고 afterAll 에서 지운다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Vitest 는 Next 와 달리 .env.local 을 자동으로 읽지 않는다.
// 게다가 @next/env 는 NODE_ENV=test 에서 .env.local 을 의도적으로 건너뛰므로,
// 로드하는 동안만 NODE_ENV 를 우회한다 — 이 테스트는 실 DB 가 전제다.
{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

const hasDatabase = Boolean(process.env.DATABASE_URL)
// lib/prisma 는 임포트 시점에 DATABASE_URL 을 요구하므로 env 로드 뒤에 동적 임포트한다.
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

describe.skipIf(!hasDatabase)('C3·C4 — Friendship 제약', () => {
  // (a) 는 A–B 쌍, (c) 는 A–C 쌍을 쓴다. 서로 다른 쌍이라 케이스 간 간섭이 없다.
  const userA = randomUUID()
  const userB = randomUUID()
  const userC = randomUUID()

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: userA, displayName: 'C3C4 제약 테스트 A' },
        { id: userB, displayName: 'C3C4 제약 테스트 B' },
        { id: userC, displayName: 'C3C4 제약 테스트 C' },
      ],
    })
  })

  afterAll(async () => {
    // User 삭제가 Friendship(requester·addressee Cascade) 을 함께 지운다.
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB, userC] } } })
    await prisma.$disconnect()
  })

  it('(a) C3 — 같은 쌍의 두 번째 활성 관계는 순서를 바꿔도 DB 가 거부한다 (FR-015)', async () => {
    await prisma.friendship.create({ data: { requesterId: userA, addresseeId: userB } })

    // 같은 순서
    await expect(
      prisma.friendship.create({ data: { requesterId: userA, addresseeId: userB } }),
    ).rejects.toMatchObject({ code: 'P2002' })

    // 순서를 바꿔도 — LEAST/GREATEST 가 (A,B) 와 (B,A) 를 같은 키로 정규화한다
    await expect(
      prisma.friendship.create({ data: { requesterId: userB, addresseeId: userA } }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('(b) C4 — 자기 자신과의 관계를 DB 가 거부한다 (FR-016)', async () => {
    await expect(
      prisma.friendship.create({ data: { requesterId: userA, addresseeId: userA } }),
    ).rejects.toThrow(/friendship_not_self/)
  })

  it('(c) REMOVED 행이 있어도 같은 쌍을 새 행으로 재추가할 수 있다 (FR-026, R9)', async () => {
    const removed = await prisma.friendship.create({
      data: {
        requesterId: userA,
        addresseeId: userC,
        status: 'REMOVED',
        removedAt: new Date(),
        removedBy: userA,
      },
    })

    // 재추가는 되살리기가 아니라 새 행이다 — partial index 가 REMOVED 행을 무시한다
    const readded = await prisma.friendship.create({
      data: { requesterId: userC, addresseeId: userA },
    })

    expect(readded.id).not.toBe(removed.id)
    expect(readded.status).toBe('ACTIVE')
  })
})
