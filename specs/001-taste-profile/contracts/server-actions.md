# Contract: DAL & Server Actions

**Date**: 2026-08-27 | **Plan**: [../plan.md](../plan.md)

이 기능이 노출하는 인터페이스는 REST 엔드포인트가 아니라 **Server Action**과 **DAL 함수**다.
Next.js 16 App Router에서 읽기는 Server Component가 DAL을 직접 호출하고, 쓰기는 Server Action이
받는다. 따라서 계약의 단위도 그 둘이다.

## 공통 반환 형태

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError }

type ActionError = {
  code: ActionErrorCode
  message: string            // 사용자에게 보일 수 있는 문구
  conflictWith?: {           // CONTRADICTORY_ITEM / DUPLICATE_ITEM 일 때만
    itemId: string
    kind: TasteKind
    categoryName: string
    detail: string | null
  }
}

type ActionErrorCode =
  | 'UNAUTHENTICATED'      // 세션 없음
  | 'ONBOARDING_REQUIRED'  // FR-018
  | 'VALIDATION_FAILED'    // Zod 스키마 위반
  | 'CATEGORY_NOT_FOUND'   // FR-004 — 마스터에 없는 대분류
  | 'DUPLICATE_ITEM'       // FR-011
  | 'CONTRADICTORY_ITEM'   // FR-010
  | 'ITEM_LIMIT_EXCEEDED'  // FR-020 — 종류별 100건 상한
  | 'ITEM_NOT_FOUND'
  | 'FORBIDDEN'            // FR-002 — 타인 소유 항목
  | 'STORAGE_FAILED'       // FR-016
```

**예외를 던지지 않고 결과로 돌려주는 이유**: FR-016이 "저장 실패 시 사용자에게 알리고 입력
내용을 보존"할 것을 요구한다. 예외로 던지면 `error.tsx` 경계가 화면을 갈아치우면서 사용자가
입력하던 내용이 사라진다. 예상 가능한 실패는 값으로, 예상 못 한 실패만 예외로 둔다.

---

## DAL — `lib/dal/*`

**모든 데이터 접근은 반드시 이 층을 지난다.** R4에서 정한 대로 M1에는 RLS라는 2차 방어선이
없으므로, `lib/prisma.ts`를 컴포넌트나 Server Action에서 직접 임포트하지 않는다.

### `verifySession(): Promise<Session>`

React `cache()`로 메모이즈한다 — 한 렌더 패스에서 여러 컴포넌트가 호출해도 조회는 1회다.

| | |
|---|---|
| 성공 | `{ userId: string }` |
| 세션 없음 | `/login`으로 `redirect()` |
| 부수효과 | `User` 행이 없으면 생성한다 (get-or-create, R2) |

### `requireOnboarded(): Promise<TasteProfileSummary>`

**FR-018의 권위 있는 판정 지점.** 취향 데이터를 필요로 하는 모든 진입점이 이 함수를 부른다.

| | |
|---|---|
| 성공 | `{ profileId: string; onboardedAt: Date }` |
| 온보딩 미완료 | `/onboarding`으로 `redirect()` |
| 세션 없음 | `verifySession()`이 먼저 처리 |

### `getTasteProfile(): Promise<TasteProfileView>`

본인 프로필과 취향 서술을 반환한다. 인가를 통과한 결과만 나오므로 호출부에 소유자 검사가 없다. `getTasteItemsByKind()`와 같은 파일(`lib/dal/taste.ts`)에 함께 구현한다 — tasks.md T031.

### `getTasteItemsByKind(): Promise<Record<TasteKind, TasteItemView[]>>`

FR-012 — 종류별로 묶인 형태로 반환한다. 화면이 그룹핑 로직을 갖지 않게 한다.

### `getCategories(): Promise<CategoryView[]>`

`sortOrder` 순. FR-005의 평면 목록. 순서가 묶음별로 붙어 있어 화면에서 비슷한
것끼리 자연히 뭉쳐 보인다 — 묶음은 DB에 저장하지 않는다 (categories.md §3).

---

## Server Actions — `app/taste/actions.ts`

모든 Action은 진입 즉시 `requireOnboarded()`를 호출한다(온보딩 화면에서 쓰는
`createTasteItem`은 예외 — 아래 참조).

### `createTasteItem(input): Promise<ActionResult<{ itemId: string }>>`

```ts
input: {
  kind: 'WANT' | 'HAVE' | 'UNWANTED'
  categoryId: string
  detail?: string | null      // FR-006 — 선택
}
```

| 검사 | 순서 | 실패 코드 | 대응 |
|---|---|---|---|
| 세션 | 1 | `UNAUTHENTICATED` | |
| 입력 스키마 | 2 | `VALIDATION_FAILED` | |
| 대분류 존재 | 3 | `CATEGORY_NOT_FOUND` | FR-004 |
| 모순 검사 | 4 | `CONTRADICTORY_ITEM` + `conflictWith` | FR-010 |
| 중복 검사 | 5 | `DUPLICATE_ITEM` + `conflictWith` | FR-011 |
| 상한 검사 | 6 | `ITEM_LIMIT_EXCEEDED` (현재 개수와 상한을 함께 반환) | FR-020 |
| 저장 | 7 | `STORAGE_FAILED` | FR-016 |

- **온보딩 게이트를 타지 않는다.** 온보딩 화면에서 쓰이는 유일한 Action이기 때문이다.
  대신 `verifySession()`은 반드시 통과한다
- 저장 후 `kind ∈ {HAVE, UNWANTED}`이고 `onboardedAt`이 `NULL`이면 그 값을 설정한다 (FR-008)
- 중복 검사는 애플리케이션에서 먼저 하되, **경합은 DB 제약 C2가 막는다.** 유니크 위반 예외를
  잡아 `DUPLICATE_ITEM`으로 변환한다 — 검사와 저장 사이의 틈을 애플리케이션 검사만으로는
  닫을 수 없다

### `updateTasteItem(itemId, input): Promise<ActionResult<void>>`

FR-013. 입력은 `createTasteItem`과 같고 부분 수정을 허용한다.

- 소유자 검사 → 아니면 `FORBIDDEN` (FR-002)
- 모순·중복 검사를 **수정 후 상태 기준**으로 다시 수행한다
- `kind`를 `HAVE`/`UNWANTED`에서 `WANT`로 바꿔 온보딩 조건이 깨지면 `onboardedAt`을 `NULL`로 되돌린다

### `deleteTasteItem(itemId): Promise<ActionResult<void>>`

FR-014. hard delete이며 복구하지 않는다.

- 소유자 검사 → 아니면 `FORBIDDEN`
- 삭제 후 `HAVE`/`UNWANTED`가 0건이면 `onboardedAt`을 `NULL`로 되돌린다 (US4 시나리오 3)
- **삭제 확인은 클라이언트 책임**이다. Action은 확인 없이 호출되면 그대로 지운다 —
  확인 UI를 서버 계약에 섞지 않는다

### `updateTasteDescription(text): Promise<ActionResult<void>>`

FR-007. 빈 문자열은 `NULL`로 정규화한다 — FR-015의 작성률 집계가 빈 문자열을 "작성함"으로
세지 않게 하기 위함이다(R7).

---

## 화면 계약

| 경로 | 렌더링 | 게이트 | 스토리 |
|---|---|---|---|
| `/login` | Server Component | 없음 | FR-019 — 소셜 로그인 1종 |
| `/onboarding` | Server Component | `verifySession()` | US1 |
| `/taste` | Server Component | `requireOnboarded()` | US1·US2·US3·US4 |
| `/auth/callback` | Route Handler | 없음 | Supabase Auth 콜백 |

`proxy.ts`는 세션 쿠키 존재 여부만 보고 미인증 요청을 `/login`으로 보낸다. **온보딩 여부는
판정하지 않는다** — 쿠키에 없는 DB 상태이며, Proxy에서 DB를 조회하지 말라는 것이 Next.js 16
문서의 지침이다(R1).

## 클라이언트 경계

이 기능에서 `'use client'`를 **설계상 선택해서** 붙이는 것은 아래 넷뿐이다(constitution 원칙 III).
`app/*/error.tsx`도 클라이언트 컴포넌트지만 그것은 선택이 아니라 **Next.js의 요구사항**이므로 이 표에서 세지 않는다.

| 컴포넌트 | 이유 |
|---|---|
| `taste-item-form.tsx` | 입력 상태와 `useActionState` |
| `category-picker.tsx` | 선택 상태와 검색 필터 |
| `description-editor.tsx` | 입력 상태와 저장 상태 표시 |
| `delete-confirm-dialog.tsx` | 삭제 확인 상태. 목록 전체를 클라이언트로 내리지 않기 위해 분리 |

목록 렌더(`taste-item-list.tsx`)는 Server Component다. 데이터를 클라이언트로 보내고 거기서
거르는 구조는 constitution 데이터 보호 조항과 충돌한다.
