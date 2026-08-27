# 넌지시 — 도메인 모델 설계

> 작성일: 2026-08-26
> 근거 문서: `.claude/prds/neonjisi.prd.md` (rev.3) · `docs/product-lens-review-v3.md`
> Status: **DRAFT** — 설계 확정. 구현 계획은 마일스톤별 스펙에서 이어진다.
> 전제: **PostgreSQL**. partial index · `jsonb` · `CHECK` · `SELECT FOR UPDATE`를 사용한다. 다른 DBMS를 쓰면 해당 표현을 대체해야 한다.

---

## 1. 확정된 결정

이 문서의 모든 스키마는 아래 결정에서 파생된다. 결정을 바꾸면 파생 스키마를 함께 봐야 한다.

| # | 결정 | 귀결 |
|---|---|---|
| **D1** | 타인의 취향을 대신 등록할 수 없다. 본인만 작성한다 | `TasteProfile.user_id`가 unique. 대리 프로필·claim·merge 없음 |
| **D2** | MVP는 전체 공개. 친구면 취향 전체를 본다 | `visibility` 필드 없음. 접근 제어가 단일 조건으로 축약 |
| **D3** | 관계 해제는 soft delete. 진행 중 거래는 예외 | `Friendship.status`에 `removed` + partial unique index |
| **3-3** | 링크를 받으면 **즉시 친구**. 다회용 링크 + 만료 + revoke + 발급자 알림 | `Friendship.status`는 2값. `pending` 없음 |
| **4-1** | 선물 결제는 **빌링키 기반 자동 재결제** | `PaymentMethod` 신설. 결제 실패 처리가 필수 경로 |
| **5-1** | 펀딩 참여는 **선결제 + 실패 시 환불** | 성사 판정 시점에 총액이 확정되어 있다 |
| **5-5** | 개설자 = 수령자인 펀딩은 `min_amount = goal_amount` 강제 | 차액 개념이 소멸하여 PRD의 R3가 해소된다 |

### 결정의 근거 요약

- **D1** — 미가입 친구의 취향을 대신 기록하는 안은 *짐작을 데이터로 저장*하는 구조라 "짐작으로 고르면 어긋난다"는 Problem과 충돌한다. 또한 정보주체 동의 없이 민감정보(알러지·사이즈)를 제3자가 저장하게 되어 R9가 리스크가 아니라 확정 문제가 된다.
- **D2** — 항목별 공개 등급을 미리 넣는 안도 검토했으나, 후행 확장 방향을 *친구 그룹별*로 잡으면 그룹이 `Friendship`에 붙으므로 나중에 얹을 수 있다.
- **3-3** — R1(콜드스타트)이 PRD에서 유일한 높음/높음 리스크다. 승인 단계는 정확히 그 리스크를 키우는 마찰이므로, 통제는 *만료 + revoke + 성사 알림*으로 대체한다.
- **4-1** — PRD의 "재결제"·"명시적 동의 화면" 문구를 그대로 구현한다. 대가로 R8(결제수단 상태 변화)이 현실화되므로 실패 처리 경로를 필수로 설계한다.
- **5-1** — 펀딩은 다수의 집합적 성사다. 결제를 성사 판정 뒤로 미루면 판정 후에 총액이 무너질 수 있다. 선결제여야 *모인 돈 = 확정된 돈*이 성립한다.

---

## 2. 엔티티 지도

14개. 마일스톤은 PRD의 Delivery Milestones를 따른다.

| 마일스톤 | 엔티티 |
|---|---|
| **M1** 맞춤 취향을 남길 수 있다 | `User` · `TasteProfile` · `TasteItem` · `Category` |
| **M2** 친구에게 취향이 전달된다 | `Friendship` · `FriendInviteLink` |
| **M3** 선물이 수령자 확인을 거쳐 결정된다 | `Product` · `GiftRequest` · `PaymentMethod` · `Payment` · `Notification` · `Event` |
| **M4** 고가 선물을 여럿이 함께 준비한다 | `Funding` · `FundingContribution` |

```
User ─1:1─ TasteProfile ─1:N─ TasteItem ─N:1─ Category
  │                                              │
  ├─ Friendship (N:M, self) ──── status=active 일 때만 취향 열람
  ├─ FriendInviteLink
  ├─ Event                                       │
  ├─ PaymentMethod (빌링키)                      │
  │                                        Product ─N:1─┘
  ├─ GiftRequest (giver / receiver) ─ Product 스냅샷 ─ Payment
  └─ Funding (organizer / receiver) ─1:N─ FundingContribution ─ Payment
```

`Category`가 **취향과 상품이 공유하는 단일 마스터**라는 점이 이 모델의 중심이다. MVP의 핵심 가치인 "잘못된 선물 걸러내기"는 `TasteItem.category_id`와 `Product.category_id`가 같은 어휘를 쓸 때만 동작한다.

---

## 3. M1 — 맞춤 취향

### Category

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `name` | string | "텀블러", "향수" |
| `sort_order` | int | 온보딩 목록 노출 순서 |

- MVP는 **계층 없는 flat** 30~50개. 시드 데이터로 제공한다.
- 계층이 필요해지면 `parent_id`(nullable)를 나중에 추가한다. 후행 추가 비용이 낮다.

### User

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `display_name` | string | |
| `avatar_url` | string, nullable | |
| `created_at` / `updated_at` | | |

인증 관심사만 담는다. 취향은 `TasteProfile`이 갖는다.

### TasteProfile

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `user_id` | FK User, **unique** | **D1** — 1:1 강제 |
| `description` | text, nullable | 취향 서술. 자유 입력, **선택** |
| `onboarded_at` | timestamp, nullable | 온보딩 필수 항목 충족 시점 |
| `created_at` / `updated_at` | | |

`User`에서 분리한 이유: `User`는 인증·계정 관심사, `TasteProfile`은 제품 도메인 관심사다. 섞으면 `User`가 계속 부푼다. 조회 단위가 "프로필"이라 API 경계도 명확해진다.

### TasteItem

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `profile_id` | FK TasteProfile | |
| `kind` | enum | `want` / `have` / `unwanted` |
| `category_id` | FK Category | 대분류 — **필수** |
| `detail` | string, nullable | 상세("스타벅스 텀블러") — **사용자 재량** |
| `memo` | text, nullable | 부연("이미 3개 있어요") |
| `created_at` / `updated_at` | | |

- M3에서 `product_id`(nullable FK)를 추가해 `want` 항목이 카탈로그 상품을 가리키게 한다. M1 시점에는 `Product`가 없으므로 텍스트만 갖는다.
- `kind`를 3값으로 나눈 이유: PRD가 "이미 있는 것 · 필요 없는 것"을 한 행에 묶은 것은 *입력 강제 수준*이 같다는 뜻이지 의미가 같다는 뜻이 아니다. 주는 사람 화면에서 "이미 갖고 있어요"와 "관심 없어요"는 다르게 읽혀야 한다.

### 제약과 검증

- `onboarded_at`은 `kind IN ('have', 'unwanted')` 항목이 **1건 이상**일 때 설정한다 (PRD: 대분류는 온보딩 필수).
- `(profile_id, kind, category_id, detail)` 중복 금지 — unique index. `detail IS NULL` 처리에 주의한다.
- **모순 방지**: 같은 `category_id`에서 `detail IS NULL`인 `want` 항목과 `unwanted` 항목이 동시에 존재할 수 없다. 애플리케이션 레벨에서 검증한다.
- 취향 항목 삭제는 hard delete. 되돌릴 이유가 없다.

### 측정 훅

PRD의 성공 지표 `맞춤 취향 상세 작성률`(R2 검증용)이 별도 이벤트 수집 없이 쿼리로 떨어진다. R2가 요구하는 "마일스톤 1 직후 즉시 측정"이 이 스키마만으로 가능하다.

```sql
SELECT COUNT(DISTINCT profile_id) FILTER (WHERE detail IS NOT NULL)::float
     / NULLIF(COUNT(DISTINCT profile_id), 0)
FROM taste_item;
```

---

## 4. M2 — 친구에게 취향이 전달된다

### Friendship

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `requester_id` / `addressee_id` | FK User | 순서가 "누가 먼저 요청했나"를 담는다 |
| `status` | enum | `active` / `removed` — **3-3** |
| `invite_link_id` | FK, nullable | 어느 링크로 맺어졌는지 |
| `accepted_at` | timestamp | |
| `removed_at` | timestamp, nullable | **D3** |
| `removed_by` | FK User, nullable | 어느 쪽이 끊었는지 |

**단일 행**으로 둔다. 양방향 2행으로 복제하면 쓰기가 2배가 되고 두 행의 상태가 어긋날 여지가 생긴다.

```sql
-- 같은 쌍의 중복 활성 관계 방지 (순서 무관)
CREATE UNIQUE INDEX friendship_pair_active
  ON friendship (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
  WHERE status <> 'removed';
```

`partial index`인 것이 핵심이다. D3가 soft delete라 `removed` 행이 남는데, 그것이 재친구 추가를 막으면 안 된다. **재추가 시에는 기존 행을 되살리지 않고 새 행을 만든다.** `removed` 행은 이력으로 남는다.

### FriendInviteLink

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `inviter_id` | FK User | |
| `token` | string, unique | 32바이트 랜덤, URL-safe |
| `expires_at` | timestamp | `FRIEND_INVITE_TTL` 기준 |
| `revoked_at` | timestamp, nullable | 발급자가 즉시 무효화 |
| `used_count` | int | |
| `created_at` | | |

- **다회용**이다. 만료·revoke·성사 알림이 통제 수단이다.
- 링크로 친구가 성사되면 발급자에게 `friend_joined_via_link` 알림을 보낸다. 승인 단계를 없앤 대신 이 알림이 그 역할을 한다.

---

## 5. M3 — 선물이 수령자 확인을 거쳐 결정된다

### Product

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `name` | string | |
| `category_id` | FK **Category** | 취향 항목과 같은 마스터 |
| `price` | int | |
| `image_url` | string, nullable | |
| `is_active` | bool | |

자체 커머스는 범위 밖이므로 시드 카탈로그로 채운다. `category_id`가 `TasteItem`과 같은 마스터를 가리키므로, "수령자가 `unwanted`로 표시한 카테고리의 상품"을 조인 한 번으로 걸러낼 수 있다.

### PaymentMethod

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `user_id` | FK User | |
| `provider` | string | `portone` |
| `billing_key` | string | **암호화 저장** |
| `card_brand` / `card_last4` | string | 화면 표시용 |
| `status` | enum | `active` / `expired` / `deleted` |
| `created_at` / `deleted_at` | | |

카드번호·CVC는 **저장하지 않는다.** PortOne이 보관하고, 이쪽은 빌링키만 갖는다. 빌링키는 사용자당 재사용한다. 요청마다 새로 발급하면 카드 등록을 매번 시키는 꼴이 된다. **동의는 요청마다 받되 결제수단은 재사용한다.**

### GiftRequest

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | PK | |
| `giver_id` / `receiver_id` | FK User | |
| `status` | enum | `pending` / `paying` / `paid` / `payment_failed` / `expired` / `cancelled` |
| `resolution` | enum, nullable | `approved` / `countered` — 어느 경로로 확정됐는지 |
| `resolved_at` | timestamp, nullable | |
| `product_id` | FK Product | 이력 추적용 참조 |
| `product_snapshot` | jsonb | 이름·이미지·가격 |
| `requested_amount` | int | |
| `counter_product_id` | FK, nullable | |
| `counter_product_snapshot` | jsonb, nullable | |
| `counter_amount` | int, nullable | **CHECK ≤ `requested_amount`** |
| `countered_at` | timestamp, nullable | |
| `final_amount` | int, nullable | 결제 시 확정 = `counter_amount ?? requested_amount` |
| `receiver_display_name` | string | **D3 스냅샷** |
| `shipping_address_snapshot` | jsonb, nullable | 수령자가 **이 거래에** 제공한 것 |
| `payment_method_id` | FK PaymentMethod | |
| `consent_agreed_at` | timestamp | |
| `consent_version` | string | 어떤 문구에 동의했는지 |
| `respond_due_at` | timestamp | 생성 시 절대 시각으로 스냅샷 |
| `payment_retry_until` | timestamp, nullable | 재시도 윈도우 |
| `payment_attempt_count` | int | |
| `paid_at` / `expired_at` / `cancelled_at` | timestamp, nullable | |

**대안 제시를 별도 엔티티로 두지 않은 이유**: 1회, 단방향, 금액 상한이 있는 구조다. 협상 테이블이 아니므로 `counter_*` 필드로 충분하다. 반복 협상이 필요해지면 그때 엔티티로 승격한다.

#### 상태 전이

```
   (요청 생성: 빌링키 확보 + 동의 기록)
        |
     pending --- 수령자 승인 ------> +
        |    --- 수령자 대안 제시 --> +--> paying --성공--> paid *
        |                                     |
        |                                     +--실패--> payment_failed
        |
        +--- 응답 기한 초과 ------------------------------> expired *
        +--- 주는 사람 취소 ------------------------------> cancelled *

  payment_failed --- 결제수단 갱신 후 재시도 ---------------> paying
                 --- 재시도 기한 초과 / 최대 시도 횟수 초과 -> cancelled *
```

- **명시적 거절 상태가 없다.** PRD가 "거절이 아닌 대안 제시로 읽혀야 한다"고 했으므로, 수령자의 선택지는 `승인` / `대안 제시` / `무응답(→ 만료)` 셋뿐이다. `declined`를 만들지 않는 것 자체가 그 요구사항의 구현이다.
- **`approved` / `countered`는 상태가 아니다.** 자동 결제이므로 머무는 상태가 아니라 지나가는 분기다. 어느 경로였는지는 `resolution` 필드에 남는다.
- **`paying`은 멱등성 장치다.** PG 호출은 외부 비동기라 이 상태 없이는 중복 청구를 막을 수 없다. 결제 시도 진입 시 `pending → paying`을 조건부 UPDATE로 잠그고, 그 UPDATE가 0행이면 이미 진행 중이므로 중단한다.
- 대안 제시 시에는 **즉시 자동 결제**하고 사후 고지한다. PRD의 사전 동의가 이 권한을 위임받기 위한 장치다.

#### 결제 실패 처리 (R8)

1. 자동 결제 실패 → `payment_failed` + 주는 사람에게 `gift_payment_failed` 알림
2. 결제수단 갱신 후 재시도. `payment_retry_until`(기본 24시간) 안에서 `GIFT_PAYMENT_MAX_ATTEMPTS`(기본 3)회까지
3. 초과 시 `cancelled` + **양쪽에 고지.** 수령자에게도 알린다 — 승인까지 해놓고 소식이 끊기는 것이 최악이다

#### 제약

- `counter_amount ≤ requested_amount` — DB CHECK. PRD 정책의 마지막 방어선이다
- `counter_product_id` · `counter_product_snapshot` · `counter_amount` 는 **전부 NULL이거나 전부 NOT NULL** — CHECK
- `giver_id <> receiver_id`
- 요청 생성 시 `Friendship(giver, receiver).status = 'active'` 검증
- 요청 생성 시 giver에게 `status = 'active'` 인 `PaymentMethod`가 있어야 한다. **빌링키 등록이 요청보다 앞선다**
- 상태 전이는 위 다이어그램의 화살표만 허용한다. 전이 함수 하나로 모아 검증한다

### Payment

| 필드 | 비고 |
|---|---|
| `id` | PK |
| `provider` / `provider_tx_id` | PortOne |
| `amount` | int |
| `status` | `ready` / `paid` / `failed` / `cancelled` / `refunded` |
| `gift_request_id` | FK, **nullable** |
| `funding_contribution_id` | FK, **nullable** |
| `paid_at` / `refunded_at` | nullable |

```sql
CHECK ( (gift_request_id IS NOT NULL)::int
      + (funding_contribution_id IS NOT NULL)::int = 1 )
```

polymorphic 컬럼(`payable_type` + `payable_id`) 대신 nullable FK 2개를 쓴다. DB가 참조 무결성을 계속 지켜준다. 결제 데이터에서는 이것을 양보하지 않는다.

### Notification

| 필드 | 비고 |
|---|---|
| `id` `user_id` | 받는 사람 |
| `type` | 아래 목록 |
| `payload` | jsonb — 관련 엔티티 id와 표시용 값 |
| `read_at` | nullable |
| `created_at` | |

| type | 받는 사람 | 근거 |
|---|---|---|
| `friend_joined_via_link` | 발급자 | 3-3에서 승인 단계를 없앤 대신의 통제 장치 |
| `gift_request_received` | 수령자 | 응답 기한이 걸려 있어 즉시성이 중요 |
| `gift_countered` | 주는 사람 | PRD 확정 정책 — 대안 제시 사실을 알린다 |
| `gift_paid` | 양쪽 | |
| `gift_payment_failed` | 주는 사람 | 결제수단 갱신 유도 |
| `gift_cancelled_by_payment` | 수령자 | 승인 후 소식이 끊기는 것을 막는다 |
| `gift_expired` | 주는 사람 | |
| `funding_contribution_received` | 주최자 | |
| `funding_succeeded` | 참여자·수령자 | |
| `funding_failed_refunded` | 참여자 | 돈이 오갔으므로 필수 |
| `funding_organizer_topup` | 주최자 | 동의를 받았어도 고지는 별개다 |

MVP는 인앱만. 푸시는 배포 인프라 영역이므로 범위 밖으로 둔다.

### Event

| 필드 | 비고 |
|---|---|
| `id` | PK |
| `user_id` | 일정의 **주체**(생일의 주인) |
| `type` | `birthday` / `anniversary` / `custom` |
| `title` | string |
| `date` | date |
| `is_recurring` | bool — true면 연도를 무시하고 월·일로 매칭 |

생일을 `User.birthday` 필드로 두지 않고 `Event`로 통일한다. 홈 탭이 "다가오는 일정"을 축으로 도는데, 생일만 필드고 기념일만 테이블이면 조회를 두 번 해서 합쳐야 한다.

---

## 6. M4 — 고가 선물을 여럿이 함께 준비한다

### Funding

| 필드 | 비고 |
|---|---|
| `id` | PK |
| `organizer_id` / `receiver_id` | 둘이 같을 수 있다 (PRD: 개설 주체 양쪽 가능) |
| `product_id` / `product_snapshot` | |
| `goal_amount` | 목표 금액 |
| `min_amount` | **최소 달성선.** CHECK `≤ goal_amount` |
| `deadline` | timestamp |
| `status` | `open` / `succeeded` / `settled` / `failed` / `cancelled` |
| `organizer_payment_method_id` | FK — **차액 부담용 빌링키** |
| `organizer_consent_agreed_at` / `consent_version` | "미달 시 차액을 부담합니다" 동의 |
| `receiver_display_name` | D3 스냅샷 |

```sql
-- 5-5: 개설자 = 수령자이면 차액 개념을 없앤다
CHECK ( organizer_id <> receiver_id OR min_amount = goal_amount )
```

### FundingContribution

| 필드 | 비고 |
|---|---|
| `id` `funding_id` `contributor_id` | |
| `amount` | int — 1인 최대 참여액 제한 없음 (PRD) |
| `payment_id` | FK, nullable |
| `status` | `reserved` / `paid` / `refunded` |
| `reserved_until` | timestamp — 예약 만료 |
| `created_at` | |

### 상태 전이

```
open --- 마감 & paid 합계 >= min_amount ---> succeeded --(차액 자동결제)--> settled *
     --- 마감 & paid 합계 <  min_amount ---> failed *    (전 참여 건 환불)
     --- paid 합계 = goal_amount ----------> succeeded   (조기 성사, 참여 마감)
     --- 주최자 취소 ----------------------> cancelled * (전 참여 건 환불)
```

`settled` · `failed` · `cancelled` 가 종착 상태다. 환불에 별도 상태를 두지 않는 이유는 **환불의 진행 상황이 이미 `FundingContribution.status`에 있기** 때문이다. `Funding`에 `refunded`를 더하면 `failed`(달성선 미달)와 `cancelled`(주최자 취소)의 구분이 사라진다. 두 상태로 진입하면 그 시점에 모든 `paid` 참여 건에 환불을 건다.

**총액의 정의가 두 곳에서 다르다.** 이것을 섞으면 조용히 깨진다.

| 쓰임 | 합산 대상 |
|---|---|
| 성사·미달 판정 | `status = 'paid'` 인 참여 건만 |
| 잔여 금액(캡) 계산 | `status IN ('reserved', 'paid')` |

판정에 `reserved`를 넣으면 결제되지 않을 수도 있는 돈으로 성사를 선언하게 되고, 캡 계산에서 `reserved`를 빼면 동시 참여가 목표를 넘긴다.

**차액 부담이 자동화된다.** `min_amount <= 총액 < goal_amount`로 성사되면 주최자 빌링키로 `goal_amount - 총액`을 자동 결제한다. 개설 시점에 동의를 받아뒀으므로 별도 터치가 없다. 결제 후 `funding_organizer_topup` 알림을 보낸다.

### 동시성 — 목표 초과 캡

트랜잭션만으로는 막을 수 없다. 두 명이 동시에 남은 금액을 참여하면 캡을 넘고, 결제는 외부 호출이라 트랜잭션 안에 넣을 수도 없다. **2단계 예약**으로 처리한다.

1. **예약** — `SELECT ... FOR UPDATE`로 `Funding` 행을 잠그고 잔여 금액을 확인한 뒤 `status = 'reserved'` contribution을 만든다 (`reserved_until = now() + FUNDING_RESERVATION_TTL`)
2. **결제** — 트랜잭션 밖에서 PortOne 호출
3. **확정** — 성공이면 `paid`, 실패·시간 초과면 예약 해제

잔여 금액 계산에는 `reserved`와 `paid`를 **모두** 포함해야 초과가 발생하지 않는다. 만료된 예약은 §8의 지연 평가 방식으로 처리한다.

### 지분 공개 (R5)

```
canViewAllContributions(viewer, funding) := viewer ∈ { organizer, receiver }
canViewOwnContribution(viewer, funding)  := viewer ∈ contributors
```

참여자끼리는 서로의 금액을 볼 수 없다. 참여 화면에 "수령자에게 금액이 공개됩니다" 고지를 띄우는 것은 UI 요구사항으로 남는다.

---

## 7. 접근 제어 규칙 (전체)

D1·D2 덕분에 규칙이 한 줄로 축약된다. 항목별 분기도, 소유자 판정도 없다.

```
canViewTasteProfile(viewer, owner) := ∃ Friendship(viewer, owner) WHERE status = 'active'
canViewEvents(viewer, owner)       := canViewTasteProfile(viewer, owner)
```

미리보기(R1 완화책)만 별도 경로다.

```
canViewPreview(token) := 유효한 FriendInviteLink (미만료 · 미revoke)
  --> 노출: 표시명 · 프로필 이미지 · 대표 태그 2~3개
```

**대표 태그**는 `want` 항목의 카테고리명 최신 3건을 자동 추출한다. 사용자가 따로 고르게 하는 것은 온보딩에 입력을 하나 더 얹는 일이다.

### D3 — 관계 해제 시 진행 중 거래 예외

"진행 중"의 정의:

- `GiftRequest.status ∈ { pending, paying, payment_failed }`
- `Funding.status ∈ { open, succeeded }`

관계가 `removed`여도 **진행 중 거래의 상대에 대해서만** 열리는 것:

| 항목 | 열림 | 근거 |
|---|---|---|
| 표시명 · 프로필 이미지 | 예 | "누구에게 보내는 선물"인지 화면에 떠야 한다 |
| 해당 거래의 선물 항목 · 금액 | 예 | 거래 자체 데이터 |
| 배송지 | **조건부** | 수령자가 **그 거래에** 제공한 것만. 프로필의 기본 배송지가 아니다 |
| 취향 항목 전체 | 아니오 | |
| 취향 서술 | 아니오 | |
| 다른 친구 목록 · 다른 거래 이력 | 아니오 | |

**구현 원칙**: 위에서 열리는 항목은 전부 **거래 생성 시점에 `GiftRequest` · `Funding`이 자기 안에 복사해 두는 값**이다. 따라서 예외 조회는 "거래 엔티티를 읽는 것"으로 끝나고, `Friendship`을 뒤지는 예외 분기가 조회 API마다 달라붙지 않는다. 이 스냅샷은 결제 정합성 때문에 어차피 필요하므로 추가 비용이 없다. soft delete(D3)는 유지되며, 실제 역할은 **이력과 재추가 판정**이다.

---

## 8. 만료 처리 — 배치 대신 지연 평가

응답 기한 5분을 cron으로 스캔하면 주기가 곧 오차가 된다(5분 배치 → 최대 10분). Next.js App Router에 cron 인프라를 얹는 비용도 든다.

**지연 평가(lazy)** 로 처리한다. 조회·전이 시점에 `respond_due_at < now()`이면 만료로 판정하고 그때 상태를 기록한다. 별도 인프라가 없고 오차도 없다. 같은 방식을 `FundingContribution.reserved_until`에도 적용한다.

만료 **알림**이 필요해지는 시점에만 스케줄러를 붙인다. 그것은 M3 범위 밖이다.

---

## 9. 설정값

전부 env/config로 둔다. **생성 시점에 절대 시각으로 스냅샷**하므로, 운영 중 값을 바꿔도 이미 뜬 요청은 흔들리지 않는다.

| 키 | 기본값 | 근거 |
|---|---|---|
| `GIFT_RESPOND_TTL` | 5분 | PRD — 시연 기준. 실서비스 배포 시 조정 |
| `GIFT_PAYMENT_RETRY_WINDOW` | 24시간 | §5 결제 실패 처리 |
| `GIFT_PAYMENT_MAX_ATTEMPTS` | 3 | §5 결제 실패 처리 |
| `FRIEND_INVITE_TTL` | 7일 | 3-3 |
| `FUNDING_RESERVATION_TTL` | 5분 | §6 동시성 |

---

## 10. 동의 문구 버전 관리

`consent_version`은 **코드 상수 + 버전 문자열**로 다룬다. 별도 `ConsentTemplate` 테이블은 과하다. 규칙 하나만 지킨다.

> **문구를 고치면 반드시 버전을 올린다.** 고치면서 버전을 그대로 두면 과거 동의가 무엇이었는지 복원할 수 없다.

버전이 올라가면 문구 원문은 git 이력에 남아 증빙이 된다. 4-1에서 결제 권한을 위임받는 이상 이것은 지켜야 하는 선이다.

---

## 11. 마일스톤별 구축 순서

PRD의 Delivery Milestones를 따른다. 순서를 바꾸면 취향이 비어 있는 화면을 시연하게 된다.

| # | 마일스톤 | 구축 대상 | 완료 판정 |
|---|---|---|---|
| 1 | 맞춤 취향을 남길 수 있다 | `Category` 시드 · `User` · `TasteProfile` · `TasteItem` | 온보딩으로 `have`/`unwanted` 1건 이상을 저장하고 다시 볼 수 있다. §3의 상세 작성률 쿼리가 돈다 |
| 2 | 친구에게 취향이 전달된다 | `Friendship` · `FriendInviteLink` · §7 접근 제어 | 링크 수신자가 가입·수락 후 상대 취향을 열람한다. 미리보기가 비가입 상태에서 뜬다 |
| 3 | 선물이 수령자 확인을 거쳐 결정된다 | `Product` 시드 · `PaymentMethod` · `GiftRequest` · `Payment` · `Notification` · `Event` | 승인·대안 제시 양쪽 경로로 자동 결제가 완료된다. 결제 실패 후 재시도로 복구된다 |
| 4 | 고가 선물을 여럿이 함께 준비한다 | `Funding` · `FundingContribution` | 달성선 기준으로 성사·취소가 갈리고, 미달 시 전액 환불된다. 차액 자동 결제가 동작한다 |

M1~M2가 이 제품의 자산(맞춤 취향 데이터)을 만들고, M3~M4는 그 자산을 쓰는 층이다.

---

## 12. 이 문서가 다루지 않는 것

- **화면·인터랙션 설계** — 마일스톤별 기능 스펙에서 다룬다
- **인증 방식** — 소셜 로그인 여부, 세션 전략. M1 착수 시점에 정한다
- **PortOne 연동 상세** — API 호출 시퀀스, 웹훅 처리, 테스트 모드 설정. M3 착수 시점에 정한다
- **푸시 알림** — 배포 인프라 영역
- **Out of scope (PRD)** — 포인트·자체 화폐, 최저가 비교, 자체 커머스·물류, 소셜 피드, 가입 없는 취향 열람

---

## 13. 열린 항목

| # | 항목 | 언제 닫나 |
|---|---|---|
| 1 | **DBMS 확정** — 이 문서는 PostgreSQL을 전제한다. partial index · `jsonb` · `CHECK` · `FOR UPDATE`가 그에 의존한다 | M1 착수 직전 |
| 2 | **인증 방식** | M1 착수 직전 |
| 3 | **캘린더의 위치** — 홈의 "다가오는 일정"으로 충분한지 별도 월간 뷰가 필요한지 (PRD Open Question) | M3 착수 시점 |
| 4 | **"반려" 대체 문구** — 거절이 아닌 대안 제시로 읽히는 표현 (PRD Constraints) | M3 개발 중 |
| 5 | **대표 태그 3건의 선정 규칙** — 최신순으로 충분한지 | M2 착수 시점 |
| 6 | **Why now? · 성공 지표 목표 수치 · 양면 중 어느 쪽 먼저** (PRD Open Question) | Evidence 확보 후 |

PRD의 R3(수령자 개설 펀딩의 차액 부담 주체)는 §6의 `CHECK` 제약으로 해소되었다.

---

## 부록 — Future에 연기된 것과 그 진입 지점

| 기능 | 진입 지점 | 연기 근거 |
|---|---|---|
| 친구 그룹별 취향 공개 | `Friendship`에 그룹 컬럼 추가 + `TasteItem`에 공개 등급 추가 | D2 |
| 친구 개인 메모 | 별도 테이블. 기존 스키마 변경 없음 | D1 |
| 취향 조회 로그 | 별도 테이블. 기존 스키마 변경 없음 | R9 완화책, 후행 추가 비용 낮음 |
| 경조사 · 가계부 | 관계 데이터와 결제 이력이 쌓인 뒤 | PRD Future |
