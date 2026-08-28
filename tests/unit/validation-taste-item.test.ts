/**
 * T019 — lib/validation/taste-item.ts 단위 테스트
 *
 *  - Zod 입력 스키마: 형식 검증 + detail 정규화(트림, 빈 문자열 → null)
 *  - findContradiction: FR-010 (C3) — 같은 대분류에서 상세 없는 WANT ↔ UNWANTED 공존 금지,
 *    어떤 항목과 충돌하는지 반환해 사용자에게 알린다
 *  - findDuplicate: FR-011 (C2 선제 검사) — 동일 (종류, 대분류, 상세) 조합.
 *    NULL 은 NULL 과 같다 (DB 제약의 NULLS NOT DISTINCT 와 같은 의미)
 *  - isKindAtLimit: FR-020 — 종류별 100건 상한
 */
import { describe, expect, it } from 'vitest'
import {
  TASTE_ITEM_LIMIT_PER_KIND,
  findContradiction,
  findDuplicate,
  isKindAtLimit,
  tasteItemInputSchema,
  type ExistingTasteItem,
} from '@/lib/validation/taste-item'

const CATEGORY_ID = '0b9f8a1e-1111-4222-8333-444455556666'
const OTHER_CATEGORY_ID = '1c8e7b2f-2222-4333-8444-555566667777'

function makeItem(overrides: Partial<ExistingTasteItem>): ExistingTasteItem {
  return {
    id: 'item-1',
    kind: 'HAVE',
    categoryId: CATEGORY_ID,
    detail: null,
    ...overrides,
  }
}

describe('tasteItemInputSchema', () => {
  it('유효한 입력을 통과시킨다', () => {
    const parsed = tasteItemInputSchema.parse({
      kind: 'HAVE',
      categoryId: CATEGORY_ID,
      detail: '스타벅스 텀블러',
    })
    expect(parsed).toEqual({ kind: 'HAVE', categoryId: CATEGORY_ID, detail: '스타벅스 텀블러' })
  })

  it('알 수 없는 kind 를 거부한다', () => {
    const result = tasteItemInputSchema.safeParse({ kind: 'MAYBE', categoryId: CATEGORY_ID })
    expect(result.success).toBe(false)
  })

  it('UUID 가 아닌 categoryId 를 거부한다', () => {
    const result = tasteItemInputSchema.safeParse({ kind: 'HAVE', categoryId: 'cat-1' })
    expect(result.success).toBe(false)
  })

  it('detail 을 트림한다', () => {
    const parsed = tasteItemInputSchema.parse({
      kind: 'HAVE',
      categoryId: CATEGORY_ID,
      detail: '  스타벅스 텀블러  ',
    })
    expect(parsed.detail).toBe('스타벅스 텀블러')
  })

  it('빈 문자열 detail 을 null 로 정규화한다 — C2 중복 판정이 빈 문자열과 NULL 을 다르게 세지 않게', () => {
    const parsed = tasteItemInputSchema.parse({
      kind: 'HAVE',
      categoryId: CATEGORY_ID,
      detail: '   ',
    })
    expect(parsed.detail).toBeNull()
  })

  it('detail 을 생략하면 null 이 된다 (FR-006 — 상세는 선택)', () => {
    const parsed = tasteItemInputSchema.parse({ kind: 'HAVE', categoryId: CATEGORY_ID })
    expect(parsed.detail).toBeNull()
  })

  it('과도하게 긴 detail 을 거부한다', () => {
    const result = tasteItemInputSchema.safeParse({
      kind: 'HAVE',
      categoryId: CATEGORY_ID,
      detail: '가'.repeat(201),
    })
    expect(result.success).toBe(false)
  })
})

describe('findContradiction — FR-010 (C3)', () => {
  it('상세 없는 WANT 등록 시 같은 대분류의 상세 없는 UNWANTED 를 충돌로 반환한다', () => {
    const existing = makeItem({ id: 'conflict', kind: 'UNWANTED', detail: null })
    const found = findContradiction(
      { kind: 'WANT', categoryId: CATEGORY_ID, detail: null },
      [existing],
    )
    expect(found).toEqual(existing)
  })

  it('상세 없는 UNWANTED 등록 시 같은 대분류의 상세 없는 WANT 를 충돌로 반환한다', () => {
    const existing = makeItem({ id: 'conflict', kind: 'WANT', detail: null })
    const found = findContradiction(
      { kind: 'UNWANTED', categoryId: CATEGORY_ID, detail: null },
      [existing],
    )
    expect(found).toEqual(existing)
  })

  it('HAVE 는 모순 검사 대상이 아니다', () => {
    const existing = makeItem({ kind: 'WANT', detail: null })
    expect(
      findContradiction({ kind: 'HAVE', categoryId: CATEGORY_ID, detail: null }, [existing]),
    ).toBeNull()
  })

  it('입력에 상세가 있으면 모순이 아니다 — C3 는 상세 없는 항목끼리만 본다', () => {
    const existing = makeItem({ kind: 'UNWANTED', detail: null })
    expect(
      findContradiction({ kind: 'WANT', categoryId: CATEGORY_ID, detail: '특정 상품' }, [existing]),
    ).toBeNull()
  })

  it('기존 항목에 상세가 있으면 모순이 아니다', () => {
    const existing = makeItem({ kind: 'UNWANTED', detail: '특정 상품' })
    expect(
      findContradiction({ kind: 'WANT', categoryId: CATEGORY_ID, detail: null }, [existing]),
    ).toBeNull()
  })

  it('다른 대분류는 모순이 아니다', () => {
    const existing = makeItem({ kind: 'UNWANTED', categoryId: OTHER_CATEGORY_ID, detail: null })
    expect(
      findContradiction({ kind: 'WANT', categoryId: CATEGORY_ID, detail: null }, [existing]),
    ).toBeNull()
  })
})

describe('findDuplicate — FR-011 (C2)', () => {
  it('동일 (종류, 대분류, 상세=null) 조합을 중복으로 반환한다', () => {
    const existing = makeItem({ id: 'dup', kind: 'HAVE', detail: null })
    const found = findDuplicate({ kind: 'HAVE', categoryId: CATEGORY_ID, detail: null }, [existing])
    expect(found).toEqual(existing)
  })

  it('동일 (종류, 대분류, 상세=문자열) 조합을 중복으로 반환한다', () => {
    const existing = makeItem({ id: 'dup', detail: '스타벅스 텀블러' })
    const found = findDuplicate(
      { kind: 'HAVE', categoryId: CATEGORY_ID, detail: '스타벅스 텀블러' },
      [existing],
    )
    expect(found).toEqual(existing)
  })

  it('상세가 다르면 중복이 아니다', () => {
    const existing = makeItem({ detail: '스타벅스 텀블러' })
    expect(
      findDuplicate({ kind: 'HAVE', categoryId: CATEGORY_ID, detail: null }, [existing]),
    ).toBeNull()
  })

  it('종류가 다르면 중복이 아니다', () => {
    const existing = makeItem({ kind: 'UNWANTED', detail: null })
    expect(
      findDuplicate({ kind: 'HAVE', categoryId: CATEGORY_ID, detail: null }, [existing]),
    ).toBeNull()
  })
})

describe('isKindAtLimit — FR-020', () => {
  it('같은 종류가 상한 미만이면 false', () => {
    const existing = Array.from({ length: TASTE_ITEM_LIMIT_PER_KIND - 1 }, (_, i) =>
      makeItem({ id: `item-${i}`, detail: `상세 ${i}` }),
    )
    expect(isKindAtLimit('HAVE', existing)).toBe(false)
  })

  it('같은 종류가 상한에 도달하면 true', () => {
    const existing = Array.from({ length: TASTE_ITEM_LIMIT_PER_KIND }, (_, i) =>
      makeItem({ id: `item-${i}`, detail: `상세 ${i}` }),
    )
    expect(isKindAtLimit('HAVE', existing)).toBe(true)
  })

  it('다른 종류의 개수는 세지 않는다', () => {
    const existing = Array.from({ length: TASTE_ITEM_LIMIT_PER_KIND }, (_, i) =>
      makeItem({ id: `item-${i}`, kind: 'WANT', detail: `상세 ${i}` }),
    )
    expect(isKindAtLimit('HAVE', existing)).toBe(false)
  })
})
