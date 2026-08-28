# Neonjisi Design SSOT

> Single Source of Truth for Neonjisi UI/UX design.
>
> 이 문서는 현재 확정된 디자인 결정을 기록한다. 디자인 관련 문서 또는 Agent 판단이 이 문서와 충돌하면 SSOT를 우선한다.
> 단, 제품 기능·정책·MVP 범위의 Source of Truth는 `neonjisi.prd-v2.md`이다.

---

## 1. 확정 디자인 방향

- Design Version: **V2**
- Primary Design Language: **Playful Minimalism**
- Supporting Tone: **Soft / Warm / Personal**
- Color Direction: **Rose + Soft Apricot**
- Soft Apricot: **`#FBE2C1` — LOCKED**
- Font Family: **`Pretendard Variable` — LOCKED**
- Responsive: **Mobile First + Tablet/Desktop Responsive**

### Neo-Brutalism

Neo-Brutalism은 전체 UI 스타일이 아니다.

- Primary CTA / Button의 제한적인 Graphic Accent로만 사용한다.
- Card, Navigation, Form, Feedback 등 전체 UI로 확장하지 않는다.
- 반복적인 hard outline / hard offset shadow를 사용하지 않는다.
- Playful Minimalism이 항상 Primary Design Language다.

---

## 2. 핵심 Product Design Principle

넌지시는 일반적인 상품 중심 쇼핑 서비스가 아니다.

핵심 정보 위계:

**사람 → 취향 → 선물**

- 사람과 관계가 상품보다 먼저 인식되어야 한다.
- 맞춤 취향이 선물 선택의 근거로 작동해야 한다.
- 상품 Grid가 관계와 취향 맥락을 압도하지 않는다.
- 친근하지만 유아적이지 않은 인상을 유지한다.
- 장식보다 정보 위계와 사용성을 우선한다.
- 여러 Pastel 계열을 화면 전체에 분산하지 않는다.

---

## 3. Design Token 원칙

### Color
- Brand Primary: 현재 확정된 **Rose 계열 Token**
- Secondary Accent: **Soft Apricot `#FBE2C1`**
- Background / Surface / Text / State Color: 확정된 Design System Token 사용
- Soft Apricot을 Peach / Coral 또는 유사 색상으로 임의 보정하지 않는다.
- Green/Cream 등 과거 비교 팔레트를 다시 사용하지 않는다.
- 임의 HEX 하드코딩 금지

### Typography
- Font Family: **Pretendard Variable**
- 모든 한글 UI에 적용
- 확정된 size / weight / line-height / hierarchy Token 사용
- 다른 Font 또는 fallback Font로 임의 변경하지 않는다.

### Spacing / Radius / Shadow
- 확정된 Spacing Token 사용
- 화면별 임의 spacing 생성 금지
- Radius / Border / Shadow는 Design System의 Token 및 Component Variant 사용
- Neo-Brutalism hard offset shadow는 확정된 CTA/Button 범위 밖으로 확장하지 않는다.

---

## 4. Component 원칙

새 화면을 만들 때 다음 순서를 따른다.

1. 기존 Component 존재 여부 확인
2. 기존 Component 재사용
3. 기존 Component Variant로 해결 가능한지 검토
4. 불가능할 경우에만 최소한의 신규 Component / Variant 추가

화면마다 독립적인 Component Style을 새로 만들지 않는다.
Foundation과 Component를 우회한 직접 스타일 하드코딩을 금지한다.

---

## 5. Navigation

Bottom Navigation은 다음 4탭으로 확정한다.

1. **홈** — 다가오는 일정 · 승인 대기 · 진행 중 펀딩
2. **친구** — 친구 목록 · 맞춤 취향 · 친구 기준 선물 추천
3. **선물** — 검색 · 카테고리
4. **마이** — 내 취향 · 선물 내역 · 펀딩 내역 · 설정

---

## 6. MVP 디자인 범위

기능 및 정책의 상세 정의는 `neonjisi.prd-v2.md`를 따른다.

현재 디자인 대상의 핵심 범위:
- 맞춤 취향 프로필
- 원하는 것 / 위시리스트
- 이미 있는 것 / 필요 없는 것
- 취향 서술
- 친구 추가 요청 링크 및 수락
- 친구 목록 / 다가오는 일정
- 친구 맞춤 취향 열람
- 취향 기반 선물 추천
- 일반 선물 검색 / 카테고리
- 상품 상세 / 선물 요청
- 선물 승인 / 대안 제시
- 결제 / 완료 / 실패
- 공동 펀딩
- 마이 / 선물 내역 / 펀딩 내역 / 설정

---

## 7. Out of Scope

MVP에서 제외:
- 포인트 / 자체 화폐
- 최저가 비교 / 가격 추적
- 자체 커머스 / 물류
- 소셜 피드
- 가입 없는 상세 취향 열람
- 경조사
- 가계부

기능 범위가 변경될 경우 SSOT에서 임의 변경하지 않고 PRD를 먼저 갱신한다.

---

## 8. 문서 책임과 우선순위

### 디자인 결정
1. `neonjisi-design-ssot.md`
2. 해당 STEP의 `01~12` 디자인 문서
3. 실행 가이드

### 제품 기능 / 정책 / MVP Scope
1. `neonjisi.prd-v2.md`
2. `12_full_screen_design.md`
3. 실행 가이드

### 충돌 처리
- Color / Typography / Visual Style / Token / Component 원칙 충돌 → **SSOT**
- 기능 / 정책 / Scope 충돌 → **PRD**
- 확정되지 않은 사항 → Agent가 임의 결정하지 않고 `OPEN QUESTION`으로 표시

---

## 9. 작업 순서

`01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12`

- STEP 01~10: Design System 구축
- STEP 11: 대표 시안 3장을 완성된 Design System으로 Refactoring
- STEP 12: 완성된 Design System으로 전체 MVP 화면 확장

모든 STEP 시작 전 이 SSOT를 확인한다.

---

## 10. Locked Decisions

다음 값은 명시적 팀 결정 없이 변경하지 않는다.

- **Design Version = V2**
- **Visual Style = Playful Minimalism**
- **Color Direction = Rose + Soft Apricot**
- **Soft Apricot = `#FBE2C1`**
- **Font = Pretendard Variable**
- **Bottom Navigation = 홈 / 친구 / 선물 / 마이**
- **Neo-Brutalism = Primary CTA / Button에만 제한**

새로운 디자인 탐색이 필요하면 기존 값을 조용히 변경하지 말고 별도 Variant로 만든 뒤 팀 승인 후 SSOT를 갱신한다.
