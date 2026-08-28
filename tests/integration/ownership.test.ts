// @vitest-environment node
/**
 * T048 — 소유권·수정·삭제 통합 테스트 (updateTasteItem · deleteTasteItem)
 * 계약: specs/001-taste-profile/contracts/server-actions.md
 *
 *  - 타인 소유 항목의 수정·삭제는 FORBIDDEN (FR-002)
 *  - 수정은 수정 후 상태 기준으로 중복·모순을 재검사한다 (T049)
 *  - 마지막 HAVE/UNWANTED 가 사라지면(수정·삭제 모두) onboardedAt 이 NULL 로 돌아간다 (US4-3)
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

function actAs(userId: string) {
  h.getClaims.mockResolvedValue({
    data: { claims: { sub: userId, email: `${userId}@example.com` } },
    error: null,
  })
}

describe.skipIf(!hasDatabase)('updateTasteItem · deleteTasteItem (T048~T050)', () => {
  const ownerId = randomUUID()
  const strangerId = randomUUID()
  let categoryA: { id: string; name: string }
  let categoryB: { id: string; name: string }
  /** owner 의 HAVE 항목 — 온보딩을 성립시키는 유일한 항목 */
  let ownedItemId: string

  beforeAll(async () => {
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, take: 2 })
    if (categories.length < 2) throw new Error('시드가 비어 있다 — T013 을 먼저 실행할 것')
    ;[categoryA, categoryB] = categories

    // 두 사용자 모두 온보딩을 완료시킨다 — Action 진입 게이트(requireOnboarded)를 통과해야 한다.
    actAs(strangerId)
    const strangerItem = await createTasteItem({ kind: 'HAVE', categoryId: categoryB.id, detail: '낯선 사람 항목' })
    if (!strangerItem.ok) throw new Error('낯선 사용자 셋업 실패')

    actAs(ownerId)
    const owned = await createTasteItem({ kind: 'HAVE', categoryId: categoryA.id, detail: '주인 항목' })
    if (!owned.ok) throw new Error('소유자 셋업 실패')
    ownedItemId = owned.data.itemId
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, strangerId] } } })
    await prisma.$disconnect()
  })

  it('타인 소유 항목의 수정은 FORBIDDEN (FR-002)', async () => {
    actAs(strangerId)
    const result = await updateTasteItem(ownedItemId, { detail: '남의 것 바꾸기' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FORBIDDEN')

    const untouched = await prisma.tasteItem.findUnique({ where: { id: ownedItemId } })
    expect(untouched?.detail).toBe('주인 항목')
  })

  it('타인 소유 항목의 삭제는 FORBIDDEN (FR-002)', async () => {
    actAs(strangerId)
    const result = await deleteTasteItem(ownedItemId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('FORBIDDEN')
    expect(await prisma.tasteItem.findUnique({ where: { id: ownedItemId } })).not.toBeNull()
  })

  it('없는 항목은 ITEM_NOT_FOUND', async () => {
    actAs(ownerId)
    const result = await updateTasteItem(randomUUID(), { detail: '유령' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ITEM_NOT_FOUND')
  })

  it('본인 항목 수정은 성공하고 값이 반영된다 (FR-013)', async () => {
    actAs(ownerId)
    const result = await updateTasteItem(ownedItemId, { detail: '주인 항목 (수정됨)' })
    expect(result.ok).toBe(true)
    const item = await prisma.tasteItem.findUnique({ where: { id: ownedItemId } })
    expect(item?.detail).toBe('주인 항목 (수정됨)')
  })

  it('수정 후 상태가 기존 항목과 겹치면 DUPLICATE_ITEM — 재검사 (T049)', async () => {
    actAs(ownerId)
    const second = await createTasteItem({ kind: 'HAVE', categoryId: categoryA.id, detail: '두 번째 항목' })
    if (!second.ok) throw new Error('두 번째 항목 셋업 실패')

    const result = await updateTasteItem(second.data.itemId, { detail: '주인 항목 (수정됨)' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('DUPLICATE_ITEM')

    // 실패한 수정은 반영되지 않는다
    const item = await prisma.tasteItem.findUnique({ where: { id: second.data.itemId } })
    expect(item?.detail).toBe('두 번째 항목')
  })

  it('kind 를 WANT 로 바꿔 마지막 HAVE/UNWANTED 가 사라지면 onboardedAt 이 NULL 로 돌아간다', async () => {
    const soloUserId = randomUUID()
    actAs(soloUserId)
    const created = await createTasteItem({ kind: 'HAVE', categoryId: categoryA.id, detail: null })
    if (!created.ok) throw new Error('셋업 실패')

    const result = await updateTasteItem(created.data.itemId, { kind: 'WANT' })
    expect(result.ok).toBe(true)

    const profile = await prisma.tasteProfile.findUnique({ where: { userId: soloUserId } })
    expect(profile?.onboardedAt).toBeNull()
    await prisma.user.deleteMany({ where: { id: soloUserId } })
  })

  it('마지막 HAVE/UNWANTED 삭제 시 onboardedAt 이 NULL 로 돌아간다 (US4-3)', async () => {
    const soloUserId = randomUUID()
    actAs(soloUserId)
    const created = await createTasteItem({ kind: 'UNWANTED', categoryId: categoryB.id, detail: null })
    if (!created.ok) throw new Error('셋업 실패')

    const before = await prisma.tasteProfile.findUnique({ where: { userId: soloUserId } })
    expect(before?.onboardedAt).toBeInstanceOf(Date)

    const result = await deleteTasteItem(created.data.itemId)
    expect(result.ok).toBe(true)

    const after = await prisma.tasteProfile.findUnique({ where: { userId: soloUserId } })
    expect(after?.onboardedAt).toBeNull()
    expect(await prisma.tasteItem.findUnique({ where: { id: created.data.itemId } })).toBeNull()
    await prisma.user.deleteMany({ where: { id: soloUserId } })
  })
})
