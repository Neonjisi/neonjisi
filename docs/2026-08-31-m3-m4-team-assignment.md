# 팀 업무 분담 (초안) — 마일스톤 3 · 4

**작성일**: 2026-08-31 · **팀**: 4명 · Status: **SUPERSEDED (M3)** — M3 분담은
[specs/003-gift-request-payment/team-assignment.md](../specs/003-gift-request-payment/team-assignment.md)(T번호 확정본)가 기준이다.
M4 분담은 §7이 기준으로 남으며, `specs/004-*` tasks가 나오면 같은 방식으로 확정한다.

> 근거: `.claude/prds/neonjisi.prd.md`(rev.3) · `docs/domain-model.md` · `docs/2026-08-26-screen-spec.md`(§8·§9) · `docs/product-lens-review-v3.md` · M1·M2 분담표
> ****이 문서는 스펙 이전의 초안이다.** M2와 같은 순서 — `specs/003-*`에서 specify → clarify → plan → tasks 가 돌고 나면, 이 분담을 tasks.md의 T번호에 매핑해 `team-assignment.md`로 확정한다. 아래 번호(J1·D1·H1…)는 **이 문서 안의 참조용 임시 번호**이며 실행 순서를 담는다.
> **rev.2 (2026-08-31)**: 재검토 반영 — ① gift 알림 7종→6종 정정 ② `gift_expired`(J6)·`gift_request_received`(J10) 발송 배정 ③ J8 시드 주입 신설, 기존 J8~J19 → J9~J20 재부여 ④ 앱 셸 전환·홈 카드 접기를 H17에 명시 ⑤ D5↔J14의 상태 확정·알림 경계 확정 ⑥ D14를 Phase 6 병행으로

---

## 0. 전제

- **M2 구현 완료가 선행이다.** M3의 모든 경로가 M2 산출물(`lib/dal/invite.ts` · `lib/dal/friend.ts` · `lib/dal/notification.ts` · `app/friends/*` · `Friendship` 스키마) 위에 쌓인다. 현재 main에는 M1 구현 + M2 문서까지만 있다.
- M3 = **선물이 수령자 확인을 거쳐 결정된다** (엔티티 6종 · 화면 18개 · SCR-M3-01\~18)
- M4 = **고가 선물을 여럿이 함께 준비한다** (엔티티 2종 · 화면 8개 · SCR-M4-01\~08)
- 완료 판정은 도메인 모델 §11을 그대로 쓴다 — M3: "승인·대안 제시 양쪽 경로로 자동 결제가 완료된다. 결제 실패 후 재시도로 복구된다." M4: "달성선 기준으로 성사·취소가 갈리고, 미달 시 전액 환불된다. 차액 자동 결제가 동작한다."

---

## 1. 팀

| 이니셜 | GitHub | 역할 | M3에서 맡는 것 | M4에서 맡는 것 |
| --- | --- | --- | --- | --- |
| **J** | `Gnuke` | 풀스택 | 스키마 6종·CHECK 제약, 상태 전이, **수령자 응답 스토리 통째** | 펀딩 스키마·2단계 예약 동시성·성사 판정 |
| **D** | `ReDocu` | 풀스택 | **PortOne 연동 전부**, 결제수단 스토리 통째, 결제 실행·실패 복구 | 환불·차액 자동 결제·펀딩 알림 |
| **H** | `jisang` | 프론트엔드 | 카탈로그 스토리 통째, 홈·일정·요청 화면 전부 | 펀딩 화면 8개 전부 |
| **S** | `syjo6658` | 기획 | **착수 조건 4건 닫기**, 동의 문구, Product 시드 콘텐츠, 검증 | 고지 문구, 3계정 시연 시나리오, 검증 |

---

## 2. 어떻게 자르나 — M2에서 달라지는 것

M2의 "**스토리로 자른다**"를 유지하되, M3에는 **전문 축 두 개가 층으로 남는다.**

1. **스키마·마이그레이션은 J만** — M1·M2 규칙 그대로. M3는 모델 5종 + enum 6종 + CHECK 4종이 한 번에 들어가 이 규칙이 어느 때보다 무겁다.
2. **PortOne 은 D 혼자 만진다** — 빌링키 발급·자동 결제·환불(M4)이 전부 한 사람 손에 있어야 실·모의 모드 전환과 실패 처리의 일관성이 유지된다.

그 위에서 스토리를 나눈다. Server Action 파일 분할(M2 §1)도 계속 간다 — **US끼리 같은 파일을 만지지 않게 파일을 먼저 나눈다.**

```
app/gifts/actions/
├── shared.ts        ← 기반 단계 D (M2 패턴 이식). 이후 아무도 안 고침
├── request.ts       ← US3 · J  (생성 · 취소)
├── respond.ts       ← US4 · J  (승인 · 대안 제시)
└── payment.ts       ← US5 · D  (재시도)
app/payment-methods/actions.ts   ← US2 · D
app/events/actions.ts            ← US6 · H
```

```
Phase 0  착수 조건       S 주도, 전원 결정   ← 여기 안 닫히면 태스크를 다시 나눈다
Phase 1  준비            전원 (각자 자기 컴퓨터)
Phase 2  기반 공사       J D H              ← 스키마 · PortOne 인터페이스 · 공용 컴포넌트
Phase 3  US1 카탈로그    H 단독      [P]    ← 상품을 탐색하고 unwanted 가 걸러진다
Phase 4  US2 결제수단    D 단독      [P]    ← Phase 3 과 병행
Phase 5  US3 요청 생성   J 서버 + H 화면 + S 문구
Phase 6  US4 수령자 응답 J 단독 + D14 병행  ← 정확성이 걸린 최대 위험 구간
Phase 7  US5 결제 실행   D 단독             ← 마일스톤 완료 판정
Phase 8  US6 홈·일정     H 단독      [P]    ← Phase 6~7 과 병행 가능
Phase 9  마무리          전원
```

---

## 3. Phase 0 — M3를 막고 있는 결정 4건

**M2 분담표 §4-S가 이미 예고한 병목이다** — "결제 연동 방식이 안 정해진 상태로 M3 태스크를 나누면 나중에 전부 다시 나눠야 한다." S가 주도해 안건을 만들고 **전원이 결정한다.**

| \# | 결정 | 선택지 | 출처 | 영향 |
| --- | --- | --- | --- | --- |
| P0-1 | **PortOne 연동 수준** | 실연동(테스트 모드) / 시뮬레이션(mock) / 혼합 | 도메인 모델 §12 · product-lens v3 §6 "수업 프로젝트라면 시뮬레이션 권장" | D1의 구현 범위, E2E 자동화 가능 여부, Phase 7 크기 |
| P0-2 | **캘린더의 위치** | 홈 목록형으로 충분 / 별도 월간 뷰 | PRD Open Question · 화면 명세는 **목록형으로 이미 설계됨**(SCR-M3-17 갭) | H16\~H17. 월간 뷰 결정 시 H 태스크 +2 |
| P0-3 | **"반려" 대체 문구 확정** | 화면 명세 제안 "다른 것도 좋아요" 채택 여부 | PRD Constraints · 도메인 모델 §13-4 | J15 · S 문구 세트 |
| P0-4 | **재결제 동의 문구 v1** | SCR-M3-09 초안 기반 확정 | 도메인 모델 §10 — 이후 수정마다 버전 업 | J11 (`consent_version` 시작점) |

> **권장**: P0-1은 **mock 기본 + 인터페이스 뒤에 실구현을 숨기는 혼합**이다. D1이 처음부터 실·모의 양쪽을 같은 시그니처로 만들면, 시연 직전에 env 스위치 하나로 전환할 수 있고 E2E는 항상 mock으로 돈다. 이 경우 결정을 "언제 실키를 붙이나"로 미룰 수 있다.

---

## 4. M3 — 한눈에 보기

| 팀원 | 임시 번호 | 한 줄 요약 |
| --- | --- | --- |
| **J** | 20개 | 스키마와 제약을 세우고, 승인·대안 제시 트랜잭션을 화면까지 통째로 맡는다 |
| **D** | 17개 | PortOne을 혼자 소유하고, 결제수단과 결제 실행·복구를 끝낸다 |
| **H** | 21개 | 카탈로그를 통째로 소유하고, 홈·일정·요청 화면 전부를 만든다 |
| **S** | 4건 + 상시 | 착수 조건을 닫고, 동의 문구와 시드 콘텐츠로 시연을 성립시킨다 |

> M2와 같은 원칙 — S의 번호가 적은 것은 일이 적어서가 아니다. **동의 문구(P0-4)와 Product 시드 콘텐츠 없이는 M3 시연 자체가 성립하지 않는다.**

---

## 5. M3 팀원별 상세

### 👤 J — 풀스택

**한 문장으로**: DB 구조와 제약을 세우고, 이 제품에서 돈이 걸린 유일한 트랜잭션(승인→결제)을 맡는다.

#### Phase 2 — 기반 공사

| \# | 할 일 |
| --- | --- |
| J1 | `prisma/schema.prisma` — `Product`·`PaymentMethod`·`GiftRequest`·`Payment`·`Event` 모델 + enum(`GiftStatus`·`GiftResolution`·`PaymentStatus`·`PaymentMethodStatus`·`EventType`) + `NotificationType`에 gift 6종 추가(`gift_request_received`·`gift_countered`·`gift_paid`·`gift_payment_failed`·`gift_cancelled_by_payment`·`gift_expired` — 도메인 모델 11종 − M2 기구현 1종 − funding 4종) + `TasteItem.product_id`(nullable FK) |
| J2 | 마이그레이션 — **J만 만든다** (M1·M2 규칙 유지) |
| **J3** | **제약 검증 테스트 먼저** — counter 초과 금액 삽입, counter 3필드 부분 NULL, Payment 양쪽 FK/무FK, giver=receiver |
| **J4** | **CHECK 4종을 raw SQL로 직접** (아래 경고) |
| J5 | J3을 초록으로 |
| J6 | `lib/gift/state.ts` — **상태 전이 함수 단일 모듈** (도메인 모델 §5 화살표만 허용) + 지연 만료 평가 `evaluateExpiry()` (§8 — cron 없음, 조회가 트리거) + **만료 확정 시 `gift_expired` 알림 생성** — 도메인 모델 §8은 만료 *알림*을 범위 밖이라 했지만 화면 명세 SCR-M3-02·M3 플로우에는 있다. 지연 평가가 상태를 기록하는 바로 그 지점에서 만들면 cron 없이 된다 |
| J7 | `lib/dal/gift.ts` — 보낸/받은 요청 조회, 홈 승인 대기. **모든 조회가 J6 만료 평가를 경유한다** |
| J8 | `prisma/seed.ts` — Product 시드 30~50건 주입. 콘텐츠는 S가 표로 전달(§5-S②, 마감 Phase 3 시작 전) — **H3의 카탈로그 E2E가 상품 없이는 못 돈다** |

> 🚨 **J3\~J5가 M2의 T005\~T008 자리다.** 이번 제약은 돈에 걸려 있다.
>
> ```sql
> ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_counter_le_requested
>   CHECK (counter_amount IS NULL OR counter_amount <= requested_amount);
> ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_counter_all_or_none
>   CHECK ( ((counter_product_id IS NULL)::int + (counter_product_snapshot IS NULL)::int
>          + (counter_amount IS NULL)::int) IN (0, 3) );
> ALTER TABLE "GiftRequest" ADD CONSTRAINT gift_no_self CHECK (giver_id <> receiver_id);
> ALTER TABLE "Payment" ADD CONSTRAINT payment_exactly_one_target
>   CHECK ( (gift_request_id IS NOT NULL)::int + (funding_contribution_id IS NOT NULL)::int = 1 );
> ```
>
> `counter_amount <= requested_amount`는 **PRD 확정 정책("최초 요청 금액 이하")의 마지막 방어선**이다. 화면 필터(SCR-M3-13)는 첫 번째 방어선일 뿐이며 둘 다 있어야 한다. Prisma 문법으로 표현되지 않으므로 raw SQL이고, `db push`로 만든 DB에는 없다 — J19에서 재확인. (M4의 `funding_contribution_id`는 F1에서 FK가 생기기 전까지 컬럼만 선반영할지 plan에서 정한다.)

#### Phase 5 — US3 요청 생성 (서버)

| \# | 할 일 |
| --- | --- |
| J9 | 통합 테스트 먼저 — 생성 검증 순서(친구 `active` → 활성 결제수단 → `unwanted` 차단 → 자기 자신), 동의 없이 생성 불가 |
| J10 | `app/gifts/actions/request.ts` — `createGiftRequest`(스냅샷 3종: `product_snapshot`·`receiver_display_name`·`respond_due_at` **절대 시각** + 생성 성공 시 `gift_request_received` 알림 — SCR-M3-10) · `cancelGiftRequest`(`pending`에서만) |
| J11 | `lib/gift/consent.ts` — 동의 문구 상수 + `consent_version` (문구는 S의 P0-4 입력) |

> `respond_due_at`**은 생성 시점에 절대 시각으로 스냅샷한다**(도메인 모델 §9). `GIFT_RESPOND_TTL`(기본 5분)을 하드코딩하면 PRD의 "설정 가능해야 하며 실서비스 배포 시 조정"이 깨진다. env로.

#### Phase 6 — US4 수령자 응답 (화면까지 통째)

| \# | 할 일 | 순서 |
| --- | --- | --- |
| J12 | E2E — 승인 / 대안 제시 / 만료 후 응답 / 취소 후 응답. **계정 2개** | **먼저** |
| J13 | 통합 테스트 — `pending → paying` 조건부 UPDATE 동시성(**동시에 두 번 승인해도 결제는 1회**), counter 상한, 만료 후 응답 거부 | **먼저** |
| J14 | `app/gifts/actions/respond.ts` — `approveGift` · `counterGift`: 만료 지연 평가 → 상한 검증 → 배송지 스냅샷 → `paying` **잠금** → D의 `chargeGiftRequest()` 호출. **잠금 이후의 상태 확정·결제 알림은 D5 소유** — J14는 대안 경로의 `gift_countered` 알림만 보낸다 |  |
| J15 | SCR-M3-12 요청 수신 — `components/gift/receiver-respond.tsx` (`'use client'`) |  |
| J16 | SCR-M3-13 대안 재선택 — 상한 필터 + 내 `want` 우선. **H4의 상한 필터 함수와 H8의 상품 카드를 재사용한다** |  |
| J17 | SCR-M3-14 배송지 — `shipping_address_snapshot`. "이 주소는 이 선물에만 사용됩니다" |  |
| J18 | J12·J13을 초록으로 + M2 해제 다이얼로그에 **"진행 중인 선물은 그대로 진행됩니다" 문구 추가** — M2에서 거짓말이라 뺐던 문장이 M3에서 참이 된다 | 마지막 |

> 🔑 **J14의** `paying` **잠금이 이 마일스톤의 단일 방어 지점이다** (M2의 T032 같은 자리). 도메인 모델 §5: "`paying`은 멱등성 장치다. 조건부 UPDATE가 0행이면 이미 진행 중이므로 중단한다." 이게 없으면 더블탭·재시도·동시 요청에서 **중복 청구**가 난다. 화면상으로는 완전히 정상으로 보인다.
> ****거절 버튼을 만들지 않는다.** `declined` 상태가 없는 것 자체가 요구사항의 구현이다.

#### Phase 9 — 마무리

| \# | 할 일 |
| --- | --- |
| J19 | 제약 확인 — `pg_constraint`에서 CHECK 4종 조회 (M2 T056 패턴) |
| J20 | `npm run lint` · `npm run build` 통과 |

---

### 👤 D — 풀스택

**한 문장으로**: PortOne을 혼자 소유하고, 카드가 등장하는 모든 화면과 실패 경로를 끝낸다.

#### Phase 2 — 기반 공사

| \# | 할 일 |
| --- | --- |
| **D1** | `lib/portone/client.ts` — `issueBillingKey` · `chargeBillingKey` · (M4용 `refund`) 인터페이스 + **mock 구현** + `PORTONE_MODE` 스위치 (P0-1 결정 반영) |
| D2 | 단위 테스트 — mock 결제 성공 / 실패 / 타임아웃 |
| D3 | `app/gifts/actions/shared.ts`(M2 패턴 이식) + `proxy.ts` matcher에 `/gifts`·`/products`·`/payment-methods`·`/events` 추가 |
| D4 | `lib/dal/payment.ts` — `Payment` 기록 (XOR 제약은 J4가 건다) |
| **D5** | `lib/gift/charge.ts` — **결제 실행 함수** `chargeGiftRequest()`: PortOne 호출 + `Payment` 기록 + **결제 결과의 상태 확정(J6 전이 함수 경유)** + `gift_paid`/`gift_payment_failed` 알림**까지 소유**. **J14가 호출하는 바로 그 함수** — 재시도(D13)도 같은 함수를 탄다 |

> ⚠️ **D1·D5가 M3의 T017이다** — M2에서 "T017이 US2·US3·US4의 E2E를 전부 막는다. 가장 먼저 끝낸다"고 했던 그 자리. D5의 시그니처가 확정되기 전에는 J14가 시작할 수 없다. **시그니처 확정에는 경계가 포함된다 — `paying` 잠금까지가 호출자(J14·D13), 그 뒤 상태 확정·`Payment` 기록·결제 알림은 전부 D5 안이다. 양쪽에 두면 중복 발송이 난다.** **Phase 2에서 mock으로 완결시키고**, 실연동 전환(P0-1)은 Phase 7에서 한다.
>
> 🔒 **빌링키는 암호화 저장, 카드번호·CVC는 앱이 만지지 않는다**(도메인 모델 §5). PortOne 실키는 `.env.local` — 절대 커밋하지 않는다.

#### Phase 4 — US2 결제수단 (단독, 화면까지)

| \# | 할 일 |
| --- | --- |
| D6 | E2E — 등록 / 삭제(진행 중 요청 경고) / 만료 표시 |
| D7 | `lib/dal/payment-method.ts` — 등록(빌링키 재사용 원칙) · 조회 · 삭제 |
| D8 | `app/payment-methods/actions.ts` |
| D9 | SCR-M3-06 등록 화면 (PortOne SDK 위젯, `'use client'`) — "카드 정보는 넌지시에 저장되지 않습니다" |
| D10 | SCR-M3-07 관리 화면 + 마이 탭 만료 배지 |
| D11 | D6을 초록으로 |

> **빌링키는 사용자당 재사용한다. 동의는 요청마다, 카드 등록은 한 번만**(M3 설계 원칙 3). 등록 화면이 요청 플로우(H10)에서 강제 진입되므로 **복귀 경로**를 지켜야 한다.

#### Phase 7 — US5 결제 실행 · 실패 복구 (단독)

| \# | 할 일 |
| --- | --- |
| D12 | 통합 테스트 — 실패 → 재시도 → 성공 / `GIFT_PAYMENT_MAX_ATTEMPTS`(3) 초과 → `cancelled` + **양쪽 알림** / `payment_retry_until`(24h) 초과 |
| D13 | `app/gifts/actions/payment.ts` — `retryGiftPayment` (결제수단 변경 포함, `payment_failed → paying` 재잠금 후 D5 경유) |
| D14 | SCR-M3-15 결제 결과 화면 3변형 (`paid` / `expired` / `cancelled`) — **Phase 6과 병행으로 먼저 만든다.** J12(승인 경로 E2E)의 종착 화면이라 Phase 6 완료 판정이 여기 걸린다 |
| D15 | SCR-M3-16 실패 복구 화면 — 시도 횟수 · 기한 표시 |
| D16 | 알림 목록 확장 — gift 6종의 표시 문구·탭 이동 매핑 (`components/notification/` — M2에서 D가 만든 파일) |
| D17 | D12를 초록으로 + P0-1이 실연동이면 여기서 전환·검증 |

> **수령자에게 실패 진행 상황을 실시간으로 노출하지 않는다** — 주는 사람의 결제 실패는 사적 정보다. 수령자는 **최종 취소 시점에만** `gift_cancelled_by_payment`로 고지받는다(SCR-M3-16). "승인까지 해놓고 소식이 끊기는 것이 최악이다"(도메인 모델 §5) — 이 알림을 빼먹으면 안 된다.

---

### 👤 H — 프론트엔드

**한 문장으로**: 카탈로그 스토리를 통째로 소유하고, 홈을 액션 허브로 완성한다.

#### Phase 2 — 기반 공사

| \# | 할 일 |
| --- | --- |
| H1 | `app/gifts/error.tsx` · `app/products/error.tsx` · `app/payment-methods/error.tsx` · `app/events/error.tsx` |
| **H2** | `components/gift/countdown.tsx` (`'use client'`) — **공용 카운트다운 하나** (홈·전송완료·요청상세·수신·재선택·내역 6화면 재사용) |

> **H2를 하나만 만든다.** `respond_due_at` 절대 시각 기준으로 남은 시간을 계산하며, 서버가 내려준 시각과 클라이언트 시계의 차를 보정한다. 화면마다 따로 만들면 만료 판정 표시가 화면마다 어긋난다. 5분 미만 `ink`, 1분 미만 `alarm`(§4.6) — 펄스·깜빡임 금지(§4.7).

#### Phase 3 — US1 카탈로그 (통째 소유)

| \# | 할 일 | 순서 |
| --- | --- | --- |
| H3 | E2E — 검색 / 대상 필터 / `unwanted` 차단 / 추천 / 매칭 배너 3상태 | **먼저** |
| H4 | `lib/dal/product.ts` — 목록·검색·카테고리 필터·**대상 필터**(`unwanted` 카테고리 제외 조인)·추천(`want` 매칭 + 카테고리 확장)·**상한 필터**(J16이 재사용) |  |
| H5 | SCR-M3-03 선물 탭 — 대상 필터가 R7 완화책이다 |  |
| H6 | SCR-M3-04 상품 상세 — 매칭 배너 3상태 + `unwanted`**면 선물하기 비활성** |  |
| H7 | SCR-M3-05 친구 맞춤 추천 — **제외 안내가 신뢰 장치** + SCR-M2-06에서 숨겼던 `이 취향에 맞는 선물 보기` 버튼 노출 |  |
| H8 | `components/product/product-card.tsx` 등 목록 컴포넌트 |  |
| H9 | H3을 초록으로 | 마지막 |

> 🔑 **H6의** `unwanted` **차단이 이 제품의 핵심 가치가 화면에 드러나는 지점이다**(화면 명세). 검색으로 우회 진입할 수 있으므로 **목록 필터만으로는 부족하다** — 상세에서도 막고, J9(요청 생성 검증)이 서버에서 한 번 더 막는다. 3중이다.
>
> `have`**는 제외하지 않고 표시만 바꾼다** — "이미 갖고 있어요"와 "관심 없어요"는 다르다. 목록에서 지우는 것은 `unwanted`뿐이다.
> ****친구 취향을 읽는 새 조회는 전부** `requireActiveFriendship()`**을 지난다** — M2가 세운 단일 접근 제어 지점을 우회하는 함수를 만들지 않는다.

#### Phase 5 — US3 요청 화면

| \# | 할 일 |
| --- | --- |
| H10 | SCR-M3-08 요청 확인 — 진입 차단 조건 4종, 결제수단 없으면 SCR-M3-06 **강제 진입 후 복귀** |
| H11 | SCR-M3-09 재결제 동의 — **별도 화면 · 체크 전 버튼 비활성 · 금액을 숫자로**. SCR-M3-08 하단에 체크박스를 얹으면 동의의 구체성 요건이 깨진다(product-lens v3 §3) |
| H12 | SCR-M3-10 전송 완료 |
| H13 | SCR-M3-11 요청 상세(주는 사람) — **상태 7변형** + 대안 제시 대조 표시("차액 29,000원은 청구되지 않았습니다") + `app/gifts/[id]/page.tsx` 얇은 롤 분기(**J가 수신 분기를 얹는다** — M2의 `[userId]` 패턴) |

#### Phase 8 — US6 홈 · 일정 · 내역 (Phase 6\~7과 병행 가능)

| \# | 할 일 | 순서 |
| --- | --- | --- |
| H14 | E2E — 홈 허브: 승인 대기 최상단, 만료 시 카드 상태 전환 | **먼저** |
| H15 | `lib/dal/event.ts` + `app/events/actions.ts` — CRUD + 친구 일정 조회(`requireActiveFriendship()` **경유**) |  |
| H16 | SCR-M3-17 일정 등록·편집 — "친구에게 이 일정이 보입니다" 고지 (P0-2 결정 반영) |  |
| H17 | SCR-M3-01 홈 개편 — **승인 대기가 최상단** (5분 TTL이라 스크롤 아래 두면 만료된다. 다건이면 임박순 1건만 펼치고 나머지는 접는다 — 화면 명세 갭 12) · 일정 · 펀딩 자리(M4까지 섹션 숨김) + **앱 셸 전환** — 선물 탭 활성화 · 시작 화면을 친구 탭에서 홈으로 (화면 명세 §12) |  |
| H18 | SCR-M2-01 친구 탭의 일정 섹션 활성화 — M2 T028에서 "Event는 M3 엔티티"라 보류했던 영역 |  |
| H19 | SCR-M3-18 선물 내역(`app/my/gifts`) + 마이 탭 메뉴 노출(선물 내역·결제수단 — M2까지 숨김) + SCR-M1-09 위시리스트에 `( 카탈로그에서 고르기 )` 진입점(`product_id` 연결, **텍스트 경로는 유지**) |  |
| H20 | H14를 초록으로 | 마지막 |

#### Phase 9 — 마무리

| \# | 할 일 |
| --- | --- |
| H21 | 360px 검증(`mobile-360`에 M3 화면 추가) + `'use client'` 점검 + 컴포넌트 500줄 점검 |

---

### 👤 S — 기획

**한 문장으로**: 착수 조건을 닫고, 문구와 시드 데이터로 시연을 성립시킨다.

#### ① Phase 0 — 착수 조건 4건 (§3, 마감: Phase 2 시작 전)

M2 분담표에서 이미 배정된 "M3 준비"의 완결이다. P0-1(PortOne)이 최우선 — **이게 닫히기 전에는 D1의 구현 범위가 정해지지 않는다.**

#### ② Product 시드 콘텐츠 (마감: Phase 3 시작 전)

30\~50건 — 이름 · 가격 · `Category` 매핑 · 이미지 URL. 주입 코드(`prisma/seed.ts`)는 J(J8).

> **시나리오 커버 조건이 있다.** E2E 계정의 취향과 엮여서 다음이 각각 최소 1건씩 성립해야 시연이 된다: ① `want` 상세와 일치하는 상품(긍정 배너) ② `have` 카테고리 상품(주의 배너) ③ `unwanted` 카테고리 상품(선물하기 차단) ④ 요청 금액보다 싼 대안 후보 여러 건(재선택 화면). 그냥 상품 50개를 넣으면 매칭이 하나도 안 걸린 텅 빈 추천 화면을 시연하게 된다.

#### ③ 화면 문구 (마감: 각 화면 구현 전)

| 어디서 | 무엇을 |
| --- | --- |
| 재결제 동의 (H11) | **P0-4 확정 문구.** 금액 상한을 숫자로 박는 템플릿. 이후 수정마다 `consent_version` 업 |
| 요청 수신 (J15) | **P0-3** — "다른 것도 좋아요" 채택 여부. 거절이 아닌 대안 제시로 읽혀야 한다 |
| 대안 확정 (J16) | "민수님에게 다른 상품을 골랐다고 알려집니다" — 확정 **전** 고지 |
| 만료 (D14) | 수령자를 **탓하지 않는** 문구 — "확인하지 못했습니다"는 사실 서술까지만 |
| 결제 실패 취소 (D14) | 수령자 쪽 — "민수님께 별도로 연락해보세요" |
| 배송지 (J17) | "이 주소는 이 선물에만 사용됩니다" — D3 프라이버시 설계의 유일한 사용자 고지 |
| 홈 빈 상태 (H17) | 친구 0명 → 링크 발급 유도 |

#### ④ Phase 9 — quickstart 전체 수동 검증 + 지표

- quickstart V1\~Vn을 2계정으로 직접 밟는다. `skipped` **수를 확인한다** (M1·M2와 같은 함정).
- PRD 지표 "**선물 승인률**(대안 제시 없이 승인)"의 측정 쿼리가 도는지 확인 — `resolution` 필드 집계면 별도 이벤트 수집 없이 나온다.

#### ⑤ 상시 — M4 준비 (Phase 6\~8 중)

- **3계정 시연 시나리오** — 펀딩은 주최자·수령자·참여자의 3주체 구조라 계정 2개로는 검증이 안 된다 (`E2E_USER3` 신설, §8 참조)
- 펀딩 문구 초안: R5 공개 고지 · 차액 부담 동의 v1 · 미달/취소 구분 문구

---

## 6. M3 충돌 지도

M2처럼 **파일을 먼저 나눠서 소유 규칙 자체를 없앤다.** 남는 조율 지점은 여섯이다.

| 파일 | 건드리는 스토리 | 해법 |
| --- | --- | --- |
| `lib/gift/charge.ts` | US4(J가 호출) · US5(D가 구현) | **D 소유.** Phase 2에서 시그니처 + mock 확정 — **이게 M3의 최우선 선행 태스크다.** 시그니처에는 상태 확정·결제 알림이 D5 안이라는 경계가 포함된다(§5-D5) |
| `app/gifts/[id]/page.tsx` | US3 상세(H13) · US4 수신(J15) | H가 얇은 롤 분기를 먼저, J가 수신 뷰를 얹는다 (M2 `[userId]` 패턴) |
| `lib/dal/product.ts` | US1(H4) · US4 재선택(J16) | **H 소유.** 상한 필터 함수를 H4에 미리 포함한다 (M2 T041의 역방향) |
| `app/page.tsx` (홈) | US4 데이터(J7) · US6(H17) · M4 펀딩 | **H 소유.** J는 DAL 함수만 제공, M4에서도 같은 방식 |
| `prisma/schema.prisma` · migrations · `seed.ts` | 전부 | **J만.** 시드 콘텐츠는 S가 표로 전달 |
| `lib/dal/notification.ts` | 발송(J6·J10·J14·D5) · 목록(D16) | **파일은 D 소유** 유지(M2). 알림 **생성**은 각 트랜잭션 소유자가 트랜잭션 안에서 |

---

## 7. M4 — 분담 개요

M3가 끝나야 해상도가 올라간다(펀딩은 M3의 `Product`·`PaymentMethod`·`Payment`·알림 인프라를 전부 재사용한다). 스토리 경계와 소유만 먼저 긋는다. 상세 태스크는 `specs/004-*` 파이프라인에서.

```
Phase F1  기반        J        ← 스키마 2종 + CHECK + 총액 정의
Phase F2  US1 개설    H 화면 + J 서버 + S 문구   (SCR-M4-01~03)
Phase F3  US2 참여    J 예약 + D 결제 + H 화면   (SCR-M4-04~06) ← 동시성 최대 위험 구간
Phase F4  US3 정산    D 단독                     ← 성사·미달·환불·차액. 완료 판정
Phase F5  US4 내역    H 단독                     (SCR-M4-07~08 + 홈 섹션 활성화)
```

| 팀원 | 맡는 것 | 핵심 주의 |
| --- | --- | --- |
| **J** | `Funding`·`FundingContribution` 스키마 + CHECK 2종(`min <= goal` · `organizer = receiver → min = goal`) · **2단계 예약**(`SELECT FOR UPDATE` 잠금 → 잔여 확인 → `reserved`) · **총액 정의 2종을 단일 모듈로**(판정용 = `paid`만 / 캡용 = `reserved`+`paid`) · 상태 전이(조기 성사 포함) | "판정에 `reserved`를 넣으면 결제 안 될 돈으로 성사를 선언하고, 캡에서 빼면 동시 참여가 목표를 넘긴다"(도메인 모델 §6). **두 합산이 코드 두 곳에 흩어지면 조용히 깨진다** |
| **D** | 참여 결제(예약 확정) · **전액 환불**(`failed`·`cancelled` 진입 시 전 `paid` 건) · **차액 자동 결제**(주최자 빌링키, `funding_organizer_topup` 고지 — "동의를 받았어도 고지는 별개다") · funding 알림 4종 · 예약 만료 지연 평가 연동 | M3 D1의 `refund` 인터페이스를 여기서 처음 실사용한다. mock에도 환불 경로를 만들어 둘 것 |
| **H** | 화면 8종 — 개설 3스텝(**개설자=수령자면 달성선 입력을 숨기지 않고 잠근다**) · 상세(게이지 + **두 총액의 화면 표기** + "결제 중 N원" 줄 + 지분 3단계 뷰: 주최자·수령자/참여자/비참여) · 참여(고지 2종 나란히) · 결과 3변형 · 내역 · 홈 펀딩 섹션 활성화 | 잔여 금액 실시간 표시가 **R4의 유일한 완화책**이다. 게이지 애니메이션은 400ms 1회, 카운트다운엔 모션 금지(§4.7) |
| **S** | R5 공개 고지 · 차액 동의 v1(최대 부담액을 **숫자로**) · `failed` vs `cancelled` 문구 구분 · 3계정 quickstart 검증 · 잔여 캡 동시 참여 시나리오 검증 | 참여 화면의 고지 2종("공개됩니다" · "환불됩니다")은 법·감정 양쪽이 걸린 문구다. 화면 구현 전 확정 |

---

## 8. 협업 규칙 — M3·M4에서 새로 생기는 것만

M1·M2 규칙(DAL 경유 · 테스트 먼저 · 마이그레이션 J만 · `.env.local` 커밋 금지 · `:3000` 고정 · `skipped` 확인 · 착수 전 한 줄 공유)은 전부 유지. 추가는 다섯이다.

| 규칙 | 이유 |
| --- | --- |
| `PORTONE_MODE=mock`**이 기본, E2E는 항상 mock으로** | 실키로 E2E를 돌리면 테스트가 실결제를 만든다. 실키는 `.env.local`에만 |
| **동의 문구를 고치면 반드시** `consent_version`**을 올린다** | 도메인 모델 §10. 리뷰 체크 항목으로 삼는다 — 결제 권한 위임의 증빙이다 |
| **TTL·재시도 값은 전부 env로** (`GIFT_RESPOND_TTL` 등 §9의 5개) | PRD: "설정 가능해야 하며 실서비스 배포 시 조정". 하드코딩 금지 |
| **카운트다운 컴포넌트는 H2 하나만 쓴다** | 화면마다 만들면 만료 판정 표시가 화면마다 어긋난다 |
| **M4 착수 시** `E2E_USER3` **계정 추가** (전원 각자) | 펀딩은 3주체 구조. M2에서 2계정을 추가한 것과 같은 이유, 같은 함정(`skipped`) |

---

## 9. 진행 체크포인트 (M3)

| 시점 | 확인할 것 |
| --- | --- |
| Phase 0 끝 | **결정 4건이 문서에 적혀 있다.** 특히 P0-1 없이 Phase 2를 시작하지 않는다 |
| Phase 2 끝 | **J3이 통과한다** (CHECK가 실제로 걸렸다) · D5 mock 결제가 왕복한다 · Product 시드가 들어갔다(J8) |
| Phase 3·4 끝 | 상품 탐색 + `unwanted` 3중 차단 시연 가능 · 빌링키 등록 완료 |
| Phase 5 끝 | 요청 생성 → 동의 → 카운트다운까지. 수령자 홈에 승인 대기가 뜬다 |
| Phase 6 끝 | 승인·대안 양쪽 경로로 확정 (mock 결제) · **J13 동시성 테스트 통과** |
| **Phase 7 끝** | **마일스톤 3 완료 판정** — 양쪽 경로 자동 결제 + 실패 → 재시도 복구 |
| Phase 8 끝 | 홈이 액션 허브다 · 일정 · 내역 · 마이 메뉴 노출 |
| Phase 9 끝 | 360px · 제약 확인(J19) · quickstart(S) · 승인률 쿼리가 돈다 |

---

## 10. 막히기 쉬운 지점 (M3)

| 증상 | 원인 | 확인 |
| --- | --- | --- |
| 같은 요청이 두 번 결제됐다 | `paying` 조건부 UPDATE 없이 상태만 검사 | J13 · J14 |
| 만료됐는데 승인이 된다 | 응답 액션이 지연 평가(J6)를 안 거침 | J13 |
| 관계 해제 후 요청 화면이 안 뜬다 | 스냅샷 대신 `Product`·`User` 조인으로 렌더 | D3 예외 설계 — 스냅샷 필드만 읽는지 |
| 검색으로 들어가니 `unwanted` 상품이 선물된다 | 상세(H6)나 서버(J9)의 차단 누락 — 목록 필터만 있음 | 3중 차단 |
| 대안 금액이 상한을 넘겨 저장됐다 | CHECK 미적용 (`db push`로 만든 DB) | J3 · J19 |
| 문구를 고쳤는데 과거 동의를 복원할 수 없다 | `consent_version`을 안 올림 | 리뷰 체크 |
| 카운트다운이 화면마다 다르다 | H2를 안 쓰고 각자 구현 | §8 규칙 |
| E2E가 실카드로 결제했다 | `PORTONE_MODE` 미설정 | §8 규칙 |
| 결제 실패 후 수령자가 소식을 못 받았다 | `gift_cancelled_by_payment` 발송 누락 | D12 |
| 알림을 눌렀는데 접근 거부 | **정상일 수 있다** — 해제된 친구의 과거 알림 (M2 Edge Case 유지) | — |

---

## 11. 다음 단계

1. **Phase 0 팀 결정** — 이 문서 §3의 4건 (S가 안건 준비)
2. `specs/003-*` 파이프라인 — specify → clarify → plan → **tasks** (M3만. M4는 M3 완료 후)
3. tasks.md의 T번호에 이 문서의 임시 번호를 매핑해 `specs/003-*/team-assignment.md` 확정