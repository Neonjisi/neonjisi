# 넌지시 (neonjisi)

> 선물 받는 사람의 **맞춤 취향**을 기록하고 전달해, 원하지 않는 선물을 주고받는 어긋남을 양쪽에서 줄인다.

Next.js 16 App Router · TypeScript · Supabase(PostgreSQL) · Prisma

---

## 문서 지도

문서가 여러 곳에 있는데, **관리 주체가 다르기 때문**이다.

| 구분 | 위치 | 관리 |
|---|---|---|
| 제품·설계 문서 | `docs/`, `.claude/prds/` | 우리가 직접 |
| 마일스톤 단위 스펙 | `specs/` | **spec-kit이 관리** |
| 프로젝트 원칙 | `.specify/memory/` | **spec-kit이 관리** |

`specs/`와 `.specify/`는 spec-kit CLI가 경로를 알고 있어 임의로 옮기면 도구가 깨진다.

### 제품 전반

| 문서 | 무엇이 담겼나 |
|---|---|
| [`.claude/prds/neonjisi.prd.md`](.claude/prds/neonjisi.prd.md) | **PRD.** 문제, 사용자, 범위, 정책 결정, 리스크, 마일스톤 4개 |
| [`docs/domain-model.md`](docs/domain-model.md) | **도메인 모델.** 마일스톤 1~4를 관통한다. 엔티티 14개, 상태 전이, 접근 제어 규칙 |
| [`docs/product-lens-review-v3.md`](docs/product-lens-review-v3.md) | PRD 이전의 제품 방향 검토 (v1·v2도 함께 보관) |
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | **프로젝트 원칙 v1.0.0.** 모든 설계·구현 결정이 여기에 따른다 |

### 마일스톤 1 — 맞춤 취향 프로필

`specs/001-taste-profile/` 아래에 있다. **처음 오는 사람은 위에서부터 읽으면 된다.**

| 순서 | 문서 | 답하는 질문 |
|---|---|---|
| 1 | [`spec.md`](specs/001-taste-profile/spec.md) | **무엇을** 만드나 (사용자 스토리, 요구사항 20개) |
| 2 | [`team-assignment.md`](specs/001-taste-profile/team-assignment.md) | **누가** 무엇을 하나 |
| 3 | [`tasks.md`](specs/001-taste-profile/tasks.md) | 태스크 60개, 실행 순서 |
| 4 | [`plan.md`](specs/001-taste-profile/plan.md) | **어떻게** 만드나 (기술 스택, 소스 구조) |
| 5 | [`research.md`](specs/001-taste-profile/research.md) | **왜 그렇게 정했나** (결정·근거·기각한 대안) |
| 6 | [`data-model.md`](specs/001-taste-profile/data-model.md) | M1 스키마와 제약 |
| 7 | [`contracts/server-actions.md`](specs/001-taste-profile/contracts/server-actions.md) | DAL·Server Action 인터페이스 |
| 8 | [`quickstart.md`](specs/001-taste-profile/quickstart.md) | **어떻게 검증하나** (V1~V7) |

> **개발자라면 2 → 3 → 8 순서로 봐도 된다.** 담당 태스크와 검증 방법이 거기 다 있다.

---

## 시작하기

```bash
npm install
cp .env.example .env.local     # Supabase 값을 채운다. 커밋하지 않는다
npx prisma migrate dev
npx prisma db seed             # 카테고리 시드. 없으면 온보딩이 막힌다
npm run dev
```

http://localhost:3000

### 명령

| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 — **완료 선언 전 필수** |
| `npm run lint` | 린트 — **완료 선언 전 필수** |
| `npm run test` | 단위·컴포넌트 테스트 (Vitest) |
| `npm run test:e2e` | E2E 테스트 (Playwright) |

> ⚠️ `test`·`test:e2e` 스크립트와 Prisma·Supabase 설정은 **아직 없다.**
> `tasks.md`의 T001~T007이 이것들을 만드는 작업이다.

---

## 현재 상태

| 단계 | 상태 |
|---|---|
| PRD · 도메인 모델 · Constitution | ✅ 완료 |
| 마일스톤 1 스펙 · 계획 · 태스크 · 분담 | ✅ 완료 |
| 마일스톤 1 구현 | ⬜ 착수 전 (T001부터) |
| 마일스톤 2~4 | ⬜ 미착수 |

### 마일스톤

| # | 목표 | 상태 |
|---|---|---|
| 1 | 맞춤 취향을 남길 수 있다 | 스펙 완료 |
| 2 | 친구에게 취향이 전달된다 | 도메인 모델만 |
| 3 | 선물이 수령자 확인을 거쳐 결정된다 | 도메인 모델만 |
| 4 | 고가 선물을 여럿이 함께 준비한다 | 도메인 모델만 |

마일스톤 1~2가 이 제품의 자산(맞춤 취향 데이터)을 만들고, 3~4는 그 자산을 쓰는 층이다.

---

## 개발 규칙

전체는 [`.specify/memory/constitution.md`](.specify/memory/constitution.md)와
[`CLAUDE.md`](CLAUDE.md)에 있다. 자주 걸리는 것만 옮기면:

- **테스트를 먼저 쓴다.** 실패하는 테스트 → 구현 → 통과
- **Server Component가 기본.** 상태·이펙트·브라우저 API가 필요할 때만 `'use client'`
- **`lib/prisma.ts`를 화면·액션에서 직접 import 금지.** 반드시 `lib/dal/`을 거친다
- **Next.js 16은 `middleware.ts`가 아니라 `proxy.ts`다**
- `npm run lint`·`npm run build`를 통과시키기 전에 완료를 선언하지 않는다
