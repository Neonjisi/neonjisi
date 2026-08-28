'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { DELETE_FAILED_MESSAGE, SAVE_FAILED_MESSAGE } from '@/lib/actions/call-action'
import { isRedirectError } from '@/lib/actions/redirect-error'
import { requireOnboarded } from '@/lib/dal/session'
import { josa } from '@/lib/format/josa'
import {
  deleteTasteItemRecord,
  findCategoryById,
  findTasteItemById,
  getOrCreateTasteProfile,
  insertTasteItem,
  listTasteItemSnapshots,
  setTasteDescription,
  updateTasteItemRecord,
  type OwnedTasteItem,
  type TasteItemSnapshot,
} from '@/lib/dal/taste'
import {
  DESCRIPTION_MAX_LENGTH,
  TASTE_ITEM_LIMIT_PER_KIND,
  findContradiction,
  findDuplicate,
  isKindAtLimit,
  normalizeDescription,
  tasteItemInputSchema,
  tasteItemUpdateSchema,
} from '@/lib/validation/taste-item'

/**
 * 취향 Server Actions (T027, T043 선행 구현)
 * 계약: specs/001-taste-profile/contracts/server-actions.md
 *
 * 예상 가능한 실패는 예외가 아니라 결과 값으로 돌려준다 — 예외로 던지면
 * error.tsx 가 화면을 갈아치우면서 입력 내용이 사라진다 (FR-016).
 */

export type ActionErrorCode =
  | 'UNAUTHENTICATED'
  | 'ONBOARDING_REQUIRED'
  | 'VALIDATION_FAILED'
  | 'CATEGORY_NOT_FOUND'
  | 'DUPLICATE_ITEM'
  | 'CONTRADICTORY_ITEM'
  | 'ITEM_LIMIT_EXCEEDED'
  | 'ITEM_NOT_FOUND'
  | 'FORBIDDEN'
  | 'STORAGE_FAILED'

export type ActionError = {
  code: ActionErrorCode
  message: string
  conflictWith?: {
    itemId: string
    kind: TasteItemSnapshot['kind']
    categoryName: string
    detail: string | null
  }
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError }

function failure<T>(error: ActionError): ActionResult<T> {
  return { ok: false, error }
}

function toConflictWith(item: TasteItemSnapshot): NonNullable<ActionError['conflictWith']> {
  return {
    itemId: item.id,
    kind: item.kind,
    categoryName: item.categoryName,
    detail: item.detail,
  }
}

/**
 * 게이트(세션·온보딩) 이후의 본문을 감싸는 방어선 — DAL 조회를 포함해 예상 못 한
 * 예외(DB 단절 등)를 STORAGE_FAILED 로 바꿔 돌려준다. 예외로 새면 클라이언트의
 * error.tsx 가 화면을 갈아치우며 입력이 사라진다 (FR-016). 원인은 서버 로그에 남긴다.
 * redirect 예외만은 Next 가 처리해야 하므로 그대로 다시 던진다.
 */
async function guarded<T>(
  message: string,
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run()
  } catch (e) {
    if (isRedirectError(e)) throw e
    console.error('[taste/actions] 예상 못 한 예외 — STORAGE_FAILED 로 변환', e)
    return failure({ code: 'STORAGE_FAILED', message })
  }
}

/**
 * FR-003 — 취향 항목 등록. 온보딩 화면에서 쓰이는 유일한 Action 이므로
 * requireOnboarded() 를 부르지 않는다 (세션 검증은 프로필 get-or-create 가 수행).
 * 검사 순서: 세션 → 스키마 → 대분류 존재 → 모순 → 중복 → 상한 → 저장.
 */
export async function createTasteItem(
  rawInput: unknown,
): Promise<ActionResult<{ itemId: string }>> {
  const { profileId } = await getOrCreateTasteProfile()

  return guarded(SAVE_FAILED_MESSAGE, async () => {
    const parsed = tasteItemInputSchema.safeParse(rawInput)
    if (!parsed.success) {
      return failure({ code: 'VALIDATION_FAILED', message: '입력 형식이 올바르지 않아요.' })
    }
    const input = parsed.data

    const category = await findCategoryById(input.categoryId)
    if (!category) {
      return failure({ code: 'CATEGORY_NOT_FOUND', message: '존재하지 않는 카테고리예요.' })
    }

    const snapshots = await listTasteItemSnapshots(profileId)

    const contradiction = findContradiction(input, snapshots)
    if (contradiction) {
      const conflictLabel = contradiction.kind === 'WANT' ? '원하는 것' : '관심 없어요'
      return failure({
        code: 'CONTRADICTORY_ITEM',
        message: `'${category.name}'${josa(category.name, '을', '를')} ${conflictLabel}에 이미 넣어두셨어요. 한쪽만 남겨주세요.`,
        conflictWith: toConflictWith(contradiction),
      })
    }

    const duplicate = findDuplicate(input, snapshots)
    if (duplicate) {
      return failure({
        code: 'DUPLICATE_ITEM',
        message: '이미 같은 항목이 있어요.',
        conflictWith: toConflictWith(duplicate),
      })
    }

    if (isKindAtLimit(input.kind, snapshots)) {
      const currentCount = snapshots.filter((item) => item.kind === input.kind).length
      return failure({
        code: 'ITEM_LIMIT_EXCEEDED',
        message: `이 종류는 ${TASTE_ITEM_LIMIT_PER_KIND}개까지 등록할 수 있어요. (현재 ${currentCount}개)`,
      })
    }

    try {
      const { itemId } = await insertTasteItem(profileId, input)
      revalidatePath('/taste')
      return { ok: true, data: { itemId } }
    } catch (e) {
      // 검사와 저장 사이의 경합은 DB 제약 C2 가 막는다 — 유니크 위반을 결과 값으로 변환.
      // 그 외는 guarded 가 STORAGE_FAILED 로 바꾼다.
      if ((e as { code?: string }).code === 'P2002') {
        return failure({ code: 'DUPLICATE_ITEM', message: '이미 같은 항목이 있어요.' })
      }
      throw e
    }
  })
}

/**
 * 소유자 검사 공통부 — itemId 형식 → 존재 → 소유 순으로 확인한다.
 * 소유가 아니면 FORBIDDEN (FR-002). 존재 여부를 소유자에게만 정확히 알린다.
 */
async function findOwnedItem(
  profileId: string,
  itemId: string,
): Promise<ActionResult<OwnedTasteItem>> {
  if (!z.uuid().safeParse(itemId).success) {
    return failure({ code: 'VALIDATION_FAILED', message: '입력 형식이 올바르지 않아요.' })
  }
  const item = await findTasteItemById(itemId)
  if (!item) {
    return failure({ code: 'ITEM_NOT_FOUND', message: '항목을 찾을 수 없어요.' })
  }
  if (item.profileId !== profileId) {
    return failure({ code: 'FORBIDDEN', message: '본인의 항목만 수정할 수 있어요.' })
  }
  return { ok: true, data: item }
}

/**
 * FR-013 — 항목 수정 (T049). 부분 수정을 허용하고,
 * 모순·중복은 **수정 후 상태 기준**으로 재검사한다.
 * kind 변경으로 온보딩 조건이 깨지면 DAL 이 onboardedAt 을 NULL 로 되돌린다.
 */
export async function updateTasteItem(
  itemId: string,
  rawInput: unknown,
): Promise<ActionResult<null>> {
  const { profileId } = await requireOnboarded()

  return guarded(SAVE_FAILED_MESSAGE, async () => {
    const owned = await findOwnedItem(profileId, itemId)
    if (!owned.ok) return owned
    const item = owned.data

    const parsed = tasteItemUpdateSchema.safeParse(rawInput)
    if (!parsed.success) {
      return failure({ code: 'VALIDATION_FAILED', message: '입력 형식이 올바르지 않아요.' })
    }
    const input = parsed.data

    const merged = {
      kind: input.kind ?? item.kind,
      categoryId: input.categoryId ?? item.categoryId,
      detail: input.detail === undefined ? item.detail : input.detail,
    }

    if (merged.categoryId !== item.categoryId) {
      const category = await findCategoryById(merged.categoryId)
      if (!category) {
        return failure({ code: 'CATEGORY_NOT_FOUND', message: '존재하지 않는 카테고리예요.' })
      }
    }

    const others = (await listTasteItemSnapshots(profileId)).filter(
      (snapshot) => snapshot.id !== itemId,
    )

    const contradiction = findContradiction(merged, others)
    if (contradiction) {
      const conflictLabel = contradiction.kind === 'WANT' ? '원하는 것' : '관심 없어요'
      return failure({
        code: 'CONTRADICTORY_ITEM',
        message: `'${contradiction.categoryName}'${josa(contradiction.categoryName, '을', '를')} ${conflictLabel}에 이미 넣어두셨어요. 한쪽만 남겨주세요.`,
        conflictWith: toConflictWith(contradiction),
      })
    }

    const duplicate = findDuplicate(merged, others)
    if (duplicate) {
      return failure({
        code: 'DUPLICATE_ITEM',
        message: '이미 같은 항목이 있어요.',
        conflictWith: toConflictWith(duplicate),
      })
    }

    try {
      await updateTasteItemRecord(profileId, itemId, merged)
      revalidatePath('/taste')
      return { ok: true, data: null }
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        return failure({ code: 'DUPLICATE_ITEM', message: '이미 같은 항목이 있어요.' })
      }
      throw e
    }
  })
}

/**
 * FR-014 — 항목 삭제 (T050). hard delete 이며 복구하지 않는다.
 * 삭제 확인은 클라이언트 책임이다 (delete-confirm-dialog).
 * 마지막 HAVE/UNWANTED 삭제 시 DAL 이 onboardedAt 을 NULL 로 되돌린다 (US4-3).
 */
export async function deleteTasteItem(itemId: string): Promise<ActionResult<null>> {
  const { profileId } = await requireOnboarded()

  return guarded(DELETE_FAILED_MESSAGE, async () => {
    const owned = await findOwnedItem(profileId, itemId)
    if (!owned.ok) return owned

    await deleteTasteItemRecord(profileId, itemId)
    revalidatePath('/taste')
    return { ok: true, data: null }
  })
}

/**
 * FR-007 — 취향 서술 저장. 빈 문자열은 NULL 로 정규화한다 (T043).
 * 계약대로 진입 즉시 requireOnboarded() — 온보딩 3/3 은 2/3 에서 HAVE/UNWANTED 를
 * 저장한 뒤라 게이트를 통과한다. 미완료 사용자의 직접 호출은 FR-018 로 막는다.
 */
export async function updateTasteDescription(rawText: string): Promise<ActionResult<null>> {
  const { profileId } = await requireOnboarded()

  return guarded(SAVE_FAILED_MESSAGE, async () => {
    if (typeof rawText !== 'string' || rawText.length > DESCRIPTION_MAX_LENGTH) {
      return failure({
        code: 'VALIDATION_FAILED',
        message: `취향 서술은 ${DESCRIPTION_MAX_LENGTH}자 이내로 적어주세요.`,
      })
    }

    await setTasteDescription(profileId, normalizeDescription(rawText))
    revalidatePath('/taste')
    return { ok: true, data: null }
  })
}
