// @vitest-environment node
/**
 * syncOnboardedAt 경합 통합 테스트 (US4-3 · FR-008)
 * 계약: specs/001-taste-profile/contracts/server-actions.md
 *
 * HAVE 2건을 동시에 삭제하면 두 트랜잭션이 서로의 삭제를 보지 못한 채
 * "아직 1건 남았다"고 판정해 onboardedAt 이 남는 TOCTOU 가 있었다.
 * DAL 이 프로필 행을 잠가(FOR UPDATE) 판정을 직렬화하는지 확인한다.
 * 락이 없으면 비결정적으로 실패하므로 같은 시나리오를 여러 번 반복한다.
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
const { createTasteItem, deleteTasteItem, updateTasteItem } = await import('@/app/taste/actions')

/** 경합 창이 좁아 한 번으로는 재현되지 않을 수 있다 — 라운드마다 새로 만들고 다시 지운다 */
const ROUNDS = 3
/** 원격 DB 왕복이 라운드당 수십 번이라 기본 5초로는 부족하다 */
const RACE_TEST_TIMEOUT = 60_000

describe.skipIf(!hasDatabase)('syncOnboardedAt — 동시 쓰기 경합 (US4-3)', () => {
  const userId = randomUUID()
  let categoryId: string

  beforeAll(async () => {
    h.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, email: 'race-test@example.com' } },
      error: null,
    })
    const category = await prisma.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
    categoryId = category.id
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  async function createTwoHaveItems(tag: string): Promise<[string, string]> {
    const first = await createTasteItem({ kind: 'HAVE', categoryId, detail: `${tag} A` })
    const second = await createTasteItem({ kind: 'HAVE', categoryId, detail: `${tag} B` })
    if (!first.ok || !second.ok) throw new Error('셋업 실패 — HAVE 2건 생성')
    const before = await prisma.tasteProfile.findUniqueOrThrow({ where: { userId } })
    expect(before.onboardedAt).toBeInstanceOf(Date)
    return [first.data.itemId, second.data.itemId]
  }

  it('HAVE 2건을 동시에 삭제하면 onboardedAt 이 NULL 로 돌아간다', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const [a, b] = await createTwoHaveItems(`삭제 경합 ${round}`)

      const results = await Promise.all([deleteTasteItem(a), deleteTasteItem(b)])
      expect(results.map((r) => r.ok), `round ${round}`).toEqual([true, true])

      const after = await prisma.tasteProfile.findUniqueOrThrow({ where: { userId } })
      expect(after.onboardedAt, `round ${round}: onboardedAt`).toBeNull()
      expect(await prisma.tasteItem.count({ where: { profileId: after.id } })).toBe(0)
    }
  }, RACE_TEST_TIMEOUT)

  it('HAVE 2건을 동시에 WANT 로 바꿔도 onboardedAt 이 NULL 로 돌아간다', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const [a, b] = await createTwoHaveItems(`전환 경합 ${round}`)

      const results = await Promise.all([
        updateTasteItem(a, { kind: 'WANT' }),
        updateTasteItem(b, { kind: 'WANT' }),
      ])
      expect(results.map((r) => r.ok), `round ${round}`).toEqual([true, true])

      const after = await prisma.tasteProfile.findUniqueOrThrow({ where: { userId } })
      expect(after.onboardedAt, `round ${round}: onboardedAt`).toBeNull()

      // 다음 라운드를 위해 WANT 로 바뀐 항목을 치운다 (WANT 는 온보딩과 무관)
      await prisma.tasteItem.deleteMany({ where: { profileId: after.id } })
    }
  }, RACE_TEST_TIMEOUT)
})
