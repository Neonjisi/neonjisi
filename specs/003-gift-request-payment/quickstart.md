# Quickstart: 선물이 수령자 확인을 거쳐 결정된다 (마일스톤 3)

**Date**: 2026-08-31 | **Plan**: [plan.md](./plan.md)

이 기능이 실제로 동작하는지 확인하는 절차다. 구현 방법이 아니라 **검증 방법**을 담는다.
스키마는 [data-model.md](./data-model.md), 인터페이스는
[contracts/server-actions.md](./contracts/server-actions.md)를 본다.

## 전제 조건

M2가 완료된 상태에서 시작한다 — 활성 친구 관계(A↔B)와 알림 목록이 이미 동작한다.

| 항목 | 값 |
|---|---|
| 테스트 계정 2개 | M2의 `E2E_USER_*` · `E2E_USER2_*` 그대로. **3계정은 M4부터** (R12) |
| 개발 서버 포트 | **3000 고정** — `playwright.config.ts`의 `baseURL`·`webServer` |
| 결제 모드 | **`PORTONE_MODE=mock`** — E2E·수동 검증 모두. 실키는 시연 직전에만 (clarify Q1) |

`.env.local`에 추가한다.

```
PORTONE_MODE=mock
BILLING_KEY_ENCRYPTION_KEY=   # 32바이트 base64 — openssl rand -base64 32
GIFT_RESPOND_TTL=5m           # 검증 중엔 늘려도 된다 — 이미 뜬 요청은 안 흔들린다 (R11)
GIFT_PAYMENT_RETRY_WINDOW=24h
GIFT_PAYMENT_MAX_ATTEMPTS=3
```

> ⚠️ **`.env.local`은 커밋 금지.** 실키가 생기는 순간부터 특히.
> ⚠️ **mock 실패 규약**: 카드 뒷자리 `0000`으로 등록한 결제수단은 결제가 항상 실패한다 (R1).
> 실패 경로 검증에 쓴다.

## 준비

```bash
npm install
npx prisma migrate dev          # C5~C8 CHECK 포함
npx prisma db seed              # Product 30~50건 (S의 콘텐츠 표 반영분)
npm run dev                     # 반드시 3000
```

> **새 환경은 반드시 `migrate deploy`(또는 `migrate dev`)로 만든다.** `db push`는 raw SQL의
> CHECK 4종을 만들지 않는다 — M1 `NULLS NOT DISTINCT` · M2 C3/C4와 같은 함정.

## 검증 시나리오

각 시나리오는 [spec.md](./spec.md)의 수용 시나리오에 대응한다. A = 주는 사람, B = 수령자.

### V1 — 어긋난 선물이 걸러진다 (US1)

1. B가 카테고리 X를 `관심 없어요`로 표시해 둔다 (M1 화면)
2. A의 선물 탭에서 대상 필터로 B 선택 → **카테고리 X 상품이 목록에 없다** (FR-003)
3. 검색으로 카테고리 X 상품 상세 진입 → **선물하기 비활성** + 사유 문구 (FR-005) — 우회 차단
4. B의 `원하는 것` 일치 상품 상세 → 긍정 배너. `이미 있어요` 일치 → 주의 배너인데 **선물하기는 된다** (FR-004)
5. B 맞춤 추천 → `want` 매칭 섹션 + 카테고리 확장 + **제외 안내 문구** (FR-006)
6. 대상 필터 결과 0건인 친구 → "전체에서 골라보세요" 안내
7. 친구 아닌 계정으로 `/products/for/{userId}` 직접 접근 → 거부 (FR-007)

### V2 — 결제수단 등록 (US2)

1. A가 요청 플로우 진입(결제수단 0건) → **SCR-M3-06 강제 진입** → mock 카드 등록 → **원래 플로우 복귀** (FR-013)
2. 등록 화면에 "카드 정보는 넌지시에 저장되지 않습니다"가 보인다 (FR-010)
3. 관리 화면 → 브랜드·뒷자리 4자리만 보인다. DB에서 `billingKey` 컬럼이 **평문이 아닌지** 확인 (FR-008, R10)
4. 진행 중 요청이 있는 카드 삭제 시도 → "진행 중인 선물 요청 N건" 경고 후 삭제 허용 (FR-011)

### V3 — 요청 생성과 동의 (US3)

1. A가 상품 확정 → **동의가 별도 화면**으로 뜬다. 체크 전 버튼 비활성 (FR-014)
2. 동의 문구에 **요청 금액이 숫자로** 박혀 있고, 차액 미청구·미환급 + 결과 고지가 있다 (clarify Q4 문구)
3. 전송 → B의 홈 최상단·알림에 도착. 카운트다운 시작 (FR-018·FR-038)
4. DB에서 `consentAgreedAt`·`consentVersion`·`respondDueAt`(절대 시각)·`productSnapshot`이 채워졌는지 확인 (FR-015·FR-016)
5. A가 `pending`에서 취소 → B 쪽에서 응답 불가 · "요청이 취소되었어요" (FR-019)
6. (서버 검증) B의 `unwanted` 상품으로 API 직접 생성 시도 → 거부 — **3중 차단 최종 지점** (FR-013 ③)

### V4 — 수령자 응답: 승인 경로 (US4)

1. B의 수신 화면 → **거절 버튼이 없다.** 승인 / `다른 것도 좋아요` 둘뿐 (FR-020, clarify Q3)
2. 승인 → 배송지 입력("이 주소는 이 선물에만 사용됩니다" 확인) → **추가 조작 없이** 결제 완료 (SC-001)
3. 양쪽 알림에 `GIFT_PAID`, A의 상세에 "결제 완료", `resolution=APPROVED`

### V5 — 수령자 응답: 대안 경로 (US4)

1. B가 `다른 것도 좋아요` → 재선택 화면: **요청 금액 이하만** + 내 `want` 우선 (FR-021·FR-023)
2. 확정 직전 "민수님에게 다른 상품을 골랐다고 알려집니다" + 차액 미청구 고지 (FR-024)
3. 확정 → 자동 결제 → A의 상세에 원래 → 최종 대조 + "차액 N원은 청구되지 않았습니다"
4. (제약) DB에 상한 초과 counter 삽입 시도 → **C5가 거부** (quickstart 하단 SQL로 확인)

### V6 — 만료·동시성 (US4 Edge)

1. 요청 후 TTL 경과 → B가 수신 화면 진입 → 만료 안내, 버튼 없음. **A에게 `GIFT_EXPIRED` 알림** (FR-026·FR-035)
   > 만료는 DB에서 `respondDueAt`을 과거로 바꿔 만들어도 된다 — 진입 즉시 판정된다 (R3)
2. 화면을 열어둔 채 만료 → 승인 클릭 → 실패 + 만료 안내 전환
3. (통합 테스트로) 같은 요청 동시 승인 2회 → **결제 1회** (SC-002, R2)

### V7 — 결제 실패 복구 (US5)

1. A가 뒷자리 `0000` mock 카드로 요청 → B 승인 → **결제 실패** → A에게만 알림, **B에게는 아무 표시 없음** (FR-030)
2. A의 복구 화면 → 시도 횟수 · 재시도 기한 표시 (FR-031)
3. 정상 카드로 **변경 후 재시도** → 성공 → 양쪽 알림 (SC-006)
4. (반복 실패로) 3회 초과 → `CANCELLED` + **B에게 `GIFT_CANCELLED_BY_PAYMENT`** — "민수님께 별도로 연락해보세요" (FR-032)

### V8 — 홈·일정·내역 (US6)

1. 승인 대기 2건 이상 → 홈 최상단, 임박순 1건 펼침 + 나머지 접힘 (FR-038)
2. 카운트다운이 홈·상세·수신에서 **같은 값** (FR-039)
3. 일정 등록 → "친구에게 이 일정이 보입니다" 고지. B의 홈·친구 탭에 A의 일정 (FR-040·FR-041)
4. 선물 내역 → 보낸/받은 탭, 진행 중/지난, "다른 상품으로 변경됨" 라벨 (FR-042)
5. 앱 셸: 4탭 전부 활성 · 시작 화면이 홈 · 마이에 선물 내역·결제수단 메뉴 (FR-043)
6. 위시리스트 추가에 `( 카탈로그에서 고르기 )` — 고른 항목이 상품과 연결 (FR-044)
7. B와 관계 해제 후 → 진행 중·완료 요청 화면이 **스냅샷으로 계속 열린다.** 취향 카드는 거부 (SC-009)

### 제약 확인 (Phase 9 — J19)

```sql
SELECT conname FROM pg_constraint
 WHERE conname IN ('gift_counter_le_requested','gift_counter_all_or_none',
                   'gift_no_self','payment_exactly_one_target');
```

**4행이 전부 나와야 한다.** 안 나오면 `db push`로 만든 DB다 — 마이그레이션으로 다시 만든다.

### 승인률 쿼리 (S — Phase 9)

```sql
SELECT COUNT(*) FILTER (WHERE resolution = 'APPROVED')::float
     / NULLIF(COUNT(*) FILTER (WHERE resolution IS NOT NULL), 0) FROM "GiftRequest";
```

## 테스트

```bash
npm run test                              # Vitest — 단위·통합 (전이 전수·동시성·CHECK 포함)
npx playwright test --project=chromium
npx playwright test --project=mobile-360  # 360px (SC-010)
```

> **`skipped` 수를 확인한다** — 계정 env가 비면 E2E가 실패 대신 skip 된다 (M1·M2의 함정).
> 팀원 화면 의존 단계는 probe skip이 정상이다 — skip 사유가 출력에 남는지 본다 (R12).

## 품질 게이트

```bash
npm run lint
npm run build
```
