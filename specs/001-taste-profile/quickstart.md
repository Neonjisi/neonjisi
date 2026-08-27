# Quickstart: 맞춤 취향 프로필

**Date**: 2026-08-27 | **Plan**: [plan.md](./plan.md)

이 기능이 실제로 동작하는지 확인하는 절차다. 구현 방법이 아니라 **검증 방법**을 담는다.
스키마 상세는 [data-model.md](./data-model.md), 인터페이스는
[contracts/server-actions.md](./contracts/server-actions.md)를 본다.

## 전제 조건

| 항목 | 값 |
|---|---|
| Node.js | 20+ |
| Supabase 프로젝트 | 팀 공용 1개 (또는 개인 개발용) |
| PostgreSQL | 15+ — `NULLS NOT DISTINCT` 사용 (data-model C2) |

`.env.local`에 필요한 값:

```
DATABASE_URL=                      # Supabase 연결 문자열 (Prisma용)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

> `.env.local`은 커밋하지 않는다. 팀 공유용 `.env.example`을 함께 만든다.

## 준비

```bash
npm install
npx prisma migrate dev          # C2 유니크 제약이 포함된 마이그레이션까지 적용
npx prisma db seed              # Category 30~50개 (FR-005). 멱등이므로 반복 실행 가능
npm run dev
```

**시드가 반드시 먼저다.** 대분류 목록이 비어 있으면 온보딩에서 고를 것이 없어 US1이 통째로
막힌다.

## 검증 시나리오

각 시나리오는 [spec.md](./spec.md)의 수용 시나리오에 대응한다. 자동 검증은 `tests/e2e/`가
담당하고, 아래는 수동으로도 같은 경로를 밟을 수 있게 적은 것이다.

### V1 — 온보딩 (US1)

1. 신규 계정으로 로그인 → `/onboarding`으로 이동되는지 확인
2. 아무것도 고르지 않고 저장 → 저장되지 않고 "최소 1건" 안내가 뜬다 (US1-2)
3. `필요 없는 것`으로 대분류 하나를 고르고 저장 → `/taste`로 이동하고 항목이 보인다 (US1-1)
4. `이미 있는 것`을 추가 → 두 종류가 **다른 묶음**으로 구분되어 보인다 (US1-3)
5. 로그아웃 후 온보딩 미완료 계정으로 `/taste`에 직접 접근 → `/onboarding`으로 유도된다 (US1-5, FR-018)

### V2 — 원하는 것 (US2)

1. `/taste`에서 `원하는 것`으로 대분류를 골라 저장 → `원하는 것` 묶음에 나타난다 (US2-1)
2. `원하는 것`이 하나도 없어도 온보딩 완료 상태가 유지된다 (US2-2)

### V3 — 상세와 서술 (US3)

1. 기존 항목에 상세를 덧붙여 저장 → 대분류와 상세가 함께 표시된다 (US3-1)
2. 상세를 비운 채 저장 → 대분류만으로 정상 저장된다 (US3-2)
3. 취향 서술을 저장 → 화면에 표시된다 (US3-3)
4. 취향 서술을 빈 문자열로 저장 → `NULL`로 정규화된다. 아래 V6 집계에서 "작성함"으로
   세지 않는지 확인한다

### V4 — 수정과 삭제 (US4)

1. 항목의 상세를 수정 → 즉시 반영된다 (US4-1)
2. 항목을 삭제 → 확인 절차 뒤 사라진다 (US4-2)
3. `이미 있는 것`/`필요 없는 것`이 1건뿐일 때 그것을 삭제 → **온보딩 미완료로 되돌아가고**
   재등록을 안내한다 (US4-3)

### V5 — 제약 (Edge Cases)

1. 같은 대분류를 `원하는 것`과 `필요 없는 것`에 동시 등록 시도 → 막히고 **어떤 항목과
   충돌하는지** 표시된다 (FR-010)
2. 같은 (종류, 대분류, 상세) 조합을 두 번 등록 시도 → 막힌다 (FR-011)
3. **상세를 비운 채** 같은 (종류, 대분류)를 두 번 등록 시도 → 막힌다.
   이것이 C2의 `NULLS NOT DISTINCT`가 실제로 걸렸는지 확인하는 지점이다. 일반 유니크였다면
   여기서 그냥 통과한다
4. 저장 중 네트워크를 끊음 → 실패가 표시되고 **입력 내용이 남아 있다** (FR-016)

### V6 — 측정 (FR-015 / SC-004)

[research.md R7](./research.md)의 두 쿼리를 Supabase SQL 편집기에서 실행한다.

- 상세 작성률과 취향 서술 작성률이 숫자로 나온다
- 이벤트 테이블 없이 `TasteProfile`·`TasteItem`만으로 나오는지 확인한다

**이 검증이 통과해야 마일스톤 1이 끝난 것**이다. PRD Risks R2가 요구하는
"마일스톤 1 직후 상세 작성률 즉시 측정"이 여기서 성립한다.

### V7 — 반응형 (FR-017 / SC-006)

폭 **360px**에서 V1~V4를 다시 밟는다. 가로 스크롤이 생기면 실패다.

## 테스트

```bash
npm run test           # Vitest — 단위·컴포넌트
npm run test:e2e       # Playwright — async Server Component 화면
```

> 두 스크립트 모두 현재 `package.json`에 **없다.** 러너 도입이 첫 작업이며, 그 전에는 기능
> 코드를 쓰지 않는다 (plan.md Complexity Tracking, constitution 원칙 II).

## 품질 게이트

완료를 선언하기 전에 통과해야 한다 (constitution 품질 게이트).

```bash
npm run lint
npm run build
```
