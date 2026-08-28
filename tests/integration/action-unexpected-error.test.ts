// @vitest-environment node
/**
 * Server Action 방어선 — 예상 못 한 예외를 STORAGE_FAILED 로 변환 (FR-016)
 * 계약: specs/001-taste-profile/contracts/server-actions.md
 *
 * 게이트(verifySession / requireOnboarded) 이후의 DAL 조회가 던지는 예외(DB 단절 등)는
 * 결과 값으로 돌려준다 — 예외로 새면 클라이언트의 error.tsx 가 화면을 갈아치우며
 * 입력이 사라진다. 단 redirect 예외는 Next 가 처리해야 하므로 그대로 다시 던진다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

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

// DAL 은 실제 구현을 그대로 쓰되, 실패를 주입할 함수만 spy 로 감싼다.
vi.mock('@/lib/dal/taste', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dal/taste')>()
  return {
    ...actual,
    findCategoryById: vi.fn(actual.findCategoryById),
    findTasteItemById: vi.fn(actual.findTasteItemById),
    setTasteDescription: vi.fn(actual.setTasteDescription),
  }
})

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }
const dal = await import('@/lib/dal/taste')
const { createTasteItem, deleteTasteItem, updateTasteDescription, updateTasteItem } =
  await import('@/app/taste/actions')

/** Next 의 redirect() 가 던지는 것과 같은 모양 — digest 로 판별된다 */
function redirectLikeError(url: string): Error & { digest: string } {
  return Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url};307;` })
}

describe.skipIf(!hasDatabase)('Server Action 방어선 — 예상 못 한 예외 (FR-016)', () => {
  const userId = randomUUID()
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  let categoryId: string
  let itemId: string

  beforeAll(async () => {
    h.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, email: 'guard-test@example.com' } },
      error: null,
    })
    const category = await prisma.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' } })
    categoryId = category.id
    const created = await createTasteItem({ kind: 'HAVE', categoryId, detail: '방어선 항목' })
    if (!created.ok) throw new Error('셋업 실패')
    itemId = created.data.itemId
  })

  afterEach(() => {
    consoleError.mockClear()
  })

  afterAll(async () => {
    consoleError.mockRestore()
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('createTasteItem: 대분류 조회가 던지면 STORAGE_FAILED 를 값으로 돌려주고 원인을 남긴다', async () => {
    vi.mocked(dal.findCategoryById).mockRejectedValueOnce(new Error('connection reset'))

    const result = await createTasteItem({ kind: 'HAVE', categoryId, detail: '저장되면 안 됨' })

    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_FAILED' } })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(await prisma.tasteItem.count({ where: { detail: '저장되면 안 됨' } })).toBe(0)
  })

  it('updateTasteItem: 소유자 조회가 던지면 STORAGE_FAILED — 항목은 그대로다', async () => {
    vi.mocked(dal.findTasteItemById).mockRejectedValueOnce(new Error('connection reset'))

    const result = await updateTasteItem(itemId, { detail: '바뀌면 안 됨' })

    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_FAILED' } })
    const item = await prisma.tasteItem.findUnique({ where: { id: itemId } })
    expect(item?.detail).toBe('방어선 항목')
  })

  it('deleteTasteItem: 소유자 조회가 던지면 STORAGE_FAILED — 항목은 남는다', async () => {
    vi.mocked(dal.findTasteItemById).mockRejectedValueOnce(new Error('connection reset'))

    const result = await deleteTasteItem(itemId)

    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_FAILED' } })
    expect(await prisma.tasteItem.findUnique({ where: { id: itemId } })).not.toBeNull()
  })

  it('updateTasteDescription: 저장이 던지면 STORAGE_FAILED', async () => {
    vi.mocked(dal.setTasteDescription).mockRejectedValueOnce(new Error('connection reset'))

    const result = await updateTasteDescription('저장되면 안 됨')

    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_FAILED' } })
    const profile = await prisma.tasteProfile.findUnique({ where: { userId } })
    expect(profile?.description).toBeNull()
  })

  it('redirect 예외는 삼키지 않고 그대로 다시 던진다 — Next 가 처리한다', async () => {
    vi.mocked(dal.findTasteItemById).mockRejectedValueOnce(redirectLikeError('/onboarding'))

    await expect(deleteTasteItem(itemId)).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/onboarding;307;',
    })
    expect(consoleError).not.toHaveBeenCalled()
  })
})
