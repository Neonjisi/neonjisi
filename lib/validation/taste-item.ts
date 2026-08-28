import { z } from 'zod'

/**
 * T019 — 취향 항목 입력 검증 (spec.md FR-010·FR-011·FR-020, data-model.md C3·C7)
 *
 * DB 를 모르는 순수 함수만 둔다. 기존 항목 조회는 DAL 이 하고,
 * 판정만 여기서 한다 — Server Action(T027)이 이 순서로 부른다:
 * 세션 → 스키마 → 대분류 존재 → 모순 → 중복 → 상한 → 저장.
 */

export const TASTE_ITEM_LIMIT_PER_KIND = 100 // FR-020

// 화면이 한 줄 입력으로 받는 값의 방어적 상한 — 스펙에 길이 규정은 없다.
const DETAIL_MAX_LENGTH = 200

export const tasteKindSchema = z.enum(['WANT', 'HAVE', 'UNWANTED'])
export type TasteKindInput = z.infer<typeof tasteKindSchema>

/**
 * detail 정규화: 트림 후 빈 문자열은 null.
 * 빈 문자열을 저장하면 C2 중복 판정과 FR-015 집계가 NULL 과 다른 값으로 세므로
 * 경계에서 통일한다 (FR-006 — 상세는 선택).
 */
export const tasteItemInputSchema = z.object({
  kind: tasteKindSchema,
  categoryId: z.uuid(),
  detail: z
    .string()
    .trim()
    .max(DETAIL_MAX_LENGTH)
    .nullish()
    .transform((value) => (value ? value : null)),
})

export type TasteItemInput = z.infer<typeof tasteItemInputSchema>

/** 판정에 필요한 최소 형태 — DAL 조회 결과가 이 모양이면 된다 */
export type ExistingTasteItem = {
  id: string
  kind: TasteKindInput
  categoryId: string
  detail: string | null
}

const CONTRADICTION_PAIR: Partial<Record<TasteKindInput, TasteKindInput>> = {
  WANT: 'UNWANTED',
  UNWANTED: 'WANT',
}

/**
 * FR-010 (C3) — 같은 대분류에서 상세 없는 WANT 와 UNWANTED 는 공존할 수 없다.
 * 충돌하는 기존 항목을 반환한다 — 스펙이 "어떤 항목과 충돌하는지 알린다"를 요구한다.
 * 상세가 있는 항목은 대상이 아니다 (특정 상품을 원하면서 대분류 전체는 사양할 수 있다).
 */
export function findContradiction(
  input: Pick<TasteItemInput, 'kind' | 'categoryId' | 'detail'>,
  existingItems: readonly ExistingTasteItem[],
): ExistingTasteItem | null {
  const conflictingKind = CONTRADICTION_PAIR[input.kind]
  if (!conflictingKind || input.detail !== null) return null

  return (
    existingItems.find(
      (item) =>
        item.kind === conflictingKind &&
        item.categoryId === input.categoryId &&
        item.detail === null,
    ) ?? null
  )
}

/**
 * FR-011 (C2 선제 검사) — 동일 (종류, 대분류, 상세) 조합의 중복.
 * null 은 null 과 같은 값으로 본다 (DB 제약의 NULLS NOT DISTINCT 와 동일 의미).
 * 최종 방어선은 DB 유니크 제약이고, 여기서는 사용자에게 먼저 알리기 위해 검사한다.
 */
export function findDuplicate(
  input: Pick<TasteItemInput, 'kind' | 'categoryId' | 'detail'>,
  existingItems: readonly ExistingTasteItem[],
): ExistingTasteItem | null {
  return (
    existingItems.find(
      (item) =>
        item.kind === input.kind &&
        item.categoryId === input.categoryId &&
        item.detail === input.detail,
    ) ?? null
  )
}

/** FR-020 (C7) — 같은 종류의 항목이 상한(100건)에 도달했는가 */
export function isKindAtLimit(
  kind: TasteKindInput,
  existingItems: readonly ExistingTasteItem[],
): boolean {
  const count = existingItems.filter((item) => item.kind === kind).length
  return count >= TASTE_ITEM_LIMIT_PER_KIND
}
