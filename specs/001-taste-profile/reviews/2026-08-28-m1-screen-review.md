# M1 화면 리뷰 — 구현 vs 화면 명세서

**작성일**: 2026-08-28 · **리뷰어**: H · **대상 커밋**: `aaddf50` (ReDocu)
**기준 문서**: [`design/spec/2026-08-26-screen-spec.md`](../../../design/spec/2026-08-26-screen-spec.md) §6 SCR-M1 · [`.specify/memory/constitution.md`](../../../.specify/memory/constitution.md)

---

## 요약

화면 구조와 접근성은 명세를 충실히 따랐다. **막고 있는 문제는 2건**이고 둘 다
"화면이 잘못됐다"가 아니라 **문서끼리 어긋난 것**이 원인이다.

| 심각도 | 건수 |
|---|---|
| 🔴 진행 전 결정 필요 | 2 |
| 🟠 명세 미충족 | 3 |
| 🟡 확인 필요 | 2 |

### 잘 된 것

- **`taste-item-list.tsx`가 진짜 서버 컴포넌트다.** `'use client'` 없이 렌더하고
  행 탭·추가 같은 인터랙션만 클라이언트 자식에게 넘긴다. constitution 원칙 III의 모범 사례다
- **SCR-M1-08과 SCR-M1-09를 별도 컴포넌트로 분리**했다(`TasteItemSheet` / `WishlistItemSheet`).
  명세가 두 화면으로 나눈 이유(위시리스트는 `kind`가 고정)를 정확히 읽었다
- **접근성을 신경 썼다** — `useId`, `fieldset`/`legend`, `aria-label`, `labelledBy`,
  `sr-only`, 장식 요소 `aria-hidden`. 스크린리더 라벨이 구현 단계 과제로 남아 있었는데 이미 들어갔다
- **삭제 확인 다이얼로그가 분리**돼 있다. `/speckit-analyze` I2에서 지시한 구조 그대로다
- 대분류 검색 필터(T028), 빈 상태 안내(T038), 서술 유도 문구가 전부 명세대로 들어갔다

---

## 🔴 R1 · `memo` 필드가 DB에 없다

**증상**: 폼 두 개가 `memo`를 입력받는다.

- `TasteItemSheet` — "메모 (선택) / 예) 이미 3개 있어요"
- `WishlistItemSheet` — "왜 원하는지 (선택) / 예) 요즘 커피에 빠졌어요"

그런데 `prisma/schema.prisma`의 `TasteItem`에 **`memo` 컬럼이 없다.**

**원인**: 화면 명세서는 2026-08-26에 작성됐고 `memo`를 전제한다(SCR-M1-08, SCR-M1-09).
그 다음날 `/speckit-clarify` Q4에서 **`memo`를 제거하기로 결정**했다 — 상세(`detail`)·취향
서술(`description`)과 용도가 겹치고 입력 부담만 늘린다는 이유였다. 화면 명세서가 그 결정보다
하루 앞선다.

**지금 안 터지는 이유**: 목업(`lib/mock/taste-data.ts`)에 `memo`가 있어서 화면이 돌아간다.
**DAL을 연결하는 순간 사용자가 적은 메모가 조용히 사라진다.** 에러도 안 난다.

**결정 필요**

| | 안 | 비용 |
|---|---|---|
| A | **폼에서 `memo` 제거** — clarify 결정 유지 | 입력 칸 2개 삭제. 화면 명세서 SCR-M1-08·09 수정 |
| B | **`memo` 되살리기** — 화면 명세 유지 | 마이그레이션 1건 + `spec.md`·`data-model.md`·계약 되돌리기 |

> `WishlistItemSheet`의 "왜 원하는지"는 A를 고르면 갈 곳이 없다. 위시리스트 항목에서
> 이유를 적는 자리가 사라진다는 뜻이라, 이 화면만 놓고 보면 B가 자연스럽다.
> 반대로 clarify에서 A를 고른 근거(입력 부담 → R2 위험)도 여전히 유효하다. **팀 결정이 필요하다.**

---

## 🔴 R2 · 모순 검증 시점이 명세와 다르다

**명세** (SCR-M1-08):

> **모순 검증은 저장 시점이 아니라 카테고리 선택 직후에 띄운다.**
> 다 적고 나서 막히면 입력을 통째로 버리게 된다.

**구현**: `handleSave`에서 카테고리 미선택만 검사한다. 모순 검증(같은 카테고리의
`want` ↔ `unwanted` 공존)은 아예 없다.

Server Action(T027)이 아직 없어서 못 한 것이라 지금 시점에는 자연스럽다. 다만 **연결할 때
시점을 명세대로 잡아야 한다** — `onChange`에서 카테고리가 바뀌는 순간 검사해야 하고, 저장
버튼에 붙이면 명세가 막으려던 상황이 그대로 발생한다.

`lib/validation/taste-item.ts`에 모순 검사가 이미 구현돼 있으므로, 서버 왕복 없이 클라이언트에서
기존 항목 목록과 대조하는 방식도 가능하다.

---

## 🟠 R3 · 중복·모순 에러 메시지가 없다

명세가 문구까지 지정해 뒀는데 구현에 없다.

| 위반 | 명세 문구 |
|---|---|
| `(profile_id, kind, category_id, detail)` 중복 | "이미 같은 항목이 있어요" |
| `want` ↔ `unwanted` 공존 | "'텀블러'를 원하는 것에 이미 넣어두셨어요. 한쪽만 남겨주세요." |

두 번째 문구는 **어떤 항목과 충돌하는지 이름을 넣는다**. 계약의 `conflictWith` 필드가
그걸 위해 존재한다(`contracts/server-actions.md`). Server Action 연결 시 함께 붙여야 한다.

---

## 🟠 R4 · `원하는 것` 항목을 삭제할 수 없다

`TasteItemSheet`에는 편집 모드에서 `삭제` 버튼이 있다. **`WishlistItemSheet`에는 없다.**

SCR-M1-07은 세 섹션 모두 "항목 스와이프 → 삭제 (hard delete)"를 전제한다.
현재 구조에서는 `want` 항목을 한 번 넣으면 지울 방법이 없다.

---

## 🟠 R5 · 스와이프 삭제가 없다

**명세**: SCR-M1-07 "항목 스와이프 → 삭제"
**구현**: 행 탭 → 편집 시트 → 삭제 버튼 → 확인 다이얼로그

기능에는 도달하지만 명세보다 두 단계 깊다. 스와이프를 구현하든 명세를 현재 흐름으로
수정하든 **한쪽을 맞춰야 한다.** 개인적으로는 현재 흐름이 모바일에서 오조작이 적어
명세를 고치는 쪽을 권한다 — 스와이프 삭제는 되돌릴 수 없는 동작에 쓰기엔 위험하다.

---

## 🟡 R6 · `taste-item-form.tsx`에 버튼 컴포넌트가 들어 있다

282줄에 컴포넌트 4개가 있다 — `TasteItemSheet` · `WishlistItemSheet` ·
`AddTasteItemButton` · `TasteItemRowButton`.

constitution의 500줄 기준은 넘지 않았다. 다만 서버 컴포넌트인 `taste-item-list.tsx`가
**"form" 파일에서 버튼을 import**하는 구조라 파일 이름과 책임이 어긋난다. T056(컴포넌트 크기
점검) 시점에 `taste-item-actions.tsx` 같은 이름으로 버튼 2개를 떼는 것을 검토한다.

---

## 🟡 R7 · 우리 태스크 T057의 숫자가 틀렸다

T057은 `'use client'`를 **4개**(폼·선택기·서술 편집기·삭제 확인)로 한정해 점검하라고 한다.
실제는 **8개**다.

| 파일 | 판정 |
|---|---|
| `category-picker` · `taste-item-form` · `description-editor` · `delete-confirm-dialog` | ✅ 계획대로 |
| `app/onboarding/error.tsx` · `app/taste/error.tsx` | ✅ **Next.js가 강제한다** — `error.tsx`는 반드시 클라이언트 컴포넌트여야 한다 |
| `app/onboarding/onboarding-flow.tsx` · `app/signup/profile/profile-form.tsx` | ⚠️ 계획에 없던 화면. 입력 상태가 필요하므로 타당하나 태스크에 없다 |

**위반이 아니라 우리 태스크가 `error.tsx`를 세지 않은 것이다.** T057의 기준을 고쳐야 한다.

---

## 조치 요약

| # | 담당 | 시점 |
|---|---|---|
| R1 `memo` | **팀 결정** | 🔴 DAL 연결 전 |
| R2 모순 검증 시점 | J (T027 연결 시) | 🔴 Server Action 붙일 때 |
| R3 에러 메시지 | J (T027 연결 시) | 🟠 함께 |
| ~~R4 위시리스트 삭제~~ | H | ✅ **완료** — `WishlistItemSheet`에 삭제 버튼 + 확인 다이얼로그 추가 |
| R5 스와이프 | **팀 결정** (명세 수정 권장) | 🟠 |
| R6 파일 분리 | H | 🟡 T056 |
| ~~R7 T057 기준~~ | H | ✅ **완료** — `tasks.md`·`plan.md`·`contracts` 세 곳 갱신 |

**R1이 가장 급하다.** DAL이 붙는 순간 데이터가 조용히 유실되는 유일한 항목이다.
