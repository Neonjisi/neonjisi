// @vitest-environment node
/**
 * T025 — createTasteItem Server Action 통합 테스트
 * 계약: specs/001-taste-profile/contracts/server-actions.md
 *
 * 검사 순서(세션 → 스키마 → 대분류 존재 → 모순 → 중복 → 상한 → 저장)와
 * onboardedAt 설정(FR-008)을 실제 DB 로 검증한다. 세션만 mock 한다.
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

// revalidatePath 는 요청 컨텍스트 밖에서 호출하면 실패한다 — 테스트에서는 무시한다.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }
const { createTasteItem, updateTasteDescription } = await import('@/app/taste/actions')

describe.skipIf(!hasDatabase)('createTasteItem — 검사 순서와 저장 (T025)', () => {
  const userId = randomUUID()
  let categoryA: { id: string; name: string }
  let categoryB: { id: string; name: string }

  beforeAll(async () => {
    h.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, email: 'taste-test@example.com' } },
      error: null,
    })
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      take: 2,
    })
    if (categories.length < 2) throw new Error('시드가 비어 있다 — T013 을 먼저 실행할 것')
    ;[categoryA, categoryB] = categories
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('HAVE 저장 성공 시 User·프로필이 get-or-create 되고 onboardedAt 이 설정된다 (FR-008)', async () => {
    const result = await createTasteItem({
      kind: 'HAVE',
      categoryId: categoryA.id,
      detail: '스타벅스 텀블러',
    })

    expect(result).toMatchObject({ ok: true })
    const profile = await prisma.tasteProfile.findUnique({
      where: { userId },
      include: { items: true },
    })
    expect(profile?.onboardedAt).toBeInstanceOf(Date)
    expect(profile?.items).toHaveLength(1)
    expect(profile?.items[0]).toMatchObject({
      kind: 'HAVE',
      categoryId: categoryA.id,
      detail: '스타벅스 텀블러',
    })
  })

  it('동일 (종류, 대분류, 상세) 재등록은 DUPLICATE_ITEM (FR-011)', async () => {
    const result = await createTasteItem({
      kind: 'HAVE',
      categoryId: categoryA.id,
      detail: '스타벅스 텀블러',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_ITEM')
    expect(result.error.conflictWith).toMatchObject({
      kind: 'HAVE',
      categoryName: categoryA.name,
      detail: '스타벅스 텀블러',
    })
  })

  it('상세 없는 WANT ↔ UNWANTED 는 같은 대분류에 공존할 수 없다 — CONTRADICTORY_ITEM (FR-010)', async () => {
    const want = await createTasteItem({ kind: 'WANT', categoryId: categoryB.id, detail: null })
    expect(want.ok).toBe(true)

    const result = await createTasteItem({
      kind: 'UNWANTED',
      categoryId: categoryB.id,
      detail: null,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('CONTRADICTORY_ITEM')
    expect(result.error.conflictWith).toMatchObject({
      kind: 'WANT',
      categoryName: categoryB.name,
      detail: null,
    })
  })

  it('마스터에 없는 대분류는 CATEGORY_NOT_FOUND (FR-004)', async () => {
    const result = await createTasteItem({ kind: 'HAVE', categoryId: randomUUID(), detail: null })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('CATEGORY_NOT_FOUND')
  })

  it('형식이 어긋난 입력은 VALIDATION_FAILED', async () => {
    const result = await createTasteItem({
      kind: 'HAVE',
      categoryId: 'cat-1' as string,
      detail: null,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('VALIDATION_FAILED')
  })

  it('종류별 100건 상한 도달 시 ITEM_LIMIT_EXCEEDED — 현재 개수와 상한을 안내한다 (FR-020)', async () => {
    const profile = await prisma.tasteProfile.findUniqueOrThrow({ where: { userId } })
    const existingWantCount = await prisma.tasteItem.count({
      where: { profileId: profile.id, kind: 'WANT' },
    })
    await prisma.tasteItem.createMany({
      data: Array.from({ length: 100 - existingWantCount }, (_, i) => ({
        profileId: profile.id,
        kind: 'WANT' as const,
        categoryId: categoryB.id,
        detail: `상한 채우기 ${i}`,
      })),
    })

    const result = await createTasteItem({
      kind: 'WANT',
      categoryId: categoryB.id,
      detail: '상한 초과분',
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ITEM_LIMIT_EXCEEDED')
    expect(result.error.message).toContain('100')
  })
})

describe.skipIf(!hasDatabase)('createTasteItem — WANT 는 온보딩과 무관하다 (T036 · FR-008)', () => {
  const userId = randomUUID()

  beforeAll(() => {
    h.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, email: 'want-test@example.com' } },
      error: null,
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  it('WANT 저장은 onboardedAt 을 설정하지 않는다', async () => {
    const category = await prisma.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
    const result = await createTasteItem({
      kind: 'WANT',
      categoryId: category.id,
      detail: '핸드드립 케틀',
    })

    expect(result.ok).toBe(true)
    const profile = await prisma.tasteProfile.findUnique({ where: { userId } })
    expect(profile?.onboardedAt).toBeNull()
  })
})

describe.skipIf(!hasDatabase)('updateTasteDescription — FR-007 (T043 선행 구현)', () => {
  const userId = randomUUID()

  beforeAll(() => {
    h.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, email: 'desc-test@example.com' } },
      error: null,
    })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } })
  })

  it('서술을 저장한다', async () => {
    const result = await updateTasteDescription('산미 있는 원두를 좋아해요.')
    expect(result.ok).toBe(true)
    const profile = await prisma.tasteProfile.findUnique({ where: { userId } })
    expect(profile?.description).toBe('산미 있는 원두를 좋아해요.')
  })

  it('빈 문자열은 NULL 로 정규화한다 — FR-015 집계가 빈 문자열을 작성으로 세지 않게 (T041)', async () => {
    const result = await updateTasteDescription('   ')
    expect(result.ok).toBe(true)
    const profile = await prisma.tasteProfile.findUnique({ where: { userId } })
    expect(profile?.description).toBeNull()
  })
})
