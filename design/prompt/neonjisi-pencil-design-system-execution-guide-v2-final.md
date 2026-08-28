# 넌지시 Pencil 디자인 시스템 작업 실행 가이드

## 목적

이 문서는 넌지시 대표 시안 3장을 기준으로 Pencil에서 Foundation → Component → Refactoring 순서로 디자인 시스템을 구축할 때 사용하는 실행 가이드다.

대표 시안:
1. 친구 상세 / 맞춤 취향 프로필
2. 친구 기준 선물 추천·탐색
3. 선물 승인 요청

디자인 방향:
- Base: Soft Playful Minimalism
- Accent: Light Neo-Brutalism
- People-first / Taste / Gift / Warm / Playful / Clear / Personal / Soft / Bold Accent

---


## 문서 기준 및 SSOT 사용 규칙

모든 작업을 시작하기 전에 `neonjisi-design-ssot.md`를 먼저 확인한다.

### 문서별 역할

- `neonjisi-design-ssot.md`
  - 최종 확정된 시각 디자인 기준
  - Color / Typography / Visual Style / Token / Component 원칙

- `spec/2026-08-26-screen-spec.md`
  - 화면 구조
  - 기능
  - 콘텐츠
  - 상태 및 예외
  - 인터랙션
  - 화면 전이
  - 접근 제어

- `prompt/01~12`
  - 각 단계별 Pencil 생성 및 리팩터링 작업 지시

- 이 실행 가이드
  - 작업 순서와 Agent 실행 방법

### 충돌 처리 규칙

- 화면 기능 / 구조 / 상태 / 인터랙션 / 화면 전이는
  `spec/2026-08-26-screen-spec.md`를 따른다.

- Color / Typography / Shape / Radius / Border / Elevation /
  Component Style 등 시각 디자인은
  `neonjisi-design-ssot.md`를 따른다.

- `spec/2026-08-26-screen-spec.md`의
  `§4 비주얼 디자인 시스템`은 이전 디자인 탐색 단계의 기록으로 간주하며
  현재 디자인 작업에는 사용하지 않는다.

- `prompt/01~12`가 SSOT의 확정 디자인과 충돌할 경우
  SSOT를 따른다.

- 확정되지 않은 사항은 Agent가 임의로 결정하지 않는다.

### 권장 문서 위치

```text
/docs/
├── neonjisi.prd-v2.md
└── design/
    ├── neonjisi-design-ssot.md
    ├── 01_foundation_color.md
    ├── 02_foundation_typography.md
    ├── 03_foundation_iconography.md
    ├── 04_foundation_icon_button.md
    ├── 05_component_action.md
    ├── 06_component_form.md
    ├── 07_component_navigation.md
    ├── 08_component_feedback.md
    ├── 09_component_misc.md
    ├── 10_foundation_spacing.md
    ├── 11_final_refactoring.md
    ├── 12_full_screen_design.md
    └── neonjisi-pencil-design-system-execution-guide-v2-final.md
```


# 0. 작업 전 원칙

## 현재 확정 상태 — 모든 단계에서 우선 적용
- 대표 시안: `V2 / Rose + Soft Apricot`
- Soft Apricot: 정확히 `#FBE2C1`
- Font Family: Custom Font의 `Pretendard Variable`
- 대표 시안 3장의 UX 구조와 레이아웃을 재설계하지 않는다.
- Foundation/Component는 확정 시안을 체계화하는 단계이며 새로운 스타일 탐색 단계가 아니다.
- 기존 Token / Component를 Single Source of Truth로 사용한다.
- Neo-Brutalism Accent는 Primary CTA/Button에만 제한한다.
- 선택지를 제시하거나 방향을 다시 질문하지 말고 각 단계 범위에서 바로 작업한다.


## 먼저 대표 시안 3장을 만든다

01번부터 바로 실행하지 않는다.

Foundation은 실제 서비스 시안에서 디자인 언어를 추출해 체계화하는 단계이므로,
먼저 대표 시안 3장의 디자인 방향을 어느 정도 확정한다.

시안 제작 단계에서는 완벽한 디자인 시스템을 만들 필요가 없다.
컬러, 타이포그래피, 카드, 태그, CTA 등의 전체적인 분위기를 확인할 수 있는 수준이면 된다.

대표 시안이 팀 리뷰를 통과한 뒤 아래 순서대로 디자인 시스템 구축을 시작한다.

## 에이전트 공통 지시

각 MD 파일을 실행할 때 다음 원칙을 공통으로 적용한다.

- 현재 Pencil 파일에 이미 존재하는 작업 결과를 우선 확인한다.
- 이전 단계에서 생성한 Foundation과 Component를 임의로 다시 만들거나 변경하지 않는다.
- 현재 단계에서 요구하는 범위만 작업한다.
- 다음 단계의 작업을 미리 수행하지 않는다.
- 기존 대표 시안 3장을 임의로 재설계하지 않는다.
- 디자인 방향은 Soft Playful Minimalism + Light Neo-Brutalism을 유지한다.
- Light Neo-Brutalism은 Primary CTA, Badge, 강조 Card 등 제한적인 영역에만 사용한다.
- 일반 쇼핑몰처럼 상품이 사람과 취향보다 먼저 강조되지 않도록 한다.
- 작업 완료 후 MD 파일의 최종 검토사항을 기준으로 자체 검토한다.
- 문제가 발견되면 현재 단계 범위 안에서 수정한 뒤 종료한다.

---

# 실행 순서

## STEP 1 — `01_foundation_color.md`

### 목적
대표 시안에서 사용한 색상을 디자인 토큰으로 체계화한다.

### 에이전트 지시사항

> 현재 Pencil 파일의 넌지시 대표 시안 3장을 먼저 확인해줘.
>
> `01_foundation_color.md`의 지시사항에 따라 Color Foundation만 생성해줘.
>
> 컬러는 V2 Rose + Soft Apricot으로 확정되어 있어. 새로운 팔레트를 제안하지 말고 현재 확정값을 토큰화해줘. Soft Apricot은 반드시 `#FBE2C1`을 사용해줘.
>
> 현재 시안의 전체적인 디자인 분위기는 유지하고, 시안에서 사용된 색상과 넌지시 디자인 방향을 기준으로 Primitive Color Token과 Semantic Color Token을 정의해줘.
>
> 새로운 UI 컴포넌트나 다른 Foundation은 아직 만들지 마.
>
> 작업 완료 후 문서의 최종 검토 항목을 확인하고 Color Foundation 범위 안에서 필요한 수정까지 완료해줘.

### 완료 확인
- Primitive Color Token
- Semantic Color Token
- Color Palette Frame

이 세 가지가 생성됐으면 다음 단계로 이동한다.

---

## STEP 2 — `02_foundation_typography.md`

### 목적
대표 시안의 텍스트 위계를 Typography System으로 정리한다.

### 선행조건
STEP 1 완료.

### 에이전트 지시사항

> 현재 Pencil 파일과 이미 생성된 Color Foundation을 유지해줘.
>
> `02_foundation_typography.md`의 지시사항에 따라 Typography Foundation만 생성해줘.
>
> Font Family는 Custom Font의 `Pretendard Variable`로 확정되어 있어. 다른 폰트 선택지를 제시하지 말고 모든 한글 UI 및 Typography Token에 정확히 연결해줘.
>
> 대표 시안 3장의 실제 정보 위계를 참고해서 사람 이름, 핵심 질문, 섹션 제목, 취향 설명, 상품 정보, CTA 등에 적합한 Typography hierarchy를 구축해줘.
>
> Color Foundation은 수정하지 말고 새로운 UI 컴포넌트도 아직 생성하지 마.
>
> 완료 후 문서의 최종 검토사항을 기준으로 Typography Foundation만 검토하고 수정해줘.

---

## STEP 3 — `03_foundation_iconography.md`

### 목적
넌지시에서 실제 사용할 아이콘을 공통 자산으로 만든다.

### 선행조건
STEP 1~2 완료.

### 에이전트 지시사항

> 기존 Color / Typography Foundation과 대표 시안을 유지해줘.
>
> `03_foundation_iconography.md`를 기준으로 넌지시에 필요한 Iconography Foundation만 생성해줘.
>
> Lucide 아이콘을 사용하고 문서에 정의된 Navigation / People & Taste / Gift & Commerce / Schedule & Status / Utility 아이콘을 지정된 사이즈로 구성해줘.
>
> 현재 단계에서는 Icon Button이나 다른 UI 컴포넌트를 만들지 마.
>
> 완료 후 누락된 아이콘과 사이즈가 없는지 검토해줘.

---

## STEP 4 — `04_foundation_icon_button.md`

### 목적
Iconography를 실제 인터랙션 컴포넌트로 연결한다.

### 선행조건
STEP 3 완료 필수.

### 에이전트 지시사항

> 기존 Foundation을 변경하지 말고 `04_foundation_icon_button.md`를 실행해줘.
>
> 반드시 앞 단계에서 만든 Iconography 컴포넌트를 사용해서 넌지시 Icon Button을 생성해줘.
>
> Ghost / Soft / Accent 타입과 상태를 문서대로 구성하되 Accent는 제한적으로 사용할 수 있는 스타일로 만들어줘.
>
> 현재 단계에서는 일반 Button이나 Form Component는 만들지 마.
>
> 완료 후 터치 영역, 아이콘 크기, Semantic Color 사용 여부를 검토해줘.

---

# Component 구축

## STEP 5 — `05_component_action.md`

### 목적
서비스의 핵심 행동 체계를 만든다.

### 에이전트 지시사항

> 지금까지 생성한 Color / Typography / Iconography / Icon Button Foundation을 그대로 사용해줘.
>
> `05_component_action.md`에 정의된 Action Component만 생성해줘.
>
> Primary / Secondary / Tertiary / Destructive의 역할을 명확하게 구분하고 넌지시의 대표 CTA 문구를 활용해서 실제 사용 모습을 확인할 수 있게 해줘.
>
> Primary에 적용되는 Light Neo-Brutalism Accent는 서비스 전체보다 버튼 스타일이 먼저 보이지 않을 정도로 절제해줘.
>
> 특히 선물 승인 화면에서 Secondary Action을 destructive처럼 표현하지 마.
>
> 다른 Component는 아직 만들지 마.

---

## STEP 6 — `06_component_form.md`

### 목적
일반 Form과 넌지시의 취향 입력 UI를 구축한다.

### 에이전트 지시사항

> 기존 Foundation과 Action Component를 재사용해서 `06_component_form.md`를 실행해줘.
>
> 일반 Text Field / Textarea / Checkbox / Radio / Switch / Select와 함께 넌지시에서 중요한 Taste Chip을 생성해줘.
>
> 특히 취향 입력은 관리 시스템의 Form처럼 보이지 않게 해줘.
>
> Taste Chip은 커피, 향수, 러닝 등의 실제 예시를 사용하고, 이미 있어요 / 필요 없어요 같은 상태도 문서의 역할에 맞게 표현해줘.
>
> pastel/tint는 Taste Chip 등 의미가 있는 영역에서만 제한적으로 사용해줘.
>
> 기존 Button을 새로 만들지 말고 이미 생성한 Action Component를 재사용해줘.

---

## STEP 7 — `07_component_navigation.md`

### 목적
서비스 전체의 이동 구조를 통일한다.

### 에이전트 지시사항

> `07_component_navigation.md`에 따라 Navigation Component만 생성해줘.
>
> 기존 Iconography와 Icon Button을 반드시 재사용해줘.
>
> Bottom Navigation은 홈 / 친구 / 선물 / 마이 4개 탭을 기준으로 구성해줘.
>
> 대표 시안과 동일한 모바일 서비스라는 인상이 유지되도록 해줘.
>
> Navigation 자체에는 Neo-Brutalism Accent를 강하게 적용하지 마.
>
> 기존 Foundation이나 다른 Component를 수정하지 마.

---

## STEP 8 — `08_component_feedback.md`

### 목적
Loading / Success / Error 등의 시스템 피드백을 통일한다.

### 에이전트 지시사항

> 기존 Foundation과 Component를 유지하면서 `08_component_feedback.md`에 정의된 Spinner / Skeleton / Toast만 생성해줘.
>
> Toast 문구는 넌지시의 관계 중심 UX에 맞춰 중립적이고 명확하게 작성해줘.
>
> 사용자가 다른 선물을 선택하는 행동을 Error 상태처럼 표현하지 마.
>
> Skeleton은 친구 프로필, 상품 이미지, 취향 설명 등 실제 넌지시 화면에서의 사용 예가 확인되도록 구성해줘.

---

## STEP 9 — `09_component_misc.md`

### 목적
넌지시의 핵심 콘텐츠 표현 Component를 완성한다.

### 중요도
Component 단계에서 가장 중요하다.

### 에이전트 지시사항

> 지금까지 만든 모든 Foundation과 Component를 먼저 확인한 뒤 `09_component_misc.md`를 실행해줘.
>
> 특히 Card는 하나의 범용 Card로 끝내지 말고 문서에 정의된 역할별 variation을 만들어줘.
>
> Profile Card / Taste Card / Wish Card / Product Card / Gift Status Card / Funding Card가 같은 디자인 시스템에 속하면서도 역할을 구분할 수 있어야 해.
>
> Card 전체에 강한 border나 offset shadow를 적용하지 마.
>
> Badge와 강조 Card 등 필요한 일부 요소에서만 Light Neo-Brutalism Accent를 사용해줘.
>
> Empty State, Modal, Bottom Sheet, Menu 역시 넌지시의 디자인 언어를 유지해줘.

---

# Foundation 마무리

## STEP 10 — `10_foundation_spacing.md`

### 왜 Spacing을 마지막에 만드는가?

Spacing은 임의로 먼저 결정하기보다 실제 대표 시안과 완성된 Component에서 반복되는 간격을 확인한 뒤 토큰화하는 것이 안정적이다.

### 에이전트 지시사항

> 현재까지 완성된 대표 시안 3장과 모든 Foundation / Component를 확인해줘.
>
> `10_foundation_spacing.md`에 따라 실제 반복되고 있는 Margin / Padding / Gap을 분석해서 Spacing Foundation을 생성해줘.
>
> 단순히 가능한 spacing 값을 많이 만드는 것이 아니라 실제 넌지시 UI에서 필요한 최소한의 scale을 구성해줘.
>
> 같은 역할의 간격은 같은 token을 사용하도록 정리해줘.
>
> 아직 대표 시안 전체 리팩토링은 하지 마. Spacing Token 생성과 정리까지만 진행해줘.

---

# 최종 단계

## STEP 11 — `11_final_refactoring.md`

### 목적
시안으로 시작했던 3개 화면을 실제 디자인 시스템 기반 화면으로 변환한다.

### 선행조건
STEP 1~10 전부 완료.

### 에이전트 지시사항

> 지금까지 생성한 모든 Foundation과 UI Component를 확인해줘.
>
> 이제 `11_final_refactoring.md`를 기준으로 대표 시안 3장을 최종 리팩토링해줘.
>
> 최종 기준은 V2 / Rose + Soft Apricot(`#FBE2C1`) / Pretendard Variable이야. 새로 디자인하지 말고 확정 디자인을 Token과 Component 기준으로 리팩터링해줘.
>
> 대상은 다음 세 화면이야.
>
> 1. 친구 상세 / 맞춤 취향 프로필
> 2. 친구 기준 선물 추천·탐색
> 3. 선물 승인 요청
>
> 기존 시안의 UX 구조와 디자인 의도는 유지하면서, 디자인 시스템에 존재하는 UI는 모두 생성된 Component로 교체해줘.
>
> Color / Typography / Icon / Spacing은 각각 생성된 Foundation Token을 사용해줘.
>
> 디자인 시스템에 없는 타입은 억지로 기존 Component에 맞추지 말고 유지해줘.
>
> 리팩토링 완료 후 세 화면을 나란히 검토해서 하나의 서비스처럼 보이는지 확인해줘.
>
> 마지막으로 `11_final_refactoring.md`의 완료 기준과 금지사항을 전부 점검하고 필요한 수정까지 완료해줘.

---

# 전체 작업 흐름

```text
대표 시안 3장 제작
        ↓
팀 디자인 방향 확인
        ↓
01 Color
        ↓
02 Typography
        ↓
03 Iconography
        ↓
04 Icon Button
        ↓
05 Action
        ↓
06 Form
        ↓
07 Navigation
        ↓
08 Feedback
        ↓
09 Card / Badge / Overlay
        ↓
10 Spacing
        ↓
11 Final Refactoring
        ↓
대표 시안 3장 최종 검토
```

# 운영 원칙

각 단계가 끝날 때마다 에이전트에게 다음 단계까지 한 번에 진행시키지 않는다.

하나의 MD 파일을 실행 → 결과 확인 → 이상이 없으면 다음 MD 파일 실행 순서로 진행한다.

특히 다음 네 지점에서는 직접 화면을 확인하는 것을 권장한다.

1. `01 Color` 완료 후 — 브랜드 컬러와 전체 분위기
2. `05 Action` 완료 후 — Primary CTA Accent 강도
3. `09 Misc` 완료 후 — Card가 넌지시답게 만들어졌는지
4. `11 Refactoring` 완료 후 — 세 화면의 최종 일관성

이 네 단계에서 방향이 틀어지면 이후 작업 전체에 영향을 주므로 다음 단계로 넘어가기 전에 수정한다.


---

# STEP 12 — `12_full_screen_design.md`

## 목적
STEP 01~11에서 확정한 Design System을 사용해 PRD의 MVP 전체 기능 화면을 구축한다.

## 선행조건
STEP 01~11 완료 및 대표 시안 3장 최종 리팩터링 완료.

## 에이전트 지시사항

> 현재 Pencil 파일의 Foundation / Component / 대표 시안 3장을 먼저 확인해줘.
>
> `12_full_screen_design.md`를 기능 화면 설계의 기준으로 사용해줘.
>
> 기능 및 정책의 근거는 `neonjisi.prd-v2.md`를 우선하고, 디자인 기준은 현재 확정된 V2 Design System을 우선해줘.
>
> 확정 디자인은 Rose + Soft Apricot(`#FBE2C1`) / Pretendard Variable / Playful Minimalism이야.
>
> 기존 Component와 Token을 반드시 재사용하고, 새로운 화면마다 별도 스타일을 만들지 마.
>
> 문서의 Phase 순서대로 작업하며 한 번에 모든 Phase를 진행하지 마.
>
> 우선 Phase 1만 작업하고 종료해. 결과를 검토한 후 다음 Phase를 별도로 지시할 거야.

## 이후 실행
- Phase 1 완료 확인 → “STEP 12의 Phase 2만 진행해줘.”
- Phase 2 완료 확인 → “STEP 12의 Phase 3만 진행해줘.”
- Phase 3 완료 확인 → “STEP 12의 Phase 4만 진행해줘.”
- Phase 4 완료 확인 → “STEP 12의 Phase 5만 진행해줘.”