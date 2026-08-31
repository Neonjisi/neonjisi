# Contracts: PortOne · charge 경계 · DAL · Server Actions (마일스톤 3)

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Data Model**: [data-model.md](../data-model.md)

M1·M2의 규약을 그대로 잇는다. 예상 가능한 실패는 **예외가 아니라 결과 값**으로 돌려주고,
예상 못 한 예외는 `guarded`가 `STORAGE_FAILED`로 바꾼다.

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } }
```

---

## 1. PortOne 인터페이스 — `lib/portone/client.ts` (R1)

**결제가 등장하는 모든 경로의 유일한 관문이다.** 다른 파일에서 PortOne API를 직접 부르지 않는다.

```ts
type PortOneClient = {
  issueBillingKey(input: {
    userId: string
    cardBrand: string          // mock: 폼에서 선택
    cardLast4: string          // mock: '0000'이면 이후 charge가 항상 실패 (R1 규약)
  }): Promise<{ ok: true; billingKey: string } | { ok: false; reason: string }>

  chargeBillingKey(input: {
    billingKey: string         // 복호화된 값 — 호출 직전에만 존재
    amount: number
    orderName: string
  }): Promise<
    | { ok: true; providerTxId: string; paidAt: Date }
    | { ok: false; reason: string }                     // 실패는 예외가 아니라 결과
  >

  refund(input: { providerTxId: string; amount: number }): Promise<
    | { ok: true; refundedAt: Date }
    | { ok: false; reason: string }
  >  // M4에서 처음 실사용 — mock에도 지금 만든다 (R1)
}

export function getPortOneClient(): PortOneClient  // PORTONE_MODE로 mock/real 선택
```

- 타임아웃·네트워크 예외는 클라이언트 내부에서 `{ ok: false }`로 정규화한다 — 호출자는
  분기 두 개만 안다.
- 빌링키 암호화/복호화는 `lib/crypto/billing-key.ts`(R10) — `encryptBillingKey(plain)` ·
  `decryptBillingKey(stored)`. 복호화된 값을 반환·로그에 남기지 않는다.

## 2. `lib/gift/charge.ts` — 소유 경계 (R7) ★ M3 최우선 선행 계약

```ts
/**
 * 전제: 호출자가 이미 PENDING→PAYING (재시도는 PAYMENT_FAILED→PAYING) 조건부 UPDATE로
 * 잠갔다 (R2). 이 함수는 잠긴 요청만 받는다.
 * 소유: PortOne 호출 → Payment 기록 → 상태 확정(전이 함수 경유) → 결제 알림
 *       (GIFT_PAID 양쪽 / GIFT_PAYMENT_FAILED / 상한 초과 시 CANCELLED 확정 +
 *        GIFT_CANCELLED_BY_PAYMENT)까지 전부 이 안이다.
 * 호출자는 이 함수 뒤에서 상태를 만지거나 결제 알림을 보내지 않는다 — 두면 중복 발송이 난다.
 */
export async function chargeGiftRequest(giftRequestId: string): Promise<
  | { outcome: 'PAID' }
  | { outcome: 'PAYMENT_FAILED'; attemptCount: number; retryUntil: Date }
  | { outcome: 'CANCELLED' }   // 횟수·기한 초과가 이 호출에서 확정된 경우
>
```

| 호출 지점 | 잠금 (호출자 소유) | 그 뒤 (charge 소유) |
|---|---|---|
| `approveGift` | `PENDING → PAYING` + `resolution=APPROVED` | 전부 |
| `counterGift` | `PENDING → PAYING` + counter 3필드 + `resolution=COUNTERED` | 전부 |
| `retryGiftPayment` | `PAYMENT_FAILED → PAYING` (기한·횟수 검사 후) | 전부 |

## 3. DAL — 읽기 (`lib/dal/`)

읽기 함수는 **내부에서 인가를 통과한 결과만** 내보낸다. 호출부(화면)에 검사가 없다.

### `lib/dal/product.ts` — 신규 (H 소유)

| 함수 | 반환 | 인가 | 설명 |
|---|---|---|---|
| `getProducts(filter)` | `Promise<ProductView[]>` | 본인 세션 | 검색(`name` 부분 일치) · 카테고리 · **대상 필터**(`unwanted` 카테고리 제외 — `requireActiveFriendship` 경유) (FR-003) |
| `getProduct(productId)` | `Promise<ProductView \| null>` | 본인 세션 | `isActive=false`면 `null` |
| `getMatchBanner(productId, friendUserId)` | `Promise<'want' \| 'have' \| 'unwanted' \| null>` | `requireActiveFriendship` | 상세 배너 3상태 (FR-005) |
| `getRecommendations(friendUserId)` | `Promise<{ wantMatches; categoryMatches; excludedCategoryNames }>` | `requireActiveFriendship` | 제외 안내 포함 (FR-006) |
| `getProductsUnderAmount(maxAmount, opts)` | `Promise<ProductView[]>` | 본인 세션 | **상한 필터 — 재선택(SCR-M3-13)이 재사용** (FR-021 1차 방어선). `opts.preferWantOf`로 내 `want` 우선 정렬 |

### `lib/dal/gift.ts` — 신규 (J 소유)

**모든 함수가 `evaluateExpiry()`를 경유한 결과만 반환한다** (R3). 예외 없음.

| 함수 | 반환 | 인가 | 설명 |
|---|---|---|---|
| `getPendingRequestsForMe()` | `Promise<ReceivedGiftView[]>` | 본인 세션 | 홈 승인 대기 — `respondDueAt` 임박순 (FR-038) |
| `getSentGifts()` / `getReceivedGifts()` | `Promise<GiftListItem[]>` | 본인 세션 | 내역 — 진행 중/지난 구분, `resolution` 라벨 (FR-042) |
| `getGiftRequest(id)` | `Promise<GiftDetailView>` | giver 또는 receiver | **스냅샷 필드만 담는다** — 화면이 `Product`·`User`를 조인할 수 없게 View 타입에 아예 없다 (R5) |

```ts
type GiftDetailView = {
  id: string
  role: 'giver' | 'receiver'
  status: GiftStatus
  resolution: 'APPROVED' | 'COUNTERED' | null
  productSnapshot: { name: string; imageUrl: string | null; price: number }
  counterProductSnapshot: { name: string; imageUrl: string | null; price: number } | null
  requestedAmount: number
  finalAmount: number | null
  counterpartDisplayName: string      // receiverDisplayName 또는 giver 표시명 스냅샷
  respondDueAt: Date
  serverNow: Date                     // 카운트다운 보정용 (R8)
  paymentMethodLabel: string | null   // '신한 **** 4821' — giver에게만
  attemptCount: number
  retryUntil: Date | null
  shippingAddress: ShippingAddress | null   // receiver 본인·giver에게만
}
```

### `lib/dal/payment-method.ts` — 신규 (D 소유)

| 함수 | 반환 | 인가 | 설명 |
|---|---|---|---|
| `getMyPaymentMethods()` | `Promise<PaymentMethodView[]>` | 본인 세션 | `cardBrand`·`cardLast4`·`status`만 — 빌링키는 View에 없다 |
| `getActivePaymentMethod()` | `Promise<PaymentMethodView \| null>` | 본인 세션 | 요청 진입 차단 판정 (FR-013 ②) |
| `countActiveRequestsUsing(paymentMethodId)` | `Promise<number>` | 본인 세션 | 삭제 경고 "진행 중 N건" (FR-011) |

### `lib/dal/event.ts` — 신규 (H 소유)

| 함수 | 반환 | 인가 | 설명 |
|---|---|---|---|
| `getMyEvents()` | `Promise<EventView[]>` | 본인 세션 | |
| `getUpcomingEvents()` | `Promise<UpcomingEventView[]>` | 본인 세션 | 본인 + **활성 친구** 일정, 임박순. `isRecurring`은 월·일 매칭 (FR-040·FR-041) |

### `lib/dal/payment.ts` — 신규 (D 소유)

| 함수 | 반환 | 설명 |
|---|---|---|
| `recordPayment(tx, input)` | `Promise<void>` | `chargeGiftRequest()` 전용 — Payment 행 기록. C8은 DB가 지킨다 |

## 4. Server Actions

> M2 §2와 같은 원칙 — **US끼리 같은 파일을 만지지 않는다.** `ActionResult`·`guarded`는
> `app/gifts/actions/shared.ts`에 두고(기반 단계에서 먼저), 나머지가 import 한다.

| 파일 (소유) | Action | 입력 | 성공 | 실패 코드 |
|---|---|---|---|---|
| `gifts/actions/request.ts` (J) | `createGiftRequest` | `{ receiverId, productId, consent: true }` | `{ giftRequestId }` | `NOT_FRIENDS` · `NO_PAYMENT_METHOD` · `PRODUCT_UNWANTED` · `PRODUCT_UNAVAILABLE` · `SELF_GIFT` · `CONSENT_REQUIRED` · `STORAGE_FAILED` |
| `gifts/actions/request.ts` (J) | `cancelGiftRequest` | `{ giftRequestId }` | `{ ok: true }` | `NOT_OWNER` · `NOT_CANCELLABLE` · `STORAGE_FAILED` |
| `gifts/actions/respond.ts` (J) | `approveGift` | `{ giftRequestId, shippingAddress }` | `{ outcome }` | `NOT_RECEIVER` · `GIFT_EXPIRED` · `GIFT_CANCELLED` · `ALREADY_RESPONDED` · `STORAGE_FAILED` |
| `gifts/actions/respond.ts` (J) | `counterGift` | `{ giftRequestId, counterProductId, shippingAddress }` | `{ outcome }` | 위 + `COUNTER_OVER_LIMIT` · `PRODUCT_UNAVAILABLE` |
| `gifts/actions/payment.ts` (D) | `retryGiftPayment` | `{ giftRequestId, paymentMethodId? }` | `{ outcome }` | `NOT_OWNER` · `NOT_RETRYABLE` · `RETRY_EXPIRED` · `STORAGE_FAILED` |
| `payment-methods/actions.ts` (D) | `registerPaymentMethod` | `{ cardBrand, cardLast4 }` (mock) | `{ paymentMethodId }` | `ISSUE_FAILED` · `STORAGE_FAILED` |
| `payment-methods/actions.ts` (D) | `deletePaymentMethod` | `{ paymentMethodId }` | `{ activeRequestCount }` | `NOT_OWNER` · `STORAGE_FAILED` |
| `events/actions.ts` (H) | `createEvent` / `updateEvent` / `deleteEvent` | `Event` 필드 | `{ eventId }` | `NOT_OWNER` · `VALIDATION_FAILED` · `STORAGE_FAILED` |

### `createGiftRequest` — 검사 순서 (바꾸면 오답)

```
1. 세션
2. 동의            — consent가 참이 아니면 CONSENT_REQUIRED (화면 비활성과 이중)
3. 친구 active     — requireActiveFriendship. 아니면 NOT_FRIENDS
4. 활성 결제수단    — 없으면 NO_PAYMENT_METHOD (화면은 SCR-M3-06 강제 진입)
5. 상품            — isActive 아니면 PRODUCT_UNAVAILABLE.
                     수령자 unwanted 카테고리면 PRODUCT_UNWANTED (3중 차단의 최종 지점, R9)
6. 자기 자신       — SELF_GIFT (C7과 이중)
7. 트랜잭션 {
     GiftRequest 생성 (status: PENDING, 스냅샷 3종 — productSnapshot ·
       receiverDisplayName · respondDueAt = now + GIFT_RESPOND_TTL,
       consentAgreedAt = now, consentVersion = CONSENT_VERSION)
     Notification 생성 (수령자에게 GIFT_REQUEST_RECEIVED, payload에 표시용 값 복사)
   }
```

### `approveGift` / `counterGift` — 검사 순서

```
1. 세션 + receiver 본인 확인            — 아니면 NOT_RECEIVER
2. 만료 지연 평가 (evaluateExpiry, R3)  — 만료 확정이면 GIFT_EXPIRED
3. (counter만) 상한 검증                — counterAmount > requestedAmount면 COUNTER_OVER_LIMIT
                                          (C5와 이중 — 검사는 메시지, 제약은 정확성)
4. 배송지 스냅샷 준비
5. PAYING 잠금 — 조건부 UPDATE (R2):
     PENDING → PAYING + resolution + (counter 3필드) + shippingAddressSnapshot + finalAmount
     0행이면 ALREADY_RESPONDED (취소·만료·중복 어느 쪽이든 — 재조회로 사유 구분)
6. (counter만) GIFT_COUNTERED 알림      — 이 알림만 respond가 보낸다 (R7)
7. chargeGiftRequest(giftRequestId)     — 이후는 전부 charge 소유. 상태·결제 알림에 손대지 않는다
```

### `retryGiftPayment`

```
1. 세션 + giver 본인 확인
2. 재시도 가능 검사 — status=PAYMENT_FAILED · attemptCount < MAX · now < retryUntil
                      아니면 NOT_RETRYABLE / RETRY_EXPIRED
3. (수단 변경 시) paymentMethodId 갱신 — 본인 소유·ACTIVE 검증
4. PAYMENT_FAILED → PAYING 조건부 UPDATE (R2 재잠금). 0행이면 NOT_RETRYABLE
5. chargeGiftRequest(giftRequestId)
```

## 5. 라우트

| 경로 | 인증 | 화면 | 비고 |
|---|---|---|---|
| `/` (홈 개편) | 필요* | SCR-M3-01 | 승인 대기 최상단 · 조회가 만료 판정 트리거 (R3) |
| `/products` | 필요 | SCR-M3-03 | 검색·카테고리·대상 필터 |
| `/products/[id]` | 필요 | SCR-M3-04 | 매칭 배너 · `unwanted` 비활성 |
| `/products/for/[userId]` | 필요 | SCR-M3-05 | `requireActiveFriendship` 통과 필수 |
| `/payment-methods` · `/payment-methods/new` | 필요 | SCR-M3-07 · 06 | 등록은 요청 플로우에서 강제 진입 후 **복귀** |
| `/gifts/new` → `/gifts/new/consent` → `/gifts/new/done` | 필요 | SCR-M3-08 → 09 → 10 | 동의는 별도 화면 — 08에 체크박스를 얹지 않는다 (FR-014) |
| `/gifts/[id]` | 필요 | SCR-M3-11 / 12 | **얇은 롤 분기** — giver → 상세, receiver → 수신 (M2 `[userId]` 패턴: H가 분기 먼저, J가 수신 뷰를 얹는다) |
| `/gifts/[id]/respond/reselect` · `/respond/shipping` | 필요 | SCR-M3-13 · 14 | receiver 전용 |
| `/gifts/[id]/result` · `/gifts/[id]/recover` | 필요 | SCR-M3-15 · 16 | recover는 giver 전용 — 수령자에게 실패 진행을 노출하지 않는다 (FR-030) |
| `/events` | 필요 | SCR-M3-17 | 목록형 (clarify Q2) |
| `/my/gifts` | 필요 | SCR-M3-18 | 스냅샷만으로 렌더 |

### `proxy.ts` 변경 (matcher 추가)

```ts
matcher: [
  '/onboarding/:path*', '/taste/:path*', '/my/:path*', '/signup/:path*',
  '/friends/:path*', '/notifications/:path*',
  '/gifts/:path*', '/products/:path*', '/payment-methods/:path*', '/events/:path*',  // M3 추가
]
```

`*` 홈(`/`)은 matcher에 없다 — M1부터 페이지 내부에서 세션·온보딩을 판정해 리다이렉트한다.
그 구조를 유지한다.

### 앱 셸 전환 (FR-043)

선물 탭 활성화 · 시작 화면 친구 탭 → 홈 · 마이 탭에 선물 내역·결제수단 메뉴 노출 ·
SCR-M1-09 위시리스트에 `( 카탈로그에서 고르기 )` 진입점 · SCR-M2-01 일정 섹션 활성화.

## 6. 클라이언트 컴포넌트 예산

constitution 원칙 III. M1 4개 + M2 3개에 이어 M3는 **6개를 더한다.**

| 컴포넌트 | 왜 클라이언트인가 |
|---|---|
| `components/gift/countdown.tsx` | 1초 간격 갱신 + 서버 시각 보정 (R8). **하나만 — 6화면 재사용** |
| `components/gift/receiver-respond.tsx` | 승인/대안 버튼 상태 · 응답 중 이중 탭 방지 |
| `components/payment/billing-key-form.tsx` | mock 카드 선택 폼 / 실연동 SDK 위젯 마운트 |
| `components/gift/consent-checkbox.tsx` | 체크 전 버튼 비활성 (FR-014) |
| `components/event/event-form-sheet.tsx` | 추가·편집 시트 상태 (M1 시트 패턴) |
| `components/payment/method-delete-dialog.tsx` | 삭제 경고 다이얼로그 (M2 다이얼로그 패턴) |

**목록·상세·내역의 데이터 렌더는 전부 Server Component다** — 매칭 배너 판정·만료 평가를
클라이언트로 보내면 접근 제어와 판정 권위가 무너진다. 결제 처리 중 로딩·버튼 비활성은
`useTransition`/`disabled`로 처리하고, 결과 대기는 화면에 사용자를 붙잡지 않는다(알림으로 온다).
