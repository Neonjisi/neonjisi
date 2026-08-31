# Research: 선물이 수령자 확인을 거쳐 결정된다 (마일스톤 3)

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Technical Context의 미해결 항목과, M1·M2 코드에 자리 잡은 패턴 위에 M3를 얹을 때 부딪히는
지점을 정리한다. 결정마다 근거를 붙인다(constitution 원칙 I).

---

## R1 — PortOne은 인터페이스 하나 뒤에 숨긴다 (clarify Q1의 구현 형태)

**Decision**: `lib/portone/client.ts`가 결제 인터페이스의 유일한 관문이다.

```ts
type PortOneClient = {
  issueBillingKey(input: IssueBillingKeyInput): Promise<IssueBillingKeyResult>
  chargeBillingKey(input: ChargeInput): Promise<ChargeResult>
  refund(input: RefundInput): Promise<RefundResult>       // M4용 — mock에도 지금 만든다
}
```

`PORTONE_MODE`(env, 기본 `mock`)로 mock/실연동을 전환한다. **mock부터 완결시키고**,
실연동은 US5 착수 시점에 같은 시그니처 뒤에 붙인다.

**mock의 실패 유도 규약**: mock 등록 폼은 카드번호를 받지 않는다 — 브랜드와 뒷자리 4자리만
고른다. **뒷자리가 `0000`이면 그 빌링키의 `chargeBillingKey`가 항상 실패**를 반환한다.
결정론적이라 통합 테스트·E2E가 실패 경로를 재현할 수 있고, 시연 중에도 실패 → 재시도 복구를
보여줄 수 있다.

**Rationale**: clarify Q1이 "혼합"으로 확정했다. 실·모의가 같은 시그니처를 쓰면 전환이 env
한 줄이고, E2E가 항상 mock으로 돌아 테스트가 실결제를 만들 수 없다(협업 규칙 §8).
`refund`를 mock에 지금 만드는 이유: M4의 환불·차액 결제가 이 인터페이스를 처음 실사용하는데,
그때 인터페이스를 고치면 M3의 mock 테스트가 전부 흔들린다.

**Alternatives considered**:
- *실연동만* — E2E가 PortOne 테스트 모드 키에 묶이고, CI·팀원 로컬에 키 배포 문제가 생긴다.
- *시뮬레이션만* — 시연 직전 "실제로 되나"를 보일 수단이 없다. 인터페이스 비용은 어차피 낮다.
- *mock 실패를 env 플래그로 전환* — 성공·실패가 전역 상태가 되어 한 E2E 안에서 성공과 실패를
  섞을 수 없다. 카드 규약이면 계정·요청 단위로 섞인다.

---

## R2 — 중복 청구는 `PENDING → PAYING` 조건부 UPDATE로 막는다

**Decision**: 결제 시도 진입은 반드시 이 잠금을 지난다.

```ts
const locked = await tx.giftRequest.updateMany({
  where: { id, status: 'PENDING' },        // 재시도는 'PAYMENT_FAILED'
  data: { status: 'PAYING' },
})
if (locked.count === 0) return  // 이미 다른 시도가 진행 중 — 조용히 중단
```

**Rationale**: 도메인 모델 §5 — "`paying`은 멱등성 장치다. PG 호출은 외부 비동기라 이 상태
없이는 중복 청구를 막을 수 없다." 상태를 SELECT로 검사한 뒤 UPDATE 하면 검사와 갱신 사이에
다른 요청이 끼어든다(TOCTOU). `updateMany`의 WHERE에 기대 상태를 넣으면 DB가 원자적으로
한 요청만 통과시킨다 — M2의 P2002 처리(검사 + 제약 이중화)와 같은 철학이다.

**Alternatives considered**:
- *`SELECT ... FOR UPDATE`* — 트랜잭션 안에서는 동등하지만, PG 호출이 트랜잭션 밖이라
  잠금을 오래 쥐게 되거나 두 트랜잭션으로 쪼개야 한다. 조건부 UPDATE가 더 짧고 자명하다.
- *애플리케이션 뮤텍스* — 서버리스·다중 인스턴스에서 무의미하다.

**검증**: 통합 테스트가 같은 요청에 동시 승인 2회를 넣어 **결제 1회**를 확인한다
(M2 `accept-invite-concurrent.test.ts` 패턴).

---

## R3 — 만료는 지연 평가 한 곳에서, 알림도 그 지점에서

**Decision**: `lib/gift/state.ts`의 `evaluateExpiry(request)`가 유일한 만료 판정 지점이다.
`respondDueAt < now()`이고 상태가 `PENDING`이면 그 자리에서 `EXPIRED`로 기록하고
**같은 트랜잭션에서 `GIFT_EXPIRED` 알림을 만든다.** `lib/dal/gift.ts`의 모든 조회와
`respond.ts`의 모든 응답 액션이 이 함수를 경유한다.

**Rationale**: 도메인 모델 §8 — cron 주기가 곧 오차가 되고 App Router에 cron을 얹는 비용이
있다. 지연 평가면 화면을 여는 것이 판정 트리거라 오차가 없다. 만료 *알림*을 §8은 "범위 밖"
이라 했지만 그것은 *스케줄러 기반* 알림을 배제한 것이다 — 화면 명세 SCR-M3-02와 M3 플로우에는
`gift_expired`가 있고, 지연 평가가 상태를 기록하는 바로 그 지점에서 만들면 cron 없이 된다
(spec Assumptions에서 확정한 독해).

**주의**: 이 함수를 경유하지 않는 조회 함수가 하나라도 생기면 "만료됐는데 승인이 된다"가
난다. DAL 조회 함수 전부가 경유하는 것을 코드 리뷰 체크 항목으로 삼는다.

**Alternatives considered**:
- *Vercel Cron / pg_cron* — 인프라 의존이 늘고 주기 오차가 생긴다. 시연 규모에 과하다.
- *클라이언트 카운트다운이 0이 될 때 만료 액션 호출* — 클라이언트를 신뢰하게 된다. 표시는
  클라이언트, 판정은 서버가 원칙이다(R8).

---

## R4 — CHECK 4종은 raw SQL, `fundingContributionId`는 컬럼만 선반영

**Decision**: C5~C8을 `--create-only` raw SQL 마이그레이션으로 넣는다 (M2 C3/C4 방식).
`Payment.fundingContributionId`는 **FK 없이 nullable 컬럼만** 지금 만든다.

```sql
-- C5: 대안 금액 상한 — PRD 확정 정책의 마지막 방어선
ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_counter_le_requested
  CHECK ("counterAmount" IS NULL OR "counterAmount" <= "requestedAmount");
-- C6: 대안 3필드는 전무 또는 전유
ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_counter_all_or_none
  CHECK ( (("counterProductId" IS NULL)::int + ("counterProductSnapshot" IS NULL)::int
         + ("counterAmount" IS NULL)::int) IN (0, 3) );
-- C7: 자기 자신 금지
ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_no_self CHECK ("giverId" <> "receiverId");
-- C8: 결제 기록은 정확히 하나의 대상에 연결 (XOR)
ALTER TABLE "Payment" ADD CONSTRAINT payment_exactly_one_target
  CHECK ( ("giftRequestId" IS NOT NULL)::int + ("fundingContributionId" IS NOT NULL)::int = 1 );
```

**Rationale**: C5는 화면 필터(SCR-M3-13)가 첫 번째 방어선일 뿐이라는 분담표 경고 그대로 —
Prisma 문법으로 표현되지 않으므로 raw SQL이고, `db push`로 만든 DB에는 없다.
`fundingContributionId`를 지금 컬럼으로 만들지 않으면 C8을 `"giftRequestId" IS NOT NULL`로
줄여 걸었다가 M4에서 제약을 떨어뜨리고 다시 걸어야 한다 — 후행 비용이 높으므로 선반영한다
(원칙 V). FK는 `FundingContribution` 테이블이 생기는 M4 F1에서 `ADD CONSTRAINT` 한 줄로
붙인다 — 그쪽은 후행 비용이 낮다.

**M1·M2에서 배운 것**: 제약과 검증 테스트는 짝이다(T010/T011 · C3/C4). 제약이 안 걸린 상태는
화면상 완전히 정상으로 보인다. C5~C8도 삽입 시도 테스트를 먼저 쓰고(J3 자리), Phase 9에서
`pg_constraint` 조회로 재확인한다.

---

## R5 — 스냅샷은 생성 시 3종 + 응답 시 1종, 화면은 스냅샷만 읽는다

**Decision**: `createGiftRequest`가 `productSnapshot`(이름·이미지·가격) ·
`receiverDisplayName` · `respondDueAt`(절대 시각)을 복사하고, 수령자 응답 시
`shippingAddressSnapshot`(승인·대안 공통)과 대안 경로의 `counterProductSnapshot`을 복사한다.
요청 상세·결과·내역 화면은 **스냅샷 필드만 읽는다** — `Product`·`User` 조인 렌더 금지.

**Rationale**: constitution 원칙 IV 그대로다. 두 가지를 동시에 해결한다 — ① 상품 가격·이름이
바뀌어도 성립한 거래가 흔들리지 않는다 ② 관계 해제 후에도 거래 화면이 자기 데이터만으로
완결되어, 해제 예외 분기가 조회마다 달라붙지 않는다(도메인 모델 §7 구현 원칙).
`respondDueAt`을 절대 시각으로 박는 이유: `GIFT_RESPOND_TTL`을 운영 중 바꿔도 이미 뜬 요청이
흔들리면 안 된다(도메인 모델 §9).

**Alternatives considered**:
- *`productId` FK만 두고 조회 시 조인* — `is_active=false` 전환·가격 변경·관계 해제 세 경우
  모두에서 화면이 깨진다. 도메인 모델이 명시적으로 기각한 구조다.

---

## R6 — 상태 전이는 단일 모듈만 안다

**Decision**: `lib/gift/state.ts`에 전이 함수를 두고, 허용 화살표를 표로 고정한다.

| from | to | 트리거 |
|---|---|---|
| `PENDING` | `PAYING` | 승인 · 대안 확정 (R2 잠금) |
| `PENDING` | `EXPIRED` | 지연 평가 (R3) |
| `PENDING` | `CANCELLED` | 주는 사람 취소 |
| `PAYING` | `PAID` | 결제 성공 (R7) |
| `PAYING` | `PAYMENT_FAILED` | 결제 실패 (R7) |
| `PAYMENT_FAILED` | `PAYING` | 재시도 (R2 재잠금) |
| `PAYMENT_FAILED` | `CANCELLED` | 횟수·기한 초과 |

이 표에 없는 전이는 전부 거부한다. 액션·DAL이 `status`를 직접 UPDATE 하지 않는다.
**`DECLINED`는 존재하지 않는다** — 값 자체를 enum에 넣지 않는 것이 요구사항의 구현이다.

**Rationale**: 도메인 모델 §5 "상태 전이는 다이어그램의 화살표만 허용한다. 전이 함수 하나로
모아 검증한다." 전이가 여러 파일에 흩어지면 만료 후 승인·취소 후 결제 같은 조합 버그가
파일 경계에서 샌다. 단위 테스트가 허용·금지 화살표를 전수 검사한다.

---

## R7 — 알림 생성 경계: `chargeGiftRequest()`가 결제의 전부를 소유한다

**Decision**: `lib/gift/charge.ts`의 `chargeGiftRequest()`가 소유하는 것 —
PortOne 호출(R1 경유) + `Payment` 기록 + 결제 결과의 상태 확정(R6 전이 경유) +
`GIFT_PAID`/`GIFT_PAYMENT_FAILED` 알림 + 상한 초과 시 `CANCELLED` 확정과
`GIFT_CANCELLED_BY_PAYMENT` 알림. 호출자(승인·대안·재시도 액션)가 소유하는 것 —
검증 + 스냅샷 + **`PAYING` 잠금(R2)까지.** 그 외 알림은 발생 트랜잭션의 소유자가 만든다:
`GIFT_REQUEST_RECEIVED`(생성 액션) · `GIFT_COUNTERED`(대안 액션) · `GIFT_EXPIRED`(R3).

**Rationale**: 분담표 §5-D5·§6 — 이 경계가 흐려지면 상태 이중 확정과 알림 중복 발송이 난다.
호출 지점이 셋(승인·대안·재시도)이라 결제 이후 처리를 호출자에 두면 세 벌이 복제되고,
하나만 고치는 회귀가 생긴다. 알림 파일(`lib/dal/notification.ts`)은 M2 소유 구조를 유지하되
**생성은 각 트랜잭션 안에서** — M2 R5(성사·카운트·알림이 한 트랜잭션)와 같은 이유다.

---

## R8 — 카운트다운은 공용 컴포넌트 하나 + 서버 시각 보정

**Decision**: `components/gift/countdown.tsx`(`'use client'`) 하나를 홈·전송 완료·요청 상세·
수신·재선택·내역 6화면이 재사용한다. 서버가 `respondDueAt`과 **렌더 시점의 서버 시각**을 함께
내려주고, 컴포넌트는 서버-클라이언트 시계 편차를 보정해 남은 시간을 계산한다. 0이 되면 만료
표시로 전환하되 **판정은 하지 않는다** — 판정은 다음 서버 왕복에서 R3가 한다.

**Rationale**: 협업 규칙 §8 "카운트다운 컴포넌트는 하나만" — 화면마다 만들면 만료 표시가
화면마다 어긋난다. 클라이언트 시계는 신뢰할 수 없으므로 서버 시각 기준 보정이 필요하다.
5분 미만 `ink`, 1분 미만 `alarm` 강조와 펄스·깜빡임 금지는 화면 명세 §4.6·§4.7을 따른다.

---

## R9 — `unwanted`는 3중 차단, `have`는 표시만, 추천 정렬은 카테고리 일치 + 가격

**Decision**:
1. **목록** — `lib/dal/product.ts`의 대상 필터가 `TasteItem(kind=UNWANTED)`의 카테고리를
   제외 조인으로 뺀다.
2. **상세** — 매칭 배너 3상태를 서버에서 판정해 내려주고, `UNWANTED` 일치면 선물하기 비활성.
3. **생성** — `createGiftRequest` 검증 순서에 `unwanted` 차단이 들어간다 (contracts §3).

`have`는 어디서도 제외하지 않고 주의 배너만 띄운다. 추천(SCR-M3-05)은 `want` 매칭 섹션 +
같은 카테고리 확장 섹션이며, 랭킹은 **카테고리 일치 + 가격 오름차순**까지만(화면 명세 갭 9).
검색은 `name` 부분 일치(`contains`, 대소문자 무시)로 충분하다(갭 10).
**친구 취향을 읽는 이 조회들은 전부 `requireActiveFriendship()`을 지난다** (M2 R8의 관문 유지).

**Rationale**: 검색으로 상세에 우회 진입할 수 있어 목록 필터만으로는 부족하고(화면 명세
SCR-M3-04), 화면 차단은 클라이언트 우회가 가능하므로 서버 생성 검증이 마지막 방어선이다.
"이미 있어요"와 "관심 없어요"는 다르다 — 같은 텀블러라도 다른 브랜드는 성립한다.

---

## R10 — 빌링키는 사용자당 재사용, AES-256-GCM 앱 레벨 암호화

**Decision**: `PaymentMethod.billingKey`는 Node 표준 `crypto`의 AES-256-GCM으로 암호화해
저장한다(`lib/crypto/billing-key.ts`). 키는 env `BILLING_KEY_ENCRYPTION_KEY`(32바이트
base64, `.env.local`에만). 빌링키는 사용자당 재사용 — 카드 등록은 한 번, 동의는 요청마다.
카드번호·CVC는 mock·실연동 어느 쪽에서도 앱을 지나지 않는다.

**Rationale**: constitution 데이터 보호 — "애플리케이션은 빌링키만 암호화해 보관한다(MUST)."
GCM은 인증 태그가 있어 변조가 복호화 실패로 드러난다. 새 의존성 없이 표준 `crypto`로 충분하다
(M2 R2와 같은 판단). DB 레벨 암호화(pgcrypto)는 키가 쿼리에 노출되고 Supabase 공용 프로젝트에서
키 관리가 더 어렵다.

**Alternatives considered**:
- *평문 저장 + "테스트 키니까"* — mock 모드라도 구조를 평문으로 두면 실연동 전환 시점에
  마이그레이션이 필요해진다. 처음부터 암호화 왕복을 테스트한다.

---

## R11 — 설정값은 전부 env, 생성 시점에 절대 시각으로 스냅샷

**Decision**: 도메인 모델 §9의 5종을 그대로 쓴다 — `GIFT_RESPOND_TTL`(기본 5분) ·
`GIFT_PAYMENT_RETRY_WINDOW`(24시간) · `GIFT_PAYMENT_MAX_ATTEMPTS`(3) · `FRIEND_INVITE_TTL`
(M2 기존) · `FUNDING_RESERVATION_TTL`(M4 예약). 여기에 `PORTONE_MODE`(R1)와
`BILLING_KEY_ENCRYPTION_KEY`(R10)가 더해진다. 읽기는 기본값을 가진 헬퍼 하나로 모은다.

**Rationale**: PRD — "설정 가능해야 하며 실서비스 배포 시 조정." 하드코딩은 협업 규칙 §8이
명시적으로 금지한다. 절대 시각 스냅샷(R5) 덕에 운영 중 변경이 기존 요청에 영향을 주지 않는다.

---

## R12 — 테스트 전략: 3층 유지, mock 고정, 화면 의존은 probe skip

**Decision**: 단위(Vitest) · 통합(Vitest + 실 DB) · E2E(Playwright, `chromium` + `mobile-360`)
3층을 유지한다. E2E 계정은 M2의 2개(`E2E_USER_*` · `E2E_USER2_*`)로 충분하다 — 3계정은
M4부터. E2E·통합 테스트는 **항상 `PORTONE_MODE=mock`**이고, 실패 경로는 R1의 mock 카드
규약(뒷자리 `0000`)으로 만든다. 팀원(D·H) 소유 화면에 의존하는 E2E 단계는 **probe로 확인 후
skip** 처리한다 — M2 T048에서 세운 방식 그대로.

**Rationale**: M1·M2에서 두 번 확인한 함정 — env가 비면 E2E가 실패 대신 skip 되어 초록으로
보인다. `skipped` 수 확인을 검증 절차에 넣는다(quickstart). 동시성 테스트는
`accept-invite-concurrent.test.ts`, 제약 테스트는 `friendship-constraints.test.ts`가 템플릿이다.
통합 테스트 픽스처는 `randomUUID()` 격리 + `afterAll` 정리 — 워크트리 4개가 같은 DB를 본다.
