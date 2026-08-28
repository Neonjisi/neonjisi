import { cache } from 'react'
import type { TasteKind } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'

/**
 * 취향 DAL (T026·T031) — 계약: specs/001-taste-profile/contracts/server-actions.md
 *
 * 읽기 함수는 내부에서 세션을 검증하고 본인 데이터만 반환한다 —
 * 호출부(화면)에 소유자 검사가 없다. 쓰기 프리미티브는 Server Action 전용이며,
 * profileId 는 항상 세션에서 얻은 본인 것만 전달된다.
 */

/** group 은 화면 표시용 묶음 이름표 — 선택 대상이 아니다 (categories.md §3) */
export type CategoryView = { id: string; name: string; group: string }

export type TasteItemView = {
  id: string
  kind: TasteKind
  categoryId: string
  categoryName: string
  detail: string | null
}

export type TasteItemsByKind = Record<TasteKind, TasteItemView[]>

export type TasteProfileView = {
  profileId: string
  description: string | null
  onboardedAt: Date | null
}

/** FR-005 — sortOrder 순 평면 목록 (T026). 같은 묶음이 자연히 연속된다 */
export const getCategories = cache(async (): Promise<CategoryView[]> => {
  return prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, group: true },
  })
})

function toProfileView(profile: {
  id: string
  description: string | null
  onboardedAt: Date | null
}): TasteProfileView {
  return {
    profileId: profile.id,
    description: profile.description,
    onboardedAt: profile.onboardedAt,
  }
}

/**
 * 본인 프로필 get-or-create. 온보딩 진입 시점에는 프로필이 아직 없을 수 있다.
 * 경합(동시 요청)은 userId 유니크가 막고, P2002 면 이미 만들어진 것이므로 다시 읽는다.
 */
export const getOrCreateTasteProfile = cache(async (): Promise<TasteProfileView> => {
  const { userId } = await verifySession()

  const existing = await prisma.tasteProfile.findUnique({ where: { userId } })
  if (existing) return toProfileView(existing)

  try {
    return toProfileView(await prisma.tasteProfile.create({ data: { userId } }))
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2002') throw e
    return toProfileView(await prisma.tasteProfile.findUniqueOrThrow({ where: { userId } }))
  }
})

/** 본인 프로필과 취향 서술 (T031) */
export const getTasteProfile = cache(async (): Promise<TasteProfileView> => {
  return getOrCreateTasteProfile()
})

/** FR-012 — 종류별로 묶어 반환한다. 화면이 그룹핑 로직을 갖지 않게 (T031) */
export const getTasteItemsByKind = cache(async (): Promise<TasteItemsByKind> => {
  const { profileId } = await getOrCreateTasteProfile()
  const items = await prisma.tasteItem.findMany({
    where: { profileId },
    orderBy: { createdAt: 'asc' },
    include: { category: { select: { name: true } } },
  })

  const grouped: TasteItemsByKind = { WANT: [], HAVE: [], UNWANTED: [] }
  for (const item of items) {
    grouped[item.kind].push({
      id: item.id,
      kind: item.kind,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      detail: item.detail,
    })
  }
  return grouped
})

// ── 이하 쓰기 프리미티브 — app/taste/actions.ts 전용 ──────────────────────────

export type TasteItemSnapshot = TasteItemView

/** 검증(모순·중복·상한)에 쓰는 현재 항목 스냅샷. 캐시하지 않는다 — 쓰기 직전 최신 상태가 필요하다 */
export async function listTasteItemSnapshots(profileId: string): Promise<TasteItemSnapshot[]> {
  const items = await prisma.tasteItem.findMany({
    where: { profileId },
    include: { category: { select: { name: true } } },
  })
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    detail: item.detail,
  }))
}

export async function findCategoryById(categoryId: string): Promise<CategoryView | null> {
  return prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, group: true },
  })
}

/**
 * 항목 저장 + 온보딩 판정(FR-008)을 한 트랜잭션으로.
 * kind ∈ {HAVE, UNWANTED} 인 첫 항목이 생기면 onboardedAt 을 설정한다.
 * C2 유니크 위반(P2002)은 호출부(액션)가 DUPLICATE_ITEM 으로 변환한다.
 */
export async function insertTasteItem(
  profileId: string,
  input: { kind: TasteKind; categoryId: string; detail: string | null },
): Promise<{ itemId: string }> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.tasteItem.create({
      data: { profileId, kind: input.kind, categoryId: input.categoryId, detail: input.detail },
      select: { id: true },
    })
    if (input.kind === 'HAVE' || input.kind === 'UNWANTED') {
      await tx.tasteProfile.updateMany({
        where: { id: profileId, onboardedAt: null },
        data: { onboardedAt: new Date() },
      })
    }
    return { itemId: item.id }
  })
}

export type OwnedTasteItem = TasteItemSnapshot & { profileId: string }

/** 소유자 검사용 단건 조회 — 소유 여부 판정은 호출부(액션)가 profileId 비교로 한다 */
export async function findTasteItemById(itemId: string): Promise<OwnedTasteItem | null> {
  const item = await prisma.tasteItem.findUnique({
    where: { id: itemId },
    include: { category: { select: { name: true } } },
  })
  if (!item) return null
  return {
    id: item.id,
    profileId: item.profileId,
    kind: item.kind,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    detail: item.detail,
  }
}

/**
 * 온보딩 파생 상태 재계산 (FR-008, US4-3) — 쓰기 트랜잭션 안에서만 부른다.
 * HAVE/UNWANTED 가 1건 이상이면 onboardedAt 을 설정(없을 때만), 0건이면 NULL 로 되돌린다.
 */
async function syncOnboardedAt(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  profileId: string,
): Promise<void> {
  const count = await tx.tasteItem.count({
    where: { profileId, kind: { in: ['HAVE', 'UNWANTED'] } },
  })
  if (count > 0) {
    await tx.tasteProfile.updateMany({
      where: { id: profileId, onboardedAt: null },
      data: { onboardedAt: new Date() },
    })
  } else {
    await tx.tasteProfile.update({ where: { id: profileId }, data: { onboardedAt: null } })
  }
}

/** FR-013 — 항목 수정 + 온보딩 재판정을 한 트랜잭션으로. P2002 는 호출부가 변환한다 */
export async function updateTasteItemRecord(
  profileId: string,
  itemId: string,
  data: { kind: TasteKind; categoryId: string; detail: string | null },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.tasteItem.update({ where: { id: itemId }, data })
    await syncOnboardedAt(tx, profileId)
  })
}

/** FR-014 — hard delete + 온보딩 재판정을 한 트랜잭션으로 (US4-3) */
export async function deleteTasteItemRecord(profileId: string, itemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.tasteItem.delete({ where: { id: itemId } })
    await syncOnboardedAt(tx, profileId)
  })
}

/** FR-007 — 취향 서술 저장. 정규화(빈 문자열 → null)는 호출부(액션)가 한다 */
export async function setTasteDescription(
  profileId: string,
  description: string | null,
): Promise<void> {
  await prisma.tasteProfile.update({
    where: { id: profileId },
    data: { description },
  })
}
