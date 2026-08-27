# Data Model: 맞춤 취향 프로필 (M1)

**Date**: 2026-08-27 | **Plan**: [plan.md](./plan.md)

> **범위**: 이 문서는 **마일스톤 1에 해당하는 부분만** 담는다.
> 마일스톤 1~4를 관통하는 전체 도메인 모델은 [`docs/specs/2026-08-26-domain-model.md`](../../docs/specs/2026-08-26-domain-model.md)가
> 원문이며, 상태 전이·접근 제어·M2~M4 스키마는 그쪽을 본다. 여기서 복사하지 않는다.
>
> 해당 원문 구간: §3 M1 — 맞춤 취향

## 엔티티

| 엔티티 | 책임 | 스펙 대응 |
|---|---|---|
| `Category` | 대분류 마스터. 취향과 (M3부터) 상품이 **공유**한다 | FR-004, FR-005 |
| `User` | 계정. PK가 `auth.users.id`와 같은 값 | R2 |
| `TasteProfile` | 한 사용자의 취향 루트. 취향 서술 + 온보딩 완료 시점 | FR-001, FR-007, FR-008 |
| `TasteItem` | 개별 취향 기록 | FR-003, FR-004, FR-006 |

## Prisma 스키마 초안

```prisma
enum TasteKind {
  WANT      // 원하는 것
  HAVE      // 이미 있는 것
  UNWANTED  // 필요 없는 것
}

model User {
  id          String   @id @db.Uuid        // = auth.users.id. 기본값 없음 — 세션에서 받는다
  displayName String
  avatarUrl   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tasteProfile TasteProfile?
}

model TasteProfile {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @unique @db.Uuid    // D1 — 1:1 강제
  description String?                       // 취향 서술. 선택 (FR-007)
  onboardedAt DateTime?                     // FR-008 판정 결과
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user  User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  items TasteItem[]
}

model Category {
  id        String @id @default(uuid()) @db.Uuid
  name      String @unique                  // 멱등 시드(upsert)의 키
  sortOrder Int

  items TasteItem[]

  @@index([sortOrder])
}

model TasteItem {
  id         String    @id @default(uuid()) @db.Uuid
  profileId  String    @db.Uuid
  kind       TasteKind
  categoryId String    @db.Uuid             // 자유 텍스트 금지 (FR-004)
  detail     String?                        // 선택 (FR-006)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  profile  TasteProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  category Category     @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@index([profileId, kind])
  // (profileId, kind, categoryId, detail) 유니크는 NULLS NOT DISTINCT 라 raw SQL — 아래 참조
}
```

**`Category.onDelete: Restrict`인 이유**: 카테고리를 지웠다고 사용자의 취향 기록이 사라지면 안
된다. 참조 중인 카테고리는 삭제가 막혀야 한다.

**`User.id`에 기본값이 없는 이유**: Supabase가 발급한 `auth.users.id`를 그대로 쓴다(R2).
DB가 생성하면 두 시스템의 id가 갈라진다.

> ⚠️ **`User` → `TasteProfile`의 `onDelete: Cascade`는 잠정 결정이다.** 계정 탈퇴 정책은
> M1에서 다루지 않기로 했다(spec.md Out of Scope). 취향 데이터에는 알러지·사이즈가 포함되어
> 민감정보에 해당하므로(PRD Risks R9), 탈퇴 기능을 실제로 만드는 마일스톤에서 보관 기간과
> 복구 가능 여부를 명시적으로 결정하고 이 설정을 재검토한다.

## 제약

| # | 규칙 | 위치 | 대응 |
|---|---|---|---|
| C1 | 사용자당 취향 프로필 1개 | **DB** — `@unique` | FR-001, D1 |
| C2 | `(profileId, kind, categoryId, detail)` 중복 금지 | **DB** — raw SQL | FR-011 |
| C3 | 같은 대분류에서 `detail IS NULL`인 `WANT`와 `UNWANTED` 공존 금지 | **애플리케이션** | FR-010 |
| C4 | 온보딩 완료 판정 | **애플리케이션** (파생 상태) | FR-008 |
| C5 | 대분류는 마스터에서만 | **DB** — FK | FR-004 |
| C6 | 본인 프로필만 쓰기 | **애플리케이션** — DAL | FR-002 |
| C7 | 종류별 취향 항목 **100건 상한** | **애플리케이션** | FR-020 |

### C2 — raw SQL 마이그레이션

Prisma 스키마 문법으로 표현되지 않는다. `prisma migrate dev --create-only`로 마이그레이션을
만든 뒤 아래를 직접 넣는다.

```sql
ALTER TABLE "TasteItem"
  ADD CONSTRAINT "TasteItem_profile_kind_category_detail_key"
  UNIQUE NULLS NOT DISTINCT ("profileId", "kind", "categoryId", "detail");
```

**이 제약이 없으면** 대분류만 지정한 항목 — FR-006에 따라 가장 흔한 형태 — 이 무제한 중복
등록된다. PostgreSQL은 기본적으로 유니크 인덱스에서 NULL을 서로 다른 값으로 보기 때문이다(R3).

### C7 — 애플리케이션 검증인 이유

DB `CHECK`로는 다른 행의 개수를 셀 수 없다. 트리거로 만들 수는 있으나, 상한 초과는
사용자에게 **현재 개수와 상한을 함께 알려야** 하므로 어차피 애플리케이션이 개수를 조회한다.
동시 요청으로 상한을 한두 건 넘길 여지는 남지만, 취향 항목은 금액이 오가지 않아 그 정도
오차가 무해하다 — 중복(C2)을 DB 제약으로 막은 것과 판단 기준이 다른 지점이다.

### C3 — 애플리케이션 검증인 이유

두 행에 걸친 조건부 규칙이라 단일 제약으로 표현되지 않는다. 더 중요한 것은 FR-010이
**어떤 기존 항목과 충돌하는지 사용자에게 알릴 것**을 요구한다는 점이다. 그러려면 어차피
애플리케이션이 충돌 항목을 조회해야 하므로, DB 제약을 추가해도 중복 작업이 된다.

## 파생 상태 — 온보딩

`TasteProfile.onboardedAt`은 제약이 아니라 **판정 결과의 기록**이다.

```
onboarded := ∃ TasteItem WHERE profileId = p.id AND kind IN (HAVE, UNWANTED)
```

- 최초로 조건을 만족하는 `TasteItem`이 생성될 때 `onboardedAt`을 설정한다
- 마지막 `HAVE`/`UNWANTED` 항목이 삭제되면 `onboardedAt`을 `NULL`로 되돌린다 (US4 시나리오 3)

## 인덱스

| 인덱스 | 용도 |
|---|---|
| `TasteProfile.userId` (unique) | DAL의 프로필 조회 진입점 |
| `TasteItem(profileId, kind)` | 종류별 묶음 조회 (FR-012) |
| `TasteItem` C2 유니크 | 중복 방지 + 중복 검사 조회 |
| `Category.sortOrder` | 온보딩 목록 노출 순서 (FR-005) |
| `Category.name` (unique) | 멱등 시드 |

## 측정 (FR-015)

별도 이벤트 수집 없이 위 스키마만으로 산출된다. 쿼리는 [research.md R7](./research.md)에 있다.
`detail`과 `description`이 nullable인 것 자체가 측정 신호다.

## M1에서 의도적으로 넣지 않은 것

constitution 원칙 V — 후행 추가 비용이 낮으므로 연기한다.

| 항목 | 도입 시점 | 후행 비용 |
|---|---|---|
| `TasteItem.productId` | M3 | nullable FK 컬럼 1개 추가 |
| 취향 항목 공개 범위 | Future | 컬럼 추가 + 조회 규칙 교체 |
| `Category.parentId` (계층) | 필요해질 때 | nullable self-FK 1개 추가 |
| 취향 조회 로그 | Future | 새 테이블. 기존 스키마 무변경 |
