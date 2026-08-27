# Phase 0 Research: 맞춤 취향 프로필

**Date**: 2026-08-27 | **Plan**: [plan.md](./plan.md)

Technical Context의 미해결 항목과 통합 지점을 조사한 결과다. constitution 원칙 I에 따라
결정마다 근거와 기각한 대안을 남긴다.

---

## R1. FR-018 온보딩 게이트를 어디에 둘 것인가

**Decision**: 권위 있는 판정은 **DAL의 `requireOnboarded()`** 에 둔다. `proxy.ts`는 세션 쿠키
존재 여부만 보는 **optimistic 리다이렉트**(미인증 → 로그인)에만 쓴다.

**Rationale**: Next.js 16 공식 문서(`01-app/01-getting-started/16-proxy.md`)가 명시한다 —
*"Proxy is not intended for slow data fetching... it should not be used as a full session
management or authorization solution."* 또한 Proxy는 **prefetch를 포함한 모든 라우트에서
실행**되므로 DB 조회를 넣으면 성능이 무너진다. 온보딩 완료 여부(`onboarded_at`)는 쿠키가 아니라
DB 상태라, 애초에 Proxy에서 정확히 판정할 수 없다.

문서가 권장하는 대안이 DAL이다 — `verifySession()`을 React `cache()`로 메모이즈해 한 렌더
패스 안에서 중복 조회를 없애고, 데이터 소스에 가장 가까운 곳에서 인가를 수행한다. 이 구조는
constitution의 "접근 제어는 단일 규칙으로 한 곳에"와 정확히 맞물린다.

**Alternatives considered**:
- *Proxy에서 DB 조회* — 공식 문서가 금지. prefetch마다 쿼리가 나간다
- *각 페이지에서 개별 체크* — 규칙이 화면 수만큼 흩어진다. 새 화면을 추가하며 빠뜨리는 순간
  게이트가 뚫린다. constitution 데이터 보호 조항 위반
- *layout에서 체크* — 페이지보다는 낫지만 여전히 "데이터에 가장 가까운 곳"이 아니다.
  Server Action에서의 쓰기 경로는 layout을 타지 않으므로 별도 체크가 또 필요해진다

> **Next.js 16 주의**: Middleware가 **Proxy로 이름이 바뀌었다.** 파일은 루트의 `proxy.ts`이고
> `proxy` 이름으로 export한다. `middleware.ts`를 찾지 말 것.

---

## R2. Supabase Auth와 애플리케이션 User 테이블의 대응

**Decision**: `public.User` 테이블을 두고 **PK를 `auth.users.id`(UUID)와 같은 값**으로 쓴다.
동기화는 **DAL의 get-or-create**로 처리한다 — `verifySession()`이 세션을 확인한 뒤 해당 id의
`User`가 없으면 그 자리에서 만든다.

**Rationale**: 도메인 모델의 `User`는 표시명·아바타 같은 제품 관심사를 갖고, `auth.users`는
인증 관심사를 갖는다. 둘을 합치면 constitution 원칙 III의 근거(관심사 분리)가 깨지고,
Prisma가 `auth` 스키마를 침범해야 한다.

get-or-create를 고른 이유는 **누락 경로가 없기 때문**이다. 로그인 콜백에서만 만들면 콜백을
타지 않는 진입(세션은 유효한데 첫 콜백 실패, 수동 세션 복원 등)에서 `User`가 없는 상태가 생긴다.
DAL은 모든 데이터 접근이 반드시 지나는 지점이라 여기서 보장하면 빈 구멍이 없다.

**Alternatives considered**:
- *DB 트리거로 `auth.users` → `public.User` 자동 동기화* — 동작은 하지만 스키마의 진실이 Prisma
  마이그레이션 밖에도 존재하게 된다. 팀원이 `schema.prisma`만 보고는 이 동작을 알 수 없다
- *`auth.users`를 직접 참조하고 `public.User`를 두지 않음* — 표시명·아바타를 `raw_user_meta_data`
  JSON에 밀어넣게 되어 타입 안전성과 쿼리 가능성을 잃는다
- *로그인 콜백에서만 생성* — 위의 누락 경로 문제

---

## R3. Prisma로 표현되지 않는 제약 — `detail IS NULL` 중복

**Decision**: `(profile_id, kind, category_id, detail)` 유니크를 **`UNIQUE NULLS NOT DISTINCT`**
로 만들고, **raw SQL 마이그레이션**으로 작성한다.

**Rationale**: PostgreSQL은 유니크 인덱스에서 NULL을 서로 다른 값으로 취급한다. 그대로 두면
`detail`이 NULL인 항목 — 즉 **대분류만 지정한 항목, FR-006에 따라 가장 흔할 형태** — 이 무제한
중복 등록된다. FR-011이 요구하는 중복 방지가 정확히 이 지점에서 뚫린다.

PostgreSQL 15부터 `NULLS NOT DISTINCT`가 지원되고 Supabase는 그 이상을 쓴다. Prisma 스키마
문법으로는 표현할 수 없으므로 `prisma migrate dev --create-only`로 마이그레이션을 만든 뒤 SQL을
직접 편집한다. Prisma는 적용된 마이그레이션을 이력으로 추적하므로 drift로 잡히지 않는다.

```sql
ALTER TABLE "TasteItem"
  ADD CONSTRAINT "TasteItem_profile_kind_category_detail_key"
  UNIQUE NULLS NOT DISTINCT ("profileId", "kind", "categoryId", "detail");
```

**Alternatives considered**:
- *`detail`을 NOT NULL + 빈 문자열 기본값* — 평범한 유니크로 해결되지만 "상세를 적지 않았다"와
  "빈 문자열을 적었다"가 구분되지 않는다. FR-015의 상세 작성률 집계가 오염된다
- *`COALESCE(detail, '')` 표현식 인덱스* — 구버전 PG에서도 동작하지만 의도가 SQL을 읽어야만
  드러난다. 지원되는 문법이 있는데 우회할 이유가 없다

### DB 제약과 애플리케이션 검증의 경계

| 규칙 | 위치 | 근거 |
|---|---|---|
| `TasteProfile.userId` 유니크 (D1) | **DB** | Prisma 스키마로 표현 가능. 위반 시 데이터가 곧장 깨진다 |
| `(profileId, kind, categoryId, detail)` 유니크 (FR-011) | **DB** (raw SQL) | 동시 요청에서 애플리케이션 검사만으로는 경합을 막을 수 없다 |
| 모순 방지 — 같은 대분류의 상세 없는 `want`와 `unwanted` 공존 금지 (FR-010) | **애플리케이션** | 두 행에 걸친 조건부 규칙이라 단일 제약으로 표현되지 않는다. 배타 제약(`EXCLUDE`)으로 억지로 만들 수는 있으나, FR-010은 **어떤 항목과 충돌하는지 사용자에게 알려야** 하므로 어차피 애플리케이션이 기존 항목을 조회해야 한다 |
| 온보딩 완료 판정 (FR-008) | **애플리케이션** | 파생 상태다. `onboarded_at`은 판정 결과를 기록할 뿐 제약이 아니다 |

---

## R4. 접근 제어를 어디에 둘 것인가 — DAL 단독 vs RLS 병행

**Decision**: M1은 **DAL 단독**으로 간다. Supabase RLS는 M1에서 쓰지 않는다.

**Rationale**: Prisma는 Postgres에 직접 연결하므로 Supabase의 RLS 정책이 적용되지 않는다.
RLS를 병행하려면 Prisma 연결 롤을 분리하고 요청마다 세션 컨텍스트를 DB로 전파해야 하는데,
M1은 **본인만 자기 데이터에 접근**하는 구조라 그 복잡도가 방어하는 시나리오가 존재하지 않는다.

다만 이것은 **2차 방어선이 없다는 뜻**이므로, DAL을 우회하는 데이터 접근을 금지한다.
`lib/prisma.ts`를 컴포넌트나 Server Action에서 직접 임포트하지 않고 반드시 `lib/dal/*`을 거친다.

**Alternatives considered**:
- *RLS 병행* — 타인이 내 취향을 읽는 M2에서는 값이 생긴다. 그때 재검토한다.
  지금 도입하면 검증할 시나리오가 없는 방어선을 만드는 셈이고, constitution 원칙 V의
  "후행 추가 비용" 기준으로도 RLS는 정책 추가라 나중 도입 비용이 낮다
- *Supabase 클라이언트로만 데이터 접근(Prisma 미사용)* — RLS를 살릴 수 있으나 타입 안전한
  마이그레이션 관리를 잃는다. ORM 선택은 이미 확정됐다

---

## R5. 테스트 전략 — async Server Component

**Decision**: 3층으로 나눈다.

| 층 | 도구 | 대상 |
|---|---|---|
| 단위 | Vitest | 검증 로직(`lib/validation`), 순수 함수, 측정 쿼리 헬퍼 |
| 컴포넌트 | Vitest + React Testing Library | `'use client'` 컴포넌트 — 폼, 대분류 선택기 |
| E2E | Playwright | **async Server Component 화면 전체** — 온보딩 플로우, 취향 조회, Server Action 쓰기 |

**Rationale**: Next.js 16 공식 문서(`02-guides/testing/index.md`)가 명시한다 — *"Since `async`
Server Components are new to the React ecosystem, some tools do not fully support them. In the
meantime, we recommend using End-to-End Testing over Unit Testing for `async` components."*

이 스펙의 화면 대부분이 async Server Component이므로, 단위 테스트로 커버하려 들면 도구 한계와
싸우게 된다. 사용자 스토리 US1~US4의 수용 시나리오는 전부 E2E로 표현하는 편이 자연스럽고,
constitution 원칙 II의 "실패하는 테스트 먼저"도 E2E 층에서 그대로 성립한다.

**선행 조건**: `package.json`에 `test` 스크립트가 없다. 러너 도입이 **첫 작업**이며, 그 전에는
기능 코드를 쓰지 않는다(plan.md Complexity Tracking).

**Alternatives considered**:
- *Jest* — Next.js가 함께 문서화하지만 ESM과 Server Component 환경에서 설정 비용이 더 크다
- *E2E 없이 단위·통합만* — 원칙 II를 형식적으로는 만족하지만, 실제로 검증되는 것이 화면 밖의
  함수뿐이라 수용 시나리오가 하나도 검증되지 않는다

---

## R6. Category 시드 데이터

**Decision**: `prisma/seed.ts`에 **TypeScript 상수 배열**로 두고 `prisma db seed`로 적재한다.
멱등하게 작성한다(`upsert`).

**Rationale**: 목록이 코드에 있으면 타입 검사를 받고, PR 리뷰에 그대로 노출되며, 변경 이력이
git에 남는다 — constitution 원칙 I이 요구하는 "결정의 근거를 추적 가능하게"가 공짜로 따라온다.
멱등성이 필요한 이유는 팀원 각자가 로컬에서 시드를 여러 번 돌리기 때문이다.

**Alternatives considered**:
- *CSV / JSON 파일* — 비개발자가 편집하기 쉽지만, 이 목록을 편집할 비개발자가 팀에 없다.
  타입 검사를 잃는 대가만 남는다
- *관리자 화면에서 입력* — M1 범위 밖이고, 시드가 없으면 온보딩 자체가 동작하지 않는다

---

## R7. FR-015 측정 쿼리 — 저장 데이터만으로 산출되는가

**Decision**: 산출된다. 별도 이벤트 수집이 필요 없음을 아래 쿼리로 확인했다.

```sql
-- 상세 작성률: 상세를 1건 이상 지정한 프로필의 비율
SELECT
  COUNT(*) FILTER (WHERE has_detail)::float / NULLIF(COUNT(*), 0) AS detail_rate
FROM (
  SELECT p.id, bool_or(i."detail" IS NOT NULL) AS has_detail
  FROM "TasteProfile" p
  LEFT JOIN "TasteItem" i ON i."profileId" = p.id
  GROUP BY p.id
) t;

-- 취향 서술 작성률
SELECT
  COUNT(*) FILTER (WHERE "description" IS NOT NULL AND "description" <> '')::float
    / NULLIF(COUNT(*), 0) AS description_rate
FROM "TasteProfile";
```

**Rationale**: PRD Risks R2가 요구하는 "마일스톤 1 직후 즉시 측정"이 스키마만으로 충족된다.
`detail`이 nullable인 것과 `description`이 nullable인 것이 그 자체로 측정 신호다 — R3에서
`detail`을 NOT NULL + 빈 문자열로 만들지 않은 이유가 여기에도 있다.

**Alternatives considered**:
- *이벤트 테이블 추가* — 언제 작성했는지까지 알 수 있지만, R2가 묻는 것은 시점이 아니라
  **비율**이다. 원칙 V 기준으로 이벤트 테이블은 나중에 추가해도 비용이 낮다

---

## 해소되지 않은 항목

없음. Technical Context의 모든 미해결 항목이 위에서 결정되었다.
