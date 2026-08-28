# Research: 친구에게 취향이 전달된다 (마일스톤 2)

**Date**: 2026-08-28 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Technical Context의 미해결 항목과, M1 코드에 이미 자리 잡은 패턴 위에 M2를 얹을 때 부딪히는
지점을 정리한다. 결정마다 근거를 붙인다(constitution 원칙 I).

---

## R1 — 미리보기 주소는 로그인 게이트 밖에 둔다

**Decision**: 미리보기 라우트를 `app/i/[token]/page.tsx`로 두고, `proxy.ts`의 `matcher`에
**추가하지 않는다.**

**Rationale**: 현재 `proxy.ts`의 matcher는 인증이 필요한 영역만 열거한다.

```ts
matcher: ['/onboarding/:path*', '/taste/:path*', '/my/:path*', '/signup/:path*']
```

`/i/...`는 목록에 없으므로 **아무것도 하지 않아도 공개**다. FR-008("로그인 없이 볼 수 있어야
한다")이 코드 변경 없이 성립한다. matcher가 "인증 필요한 곳을 열거하는" 화이트리스트 방식이라
새 공개 라우트를 추가할 때 실수로 막힐 일이 없다.

**Alternatives considered**:
- *`/invite/[token]`* — 더 서술적이지만 화면 명세가 `neonjisi.app/i/x7Kq2mA9`로 그려 뒀고,
  링크는 메신저에 붙여 넣는 것이라 **짧을수록 낫다.** 명세를 따른다.
- *쿼리 파라미터 `/invite?token=...`* — 토큰이 Referer 헤더로 새어 나갈 수 있고, 링크가
  덜 깔끔하다.

**주의**: 미리보기는 공개지만 **성사는 로그인이 필요하다.** 두 동작을 한 라우트에 두되,
성사 경로만 세션을 요구한다. 이 분기가 R3의 주제다.

---

## R2 — 토큰은 `crypto.randomUUID()`가 아니라 32바이트 랜덤 base64url

**Decision**: `crypto.getRandomValues(new Uint8Array(32))`를 base64url로 인코딩해 쓴다.
길이 43자. Node 표준 `crypto`만 쓰고 새 의존성을 넣지 않는다.

**Rationale**: FR-001이 "추측할 수 없는"을 요구한다. UUIDv4는 122비트지만 **형식이 알려져
있어** 스캔 대상이 되기 쉽고, 도메인 모델 §4가 이미 "32바이트 랜덤, URL-safe"로 못박았다.
256비트면 온라인 추측이 불가능하다. base64url은 URL에 그대로 쓸 수 있어 인코딩이 필요 없다.

**Alternatives considered**:
- *`nanoid`* — 짧고 편하지만 의존성이 하나 는다. 표준 `crypto`로 충분하다.
- *짧은 코드(6~8자)* — 사람이 불러줄 수 있지만 **열거 공격에 노출**된다. FR-007이 만료·중지·부재를
  구분 불가로 만든 이유가 토큰 탐색 방지인데, 짧은 토큰은 그 방어를 무의미하게 만든다.

---

## R3 — 미리보기와 성사를 한 라우트에서 세션 유무로 가른다

**Decision**: `/i/[token]`이 서버에서 세션을 **조회하되 요구하지 않는다.** 분기는 이렇다.

| 세션 | 관계 | 결과 |
|---|---|---|
| 없음 | — | 미리보기 렌더 (SCR-M2-04) |
| 있음 | 본인 링크 | "본인 링크입니다" — 성사하지 않음 (FR-016) |
| 있음 | 이미 활성 친구 | 친구 상세로 redirect (SCR-M2-06) |
| 있음 | 친구 아님 | **성사 후** 성사 화면으로 (SCR-M2-05) |
| — | 토큰 무효 | 만료 안내. 표시명도 노출하지 않음 (FR-011) |

`verifySession()`은 세션이 없으면 `redirect('/login')` 하므로 **여기서 쓸 수 없다.**
세션을 선택적으로 읽는 함수가 따로 필요하다 — `getOptionalSession()`을 `lib/dal/session.ts`에
더한다.

**Rationale**: 화면 명세 SCR-M2-04의 예외 표가 이미 이 분기를 요구한다. 라우트를 둘로 쪼개면
(`/i/[token]` 미리보기 + `/i/[token]/accept` 성사) 로그인한 사용자가 링크를 열었을 때
한 번 더 이동해야 해서 SC-001(3분 이내)에 불리하다.

**Alternatives considered**:
- *성사를 클라이언트에서 Server Action 호출로* — 링크를 연 순간 자동 성사되어야 하는데
  클라이언트 왕복이 한 번 더 생긴다. 서버에서 끝내는 편이 짧다.
- *`verifySession()` 재사용* — 불가능하다. 비로그인 방문자를 `/login`으로 튕겨서
  미리보기 자체가 성립하지 않는다.

---

## R4 — 관계 중복은 partial unique index로 DB가 막는다

**Decision**: 도메인 모델 §4의 SQL을 그대로 쓴다. Prisma 스키마로 표현되지 않으므로
**raw SQL 마이그레이션**으로 넣는다 — M1의 T010(`NULLS NOT DISTINCT`)과 같은 방식이다.

```sql
CREATE UNIQUE INDEX friendship_pair_active
  ON "Friendship" (LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId"))
  WHERE status <> 'REMOVED';
```

**Rationale**: FR-015("활성 관계는 최대 하나")를 애플리케이션 검사로만 두면 **동시 요청에서
샌다** — 두 사람이 서로의 링크를 동시에 여는 Edge Case가 스펙에 명시돼 있다. 표현식 인덱스라
`(A,B)`와 `(B,A)`가 같은 키로 정규화되고, `WHERE status <> 'REMOVED'` 부분 조건이 있어
해제 이력이 재추가를 막지 않는다(FR-026).

**M1에서 배운 것**: T010에서 같은 상황을 겪었다. Prisma로 표현 못 하는 제약은
`@@unique`로 매핑만 해 두고 실제 제약은 raw SQL로 넣되, **제약이 실제로 걸렸는지 확인하는
테스트를 반드시 함께 만든다.** T011이 없었으면 T010이 걸렸는지 알 수 없었다. M2도 같은 쌍으로 간다.

**Alternatives considered**:
- *애플리케이션 트랜잭션 + `SELECT ... FOR UPDATE`* — 잠글 행이 아직 없어서 삽입 경합에는
  듣지 않는다.
- *양방향 2행 복제* — 도메인 모델 §4가 명시적으로 기각했다. 쓰기가 2배가 되고 두 행의 상태가
  어긋날 여지가 생긴다.

---

## R5 — `used_count`는 성사와 같은 트랜잭션에서 올린다

**Decision**: 관계 생성과 `usedCount` 증가를 **하나의 `prisma.$transaction`**에 넣고,
증가는 `{ increment: 1 }` 원자 연산으로 한다.

**Rationale**: SC-008이 "동시에 여러 명이 사용해도 사용 횟수가 정확히 누적"을 요구한다.
읽고-더하고-쓰면 lost update가 난다. 또 관계는 생겼는데 카운트가 안 올라가면 발급자가 보는
숫자가 틀리고, FR-006(사용 인원수 표시)이 거짓말을 한다.

**주의**: R4의 유니크 인덱스 위반(이미 친구)으로 트랜잭션이 실패하면 **카운트도 함께
롤백돼야 한다.** 이미 친구인 사람이 링크를 다시 열어도 카운트가 오르면 안 된다.

---

## R6 — 알림은 M2에서 한 종류만 쓰되 스키마는 열어 둔다

**Decision**: `Notification` 모델을 도메인 모델 §5 그대로 만든다 —
`userId` · `type` · `payload`(Json) · `readAt` · `createdAt`. M2에서 쓰는 `type`은
`FRIEND_JOINED_VIA_LINK` 하나뿐이지만 **enum에 나머지 10종을 미리 넣지 않는다.**

**Rationale**: constitution 원칙 V(연기는 후행 비용이 낮은 쪽으로)를 적용한다.
enum 값 추가는 **마이그레이션 한 줄**이고 기존 데이터에 기본값을 정할 필요도, 조회 코드를
고칠 필요도 없다 — 후행 비용이 낮으므로 연기한다. 반면 `payload`를 나중에 넣는 것은
기존 행 전부의 기본값을 정해야 해서 비용이 높다 — 지금 넣는다.

**`payload`를 지금 넣는 이유**: M2의 알림 하나만 보면 `friendshipId` 외래키로 충분해 보인다.
그러나 M3의 알림 10종은 서로 다른 엔티티를 가리키고, 그때 가서 컬럼을 종류별로 늘리면
**테이블이 희소 컬럼으로 뒤덮인다.** 도메인 모델이 `jsonb`를 고른 이유가 이것이다.

**Alternatives considered**:
- *알림 없이 친구 탭에 "새로 친구가 됨" 표시* — clarify Q4에서 팀이 명시적으로 기각했다.
  알림 목록 화면까지 만들기로 결정.
- *`Notification`을 M3까지 미루고 `Friendship.acceptedAt`으로 대체* — 읽음 처리(FR-031)를
  표현할 자리가 없다.

---

## R7 — 대표 태그는 목록 조회에 N+1을 만들지 않는다

**Decision**: 친구 목록을 그릴 때 친구별 대표 태그를 **한 번의 쿼리로 모아** 가져온다.
친구 수가 적은 시연 규모에서는 `WHERE profileId IN (...)`로 `WANT` 항목을 최신순으로 받아
애플리케이션에서 친구별 3건씩 자르는 것으로 충분하다.

**Rationale**: FR-018이 친구 목록에 각자의 대표 태그를 함께 요구한다. 친구마다 쿼리를 돌리면
N+1이 된다. 윈도우 함수(`ROW_NUMBER() OVER (PARTITION BY ...)`)로 DB에서 3건씩 자르는 것이
정석이지만, Prisma로는 raw SQL이 필요하다. **시연 규모(친구 수십 명)에서는 앞의 방식으로
충분하고 코드가 훨씬 단순하다.** 규모가 커지면 그때 raw SQL로 바꾼다 — 후행 비용이 낮다(원칙 V).

**측정 가능한 전환 기준**: 친구 1명당 `WANT` 항목이 평균 5건이라고 볼 때 친구 100명이면
500행이다. 그 이상이 되면 윈도우 함수로 옮긴다.

---

## R8 — 접근 제어는 DAL 함수 하나로 모은다

**Decision**: `lib/dal/friend.ts`에 `requireActiveFriendship(friendUserId)`를 두고,
친구 취향을 읽는 모든 경로가 이것을 먼저 통과한다. 취향 조회는 M1의 `lib/dal/taste.ts`를
재사용하되 **"남의 프로필을 읽는" 함수를 새로 더한다.**

**Rationale**: constitution "데이터 보호"가 명령한다 — "접근 제어는 단일 규칙으로 한 곳에
모은다(MUST). 항목별 예외 분기를 만들지 않는다(MUST NOT)." M1의 `lib/dal/taste.ts`는
**전부 본인 데이터 전용**이라(`verifySession()`으로 userId를 얻어 자기 것만 읽는다)
그대로는 친구 조회에 쓸 수 없다.

**주의 — M1 함수를 고쳐 쓰지 않는다**: `getTasteItemsByKind()`에 `userId` 파라미터를 뚫으면
"호출부에 소유자 검사가 없다"는 M1의 안전 성질이 깨진다. 대신 친구 전용 함수를 새로 만들고
**그 함수가 내부에서 `requireActiveFriendship()`을 부른다.** 시그니처만 보고 잘못 쓸 수 없는
구조를 유지한다.

---

## R9 — 해제는 상태 전이이고 삭제가 아니다

**Decision**: `status`를 `ACTIVE` → `REMOVED`로 바꾸고 `removedAt` · `removedBy`를 기록한다.
행을 지우지 않는다.

**Rationale**: 도메인 모델 D3. 재추가 시 **기존 행을 되살리지 않고 새 행을 만든다** —
R4의 partial index가 `REMOVED` 행을 무시하므로 새 행이 들어간다. 되살리는 방식은
"언제 몇 번 끊고 다시 맺었는지"를 잃는다.

**M2에서 단순해지는 부분**: 도메인 모델 §7의 "진행 중 거래 예외"는 `GiftRequest`·`Funding`이
M3·M4 엔티티라 **M2에는 존재할 수 없다.** 따라서 M2의 해제는 **전면 차단 하나**로 끝난다.
스펙이 해제 확인 문구에서 "진행 중인 선물·펀딩은 그대로 진행됩니다"를 빼기로 한 이유다.

---

## R10 — 테스트 전략은 M1의 것을 그대로 잇는다

**Decision**: 단위(Vitest) · 통합(Vitest + 실 DB) · E2E(Playwright, `chromium` + `mobile-360`)
3층을 유지한다. **E2E는 계정이 두 개 필요하다.**

**Rationale**: M2의 모든 시나리오가 "A가 링크를 만들고 B가 받는" 두 주체 구조다.
M1의 E2E 픽스처(`tests/e2e/fixtures/auth.ts`)는 **계정 하나**를 전제로
`E2E_USER_EMAIL`/`E2E_USER_PASSWORD`를 읽는다. 두 번째 계정을 위한
`E2E_USER2_EMAIL`/`E2E_USER2_PASSWORD`를 더하고, 픽스처가 두 브라우저 컨텍스트에
각각 세션을 주입하도록 확장한다.

**M1에서 배운 것**: 환경 변수가 비면 인증 E2E가 **실패가 아니라 skip** 된다. 초록으로 보이지만
한 줄도 안 돈다. M1에서 이 skip이 픽스처 버그를 몇 시간 가렸다. M2에서는
**두 번째 계정이 없을 때도 같은 함정**이 생기므로, 실행 결과에서 `skipped` 수를 확인하는 것을
검증 절차에 넣는다.

**Alternatives considered**:
- *계정 하나로 자기 자신과 친구 맺기* — FR-016이 금지한다. 애초에 검증할 수 없다.
- *DB를 직접 조작해 관계를 미리 만들기* — M1이 세운 원칙("e2e에서 `@/lib/prisma`·DAL을
  직접 import 하지 않는다")을 깬다. UI로 만든다.
