# Data Model: 선물이 수령자 확인을 거쳐 결정된다 (마일스톤 3)

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

M1·M2의 스키마(`User` · `TasteProfile` · `Category` · `TasteItem` · `Friendship` ·
`FriendInviteLink` · `Notification`)의 **기존 필드는 바꾸지 않는다.** M3는 엔티티 5개를 더하고,
`NotificationType`에 6종을 더하고, `TasteItem`에 컬럼 하나를 더한다.

---

## 새 엔티티

### Product — 상품 (시드 카탈로그)

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `name` | string | | 검색 대상 — 부분 일치 (R9) |
| `categoryId` | uuid | FK `Category` | **취향 항목과 같은 마스터** — 이 공유가 `unwanted` 필터를 조인 한 번으로 만든다 (FR-002) |
| `price` | int | | 원 단위 정수 |
| `imageUrl` | string? | | |
| `isActive` | bool | default true | false면 카탈로그·상세 진입 차단. 기존 요청은 스냅샷으로 렌더 (Edge Case) |

- `@@index([categoryId, isActive])` — 목록·대상 필터
- `@@index([isActive, price])` — 상한 필터(SCR-M3-13) · 추천 가격 정렬 (R9)
- 자체 커머스는 범위 밖 — 시드 30~50건으로 채운다. 시나리오 커버 4조건(spec Assumptions)을
  시드가 만족해야 한다

### PaymentMethod — 결제수단

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `userId` | uuid | FK `User` | |
| `provider` | string | `'portone'` | |
| `billingKey` | string | **AES-256-GCM 암호화 저장** | R10. 카드번호·CVC는 어디에도 없다 (FR-008) |
| `cardBrand` | string | | 화면 표시 전용 |
| `cardLast4` | string | | 화면 표시 전용. mock 실패 규약의 키 (`0000`, R1) |
| `status` | enum `PaymentMethodStatus` | `ACTIVE` \| `EXPIRED` \| `DELETED` | 세 상태 전부 화면 표현을 가진다 (SCR-M3-07) |
| `createdAt` | timestamp | | |
| `deletedAt` | timestamp? | | 삭제는 soft — 과거 요청의 표시(`cardLast4`)가 남아야 한다 |

- `@@index([userId, status])` — "활성 수단 존재" 검증(FR-013 ②)과 관리 화면
- **빌링키는 사용자당 재사용** — 등록은 한 번, 동의는 요청마다 (FR-009)
- 진행 중 요청이 참조하는 수단의 삭제는 경고 후 허용 — 참조가 남으므로 FK는 유지되고,
  결제 시도가 `DELETED`/`EXPIRED` 수단을 만나면 실패 경로로 흐른다 (FR-011, Edge Case)

### GiftRequest — 선물 요청 (이 마일스톤의 중심)

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `giverId` | uuid | FK `User` | |
| `receiverId` | uuid | FK `User` | C7 — 자기 자신 금지 |
| `status` | enum `GiftStatus` | 아래 상태 전이 | **`DECLINED` 없음** (FR-020) |
| `resolution` | enum `GiftResolution`? | `APPROVED` \| `COUNTERED` | 상태가 아니라 지나간 경로의 기록. 승인률 집계가 이 필드 하나로 (FR-045) |
| `resolvedAt` | timestamp? | | |
| `productId` | uuid | FK `Product` | 이력 추적용 참조 — **렌더에 쓰지 않는다** (R5) |
| `productSnapshot` | Json | | 이름·이미지·가격. 생성 시 복사 (FR-016) |
| `requestedAmount` | int | | C5의 상한 기준 |
| `counterProductId` | uuid? | FK `Product` | C6 — 3필드 전무/전유 |
| `counterProductSnapshot` | Json? | | C6 |
| `counterAmount` | int? | **C5: ≤ `requestedAmount`** | 화면 필터가 1차, 이 CHECK가 최종 방어선 (FR-021) |
| `counteredAt` | timestamp? | | |
| `finalAmount` | int? | | 결제 시 확정 = `counterAmount ?? requestedAmount` |
| `receiverDisplayName` | string | | D3 스냅샷 — 해제 후에도 "누구에게"가 렌더된다 |
| `shippingAddressSnapshot` | Json? | | 수령자가 **이 거래에** 제공. 프로필 배송지 없음 (FR-025) |
| `paymentMethodId` | uuid | FK `PaymentMethod` | 재시도 시 변경 가능 (FR-030) |
| `consentAgreedAt` | timestamp | | 동의 없이 생성 불가 (FR-014) |
| `consentVersion` | string | | 어떤 문구에 동의했는지. v1 = clarify Q4 (FR-015) |
| `respondDueAt` | timestamp | | **생성 시 절대 시각 스냅샷** (FR-017, R11) |
| `paymentRetryUntil` | timestamp? | | 첫 실패 시점 + `GIFT_PAYMENT_RETRY_WINDOW` |
| `paymentAttemptCount` | int | default 0 | `GIFT_PAYMENT_MAX_ATTEMPTS` 상한 (FR-031) |
| `paidAt` / `expiredAt` / `cancelledAt` | timestamp? | | 종착 시각 |
| `createdAt` / `updatedAt` | timestamp | | |

**인덱스**

- `@@index([receiverId, status, respondDueAt])` — 홈 승인 대기(임박순) + 수신 목록 (FR-038)
- `@@index([giverId, status])` — 보낸 내역·진행 중 구분 (FR-042)
- `@@index([paymentMethodId, status])` — 수단 삭제 시 "진행 중 N건" 경고 (FR-011)

**대안을 별도 엔티티로 두지 않는다** — 1회 · 단방향 · 상한 있는 구조라 `counter*` 필드로
충분하다(도메인 모델 §5). 반복 협상이 필요해지면 그때 승격한다.

#### 상태 전이 (R6 — `lib/gift/state.ts`만 안다)

```
     (생성: 활성 친구 + 활성 결제수단 + 동의 기록 + 스냅샷)
          |
       PENDING --- 승인 (resolution=APPROVED) ----> +
          |    --- 대안 확정 (resolution=COUNTERED)-> +--> PAYING --성공--> PAID *
          |                                                 |
          |                                                 +--실패--> PAYMENT_FAILED
          |
          +--- respondDueAt 초과 (지연 평가 R3) -----------------------> EXPIRED *
          +--- 주는 사람 취소 -----------------------------------------> CANCELLED *

  PAYMENT_FAILED --- 재시도 (수단 변경 포함, R2 재잠금) --------------> PAYING
                 --- 기한(paymentRetryUntil)·횟수 초과 ---------------> CANCELLED *
```

- `*` 종착 상태. 이 표 밖의 전이는 전부 거부 — 단위 테스트가 전수 검사한다.
- `PENDING → PAYING`은 **조건부 UPDATE 잠금**(R2). 0행이면 이미 진행 중이므로 중단.
- 대안 확정 시에도 즉시 자동 결제 — 사전 동의가 위임 장치다 (FR-028).

### Payment — 결제 기록

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `provider` | string | `'portone'` (mock 포함) | |
| `providerTxId` | string | | mock은 `mock_` 접두 uuid |
| `amount` | int | | |
| `status` | enum `PaymentStatus` | `READY` \| `PAID` \| `FAILED` \| `CANCELLED` \| `REFUNDED` | `REFUNDED`는 M4에서 처음 쓰인다 |
| `giftRequestId` | uuid? | FK `GiftRequest` | C8 |
| `fundingContributionId` | uuid? | **컬럼만, FK 없음** | R4 — M4 F1에서 FK 추가 |
| `paidAt` / `refundedAt` | timestamp? | | |
| `createdAt` | timestamp | | |

- `@@index([giftRequestId])` — 요청별 시도 이력 (FR-033)
- polymorphic(`payableType`+`payableId`) 대신 nullable FK 2개 + C8 — DB가 참조 무결성을
  계속 지킨다. 결제 데이터에서 이것을 양보하지 않는다 (도메인 모델 §5)

### Event — 일정

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `id` | uuid | PK | |
| `userId` | uuid | FK `User` | 일정의 **주체** (생일의 주인) |
| `type` | enum `EventType` | `BIRTHDAY` \| `ANNIVERSARY` \| `CUSTOM` | |
| `title` | string | | |
| `date` | date | | |
| `isRecurring` | bool | | true면 연도 무시, 월·일 매칭 (FR-040) |
| `createdAt` / `updatedAt` | timestamp | | |

- `@@index([userId, date])` — 본인·친구 일정 조회
- 생일을 `User.birthday` 필드로 두지 않는다 — 홈이 "다가오는 일정" 하나의 축으로 돈다
  (도메인 모델 §5). 캘린더는 목록형으로 확정 (clarify Q2)

---

## 기존 엔티티 변경

### NotificationType — 6종 추가 (구조 변경 없음)

| 값 | 받는 사람 | 탭 시 이동 | 만드는 곳 (R7) |
|---|---|---|---|
| `GIFT_REQUEST_RECEIVED` | 수령자 | SCR-M3-12 | `createGiftRequest` 트랜잭션 |
| `GIFT_COUNTERED` | 주는 사람 | SCR-M3-11 | `counterGift` 액션 |
| `GIFT_PAID` | **양쪽** | SCR-M3-15 | `chargeGiftRequest()` |
| `GIFT_PAYMENT_FAILED` | 주는 사람 | SCR-M3-16 | `chargeGiftRequest()` |
| `GIFT_CANCELLED_BY_PAYMENT` | 수령자 | SCR-M3-15 | `chargeGiftRequest()` — 상한 초과 확정 시. **누락 금지** (FR-032) |
| `GIFT_EXPIRED` | 주는 사람 | SCR-M3-15 | `evaluateExpiry()` — 만료 확정 지점 (R3) |

- M2의 R6 결정("enum은 연기, `payload`는 선반영")이 여기서 회수된다 — enum 값 추가는
  마이그레이션 한 줄이고, `payload`(Json)는 이미 있어서 구조 변경이 없다.
- funding 4종은 M4에서 추가한다 — 같은 이유로 지금 넣지 않는다 (원칙 V).
- `payload`에는 M2와 같은 원칙으로 **표시용 값을 복사**한다 — `giftRequestId` + 상대 표시명 +
  상품명·금액. 조회 시점에 `User`·`Product`를 읽지 않는다.

### TasteItem — 컬럼 1개 추가

| 필드 | 타입 | 제약 | 근거 |
|---|---|---|---|
| `productId` | uuid? | FK `Product`, nullable | 위시리스트 "카탈로그에서 고르기" (FR-044). 텍스트 경로는 유지 — 기존 행은 전부 NULL이라 마이그레이션 비용이 없다 |

### 변경 없는 것

| 대상 | 변경 |
|---|---|
| `User` | 없음. 새 엔티티들의 역참조 관계만 추가 |
| `TasteProfile` · `Category` | **없음** |
| `Friendship` · `FriendInviteLink` | **없음** — M3는 관계를 읽기만 한다 |
| `Notification` 구조 | **없음** — enum 값만 추가 |

---

## 제약 C5~C8 (raw SQL — R4)

Prisma 문법으로 표현되지 않으므로 `--create-only` 마이그레이션으로 넣는다. SQL 원문은
[research.md R4](./research.md)에 있다. **`db push`로 만든 DB에는 이 제약이 없다.**

| # | 제약 이름 | 내용 | 지키는 것 |
|---|---|---|---|
| C5 | `gift_counter_le_requested` | `counterAmount ≤ requestedAmount` | PRD 확정 정책 "최초 요청 금액 이하"의 마지막 방어선 (FR-021) |
| C6 | `gift_counter_all_or_none` | counter 3필드 전무 또는 전유 | 반쪽 대안 데이터 금지 (FR-022) |
| C7 | `gift_no_self` | `giverId <> receiverId` | FR-013 ④ |
| C8 | `payment_exactly_one_target` | gift XOR funding 연결 | FR-033. `fundingContributionId`는 컬럼 선반영 (R4) |

> **제약과 검증 테스트는 짝이다.** 삽입 시도 통합 테스트를 먼저 쓰고(실패 확인), 제약 적용 후
> 초록을 확인하며, Phase 9에서 `pg_constraint` 조회로 재확인한다 — M1 T010/T011 · M2 C3/C4와
> 같은 구조.

---

## 조회 규칙

### 접근 제어 — M2의 단일 규칙을 잇는다

```
canViewCatalogFor(viewer, friend)  := requireActiveFriendship(friend)   -- 대상 필터·배너·추천
canViewEvents(viewer, owner)       := requireActiveFriendship(owner)    -- 친구 일정 (FR-041)
canViewGiftRequest(viewer, req)    := viewer ∈ { req.giverId, req.receiverId }
```

- 거래 화면은 **스냅샷 필드만** 읽으므로 관계 해제와 무관하게 성립한다 (R5, FR-016·FR-042).
  거래 화면이 열린다는 것이 취향 접근 권한을 되살리지 않는다 (Edge Case).

### 만료 평가 경유 (R3)

`lib/dal/gift.ts`의 모든 조회 — 홈 승인 대기 · 보낸/받은 목록 · 단건 조회 — 가
`evaluateExpiry()`를 지난 결과만 반환한다. **이 규칙에 예외를 만들지 않는다.**

### 대상 필터·매칭 배너 (R9)

```
excludedCategories(friend) := TasteItem WHERE profile.userId = friend AND kind = 'UNWANTED'
                              --> categoryId 목록
matchBanner(product, friend) :=
  want 일치 (categoryId + detail 대조) → 긍정
  have 카테고리 일치                   → 주의 (선물하기 가능)
  unwanted 카테고리 일치               → 차단 (선물하기 비활성)
```

### 승인률 (FR-045)

```sql
SELECT COUNT(*) FILTER (WHERE resolution = 'APPROVED')::float
     / NULLIF(COUNT(*) FILTER (WHERE resolution IS NOT NULL), 0)
FROM "GiftRequest";
```

별도 이벤트 수집 없이 `resolution` 집계로 나온다 — M1의 상세 작성률 쿼리와 같은 접근.

---

## 마이그레이션 순서

1. 모델 5종 + enum 5종 + `NotificationType` 값 6종 + `TasteItem.productId` → `migrate dev`
2. **raw SQL 마이그레이션** — C5~C8 (한 파일, `--create-only`)
3. C5~C8이 실제로 걸렸는지 확인하는 통합 테스트 (삽입 시도 4종)
4. `prisma/seed.ts` 확장 — Product 30~50건 (기존 Category 시드 유지, 콘텐츠는 S의 표)

> 마이그레이션은 **한 사람(J)만 만든다** (M1·M2 협업 규칙). 3번을 건너뛰지 않는다 —
> 제약이 안 걸린 상태는 화면상 완전히 정상으로 보이고, 상한 초과 대안이 저장된 뒤에야 드러난다.
