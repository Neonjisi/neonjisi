# H 할 일 — 마일스톤 1 잔여

> ✅ **2026-08-28 완료.** T046·T054 둘 다 끝났다. 아래는 실행 기록으로 남긴다.
> 결과 요약은 [reviews/2026-08-28-t054-360px.md](./reviews/2026-08-28-t054-360px.md).

**기준**: `main` @ `7a48cca` (gnuke-dev·sub_dev 병합 완료) · **작성일**: 2026-08-28
**출처**: [team-assignment.md](./team-assignment.md) 3장 H · [tasks.md](./tasks.md) · [quickstart.md](./quickstart.md)

---

## 요약

H 담당 13개 중 **11개 완료**. 남은 것은 **T046 · T054** 두 개이고, 둘 다 새 코드를 쓰는
일이 아니라 **검증**이다. T046은 선행 준비(E2E 테스트 계정)가 있어서 그것부터 한다.

| # | 할 일 | 상태 | 막는 것 |
|---|---|---|---|
| **0** | `.env.local`에 E2E 계정 2줄 추가 (T006 잔여) | ✅ 완료 | — |
| **T046** | US3 테스트(T040·T041)를 초록으로 | ✅ 완료 | — |
| **T054** | 폭 360px에서 quickstart V1~V4 재검증 | ✅ 완료 | — |

> **끝난 것** — T021 로그인 화면 · T022 `error.tsx` · T028 카테고리 피커 ·
> T029 취향 폼 · T032 목록(Server Component) · T042 상세 입력 칸 · T044 서술 에디터 ·
> T045 서술 표시 영역 · T051 수정·삭제 진입점 + 삭제 확인 다이얼로그 ·
> T056 컴포넌트 크기 점검 · T057 `'use client'` 점검

---

## 0. 선행 — E2E 테스트 계정 (T006 잔여분)

**왜 지금 없나**: 내 `.env.local`은 8/28 오전에 만들어졌고, `E2E_USER_EMAIL` /
`E2E_USER_PASSWORD` 키는 그 뒤 `gnuke-dev`에서 추가됐다. 그래서 내 파일에는 두 줄이
아예 없다. Supabase 4개 키는 이미 채워져 있다.

**이게 비어 있으면 인증이 필요한 E2E는 실패가 아니라 `skip` 된다.** 초록으로 보이는데
아무것도 안 돈 상태가 되므로 반드시 채운다.

### 절차

1. Supabase → **Authentication → Sign In / Providers → Email** 활성화
2. Supabase → **Authentication → Users → Add user → Create new user**
   - **Auto Confirm User 체크** (안 하면 로그인이 막힌다)
   - 실사용 계정을 쓰지 않는다 — E2E가 이 계정의 취향 데이터를 매번 지우고 다시 만든다
3. `.env.local` 맨 아래에 두 줄 추가

```bash
E2E_USER_EMAIL=
E2E_USER_PASSWORD=
```

4. 확인 — `skip`이 아니라 실제로 돌았는지 본다

```bash
npx playwright install        # 최초 1회
npm run test:e2e
```

> 🔒 `.env.local`은 커밋하지 않는다. 값을 슬랙·카톡에 붙여넣는 것도 같은 유출이다.

---

## 1. T046 — US3 테스트를 초록으로

**대상**: T040 — `tests/e2e/taste-detail.spec.ts` (5건, **테스트 계정 전까지 skip**)
T041 — `tests/unit/validation-taste-item.test.ts` (서술 빈 문자열 → `NULL` 정규화)

**내가 쓰는 게 아니다.** 두 테스트는 이미 작성돼 있다(T040은 `b3a69da`에서 Gnuke가 작성,
T041은 통과 중). 내 일은 **돌려서 빨간 것을 고치는 것**이고, 고치는 대상은 내가 만든
화면 쪽 — `description-editor.tsx`, `taste-item-form.tsx`, `app/taste/page.tsx`다.

### 절차

```bash
npm run test tests/unit/validation-taste-item.test.ts   # T041 — 빠름, 먼저
npm run test:e2e tests/e2e/taste-detail.spec.ts         # T040
```

> T040의 5건은 **지금 skip 상태**다. 0번을 안 하면 "통과"로 보이지만 아무것도 안 돈다.
> 실행 결과에 `5 passed`가 뜨는지, `5 skipped`가 뜨는지를 반드시 확인한다.

### 실패하면 보는 곳

| 증상 | 볼 파일 |
|---|---|
| 상세를 덧붙였는데 표시가 안 됨 (V3-1) | `components/taste/taste-item-form.tsx` · `taste-item-list.tsx` |
| 상세를 비웠는데 저장이 막힘 (V3-2) | `taste-item-form.tsx` — 상세를 **필수로 만들면 안 된다** (FR-006) |
| 서술 저장이 화면에 반영 안 됨 (V3-3) | `components/taste/description-editor.tsx` · `app/taste/page.tsx` (T045) |
| 빈 서술이 "작성함"으로 세짐 (V3-4) | 서버 쪽 — J의 `updateTasteDescription`. 내가 고치지 않고 J에게 넘긴다 |

> ⚠️ **서버 파일은 건드리지 않는다.** `app/taste/actions.ts`는 J가 혼자 소유한다
> (team-assignment 4장 충돌 지도). 원인이 서버면 재현 경로를 적어서 J에게 넘긴다.

**완료 기준**: `tests/e2e/taste-detail.spec.ts`가 skip 없이 전부 통과.
그 뒤 `tasks.md` 170행의 T046을 `[X]`로 바꾼다.

---

## 2. T054 — 360px 반응형 재검증

**지금 바로 할 수 있다.** 계정 세팅과 무관하다.

**기준**: 폭 360px에서 **가로 스크롤이 생기면 실패** (SC-006 / FR-017)

### 절차

```bash
npm run dev
```

Chrome DevTools → Device Toolbar → **Responsive, 폭 360px**로 고정한 뒤
`quickstart.md`의 **V1~V4를 순서대로** 밟는다.

| 시나리오 | 밟는 화면 | 볼 것 |
|---|---|---|
| **V1** 온보딩 (US1) | `/login` → `/onboarding` → `/taste` | 3스텝 진행, "최소 1건" 안내, 두 종류가 다른 묶음으로 |
| **V2** 원하는 것 (US2) | `/taste` | `원하는 것` 묶음, 0건이어도 온보딩 완료 유지 |
| **V3** 상세·서술 (US3) | `/taste` | 상세 함께 표시, 상세 비워도 저장, 서술 표시 |
| **V4** 수정·삭제 (US4) | `/taste` | 수정 즉시 반영, 삭제 확인 다이얼로그, 마지막 1건 삭제 시 온보딩 미완료 복귀 |

### 특히 볼 곳 — 내가 만든 것 중 360px에서 깨지기 쉬운 것

- **바텀시트** (`components/ui/bottom-sheet.tsx`) — 폼·카테고리 피커가 올라타는 컨테이너
- **카테고리 피커** (T028) — 칩 40개가 줄바꿈 되는지, 검색 입력이 밀리는지
- **취향 목록** (T032) — 대분류 + 상세가 길 때 줄바꿈 되는지, 수정·삭제 버튼이 밀려나는지
- **삭제 확인 다이얼로그** (T051) — 버튼 2개가 좁은 폭에서 겹치는지
- **서술 에디터** (T044) — `textarea` 폭이 컨테이너를 넘는지

### 기록

깨진 게 있으면 **고치고**, 없으면 없다고 적는다. 결과를
`specs/001-taste-profile/reviews/` 아래에 남기면 T059(S의 전체 수동 검증)와 겹치는 부분을
S가 건너뛸 수 있다.

**완료 기준**: 360px에서 V1~V4 전 구간 가로 스크롤 없음.
그 뒤 `tasks.md` 202행의 T054를 `[X]`로 바꾼다.

---

## 3. 끝내기 전에 — 품질 게이트

```bash
npm run lint
npm run build
```

둘 다 통과해야 완료 선언 (constitution 품질 게이트). 커밋은 **브랜치를 따서** 하고
push 후 팀에 알린다 — main 직접 커밋하지 않는다.

---

## 참고 — 마일스톤 1 전체 잔여 (내 것이 아닌 것 포함)

내 두 개가 끝나도 마일스톤은 안 끝난다. 아래가 남는다.

| # | 담당 | 내용 | 선행 |
|---|---|---|---|
| T034 | D | US1 테스트 초록 + 360px | E2E 계정 |
| T039 | D | US2 테스트 초록 | E2E 계정 |
| T052 | D | US4 테스트 초록 | E2E 계정 |
| T055 | D | 저장 중 네트워크 끊고 입력 보존 확인 | — |
| T053 | J | **FR-015 측정 쿼리** — 마일스톤의 진짜 종료선 | 실사용 데이터 |
| T059 | S | quickstart V1~V7 전체 수동 검증 | — |
| T060 | S | 외부 5명에게 두 종류 구분 가능한지 (4명 이상) | 화면 확정 |

> **E2E 계정은 D도 필요하다** (T034·T039·T052). 내가 0번을 먼저 하고 절차를 공유하면
> D가 같은 삽질을 반복하지 않는다.
