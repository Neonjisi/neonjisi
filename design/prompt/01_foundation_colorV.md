# 넌지시 디자인 시스템 — 컬러 파운데이션

다음 조건에 맞게 넌지시(neonjisi) 서비스의 컬러 토큰과 컬러 팔레트를 생성한다.

## 디자인 방향
- Base: Soft Playful Minimalism
- Accent: Light Neo-Brutalism
- People-first / Taste / Gift / Warm / Playful / Clear / Personal / Soft / Bold Accent
- 일반 커머스보다 사람과 취향이 먼저 느껴져야 한다.
- 전체 화면이 유아적이거나 무지개처럼 보이지 않도록 색상 수와 채도를 제한한다.
- Neo-Brutalism은 브랜드 포인트와 핵심 행동에만 제한적으로 사용한다.


## 확정 컬러 기준 — 변경 금지
- 최종 방향: V2 / Rose + Soft Apricot
- Soft Apricot은 반드시 `#FBE2C1`을 사용한다.
- Soft Apricot을 Peach/Coral 계열로 임의 보정하지 않는다.
- 현재 대표 시안에 확정된 Rose / Blush Cream / White / Cocoa Ink 및 상태 컬러는 기존 값을 유지한다.
- Green/Cream 등 이전 비교 팔레트를 다시 생성하지 않는다.

## 1. 컬러 추출 및 정의
대상:
- 현재 제작된 넌지시 대표 시안 3개
- 친구 상세 / 맞춤 취향 프로필
- 친구 기준 선물 추천·탐색
- 선물 승인 요청

종류:
- Brand Primary: 넌지시의 대표 브랜드 컬러 1개
- Neutral: Warm White / Off-white 기반의 뉴트럴
- Secondary Accent: 최대 2~3계열
- Success
- Warning
- Info
- Error

원칙:
- Background는 White 또는 Warm Off-white 계열을 우선한다.
- Surface는 White 중심으로 사용한다.
- 취향 Tag, D-Day Badge, 상태 구분에는 낮은 채도의 pastel/tint를 허용한다.
- Primary CTA에는 Brand Primary 또는 높은 대비의 Accent를 사용한다.
- 승인/대안 제시 화면은 과도한 대비를 피한다.
- Error/Warning/Success 색상은 장식이 아니라 의미 전달에만 사용한다.

## 2. 프리미티브 토큰 생성
variables 메뉴에 다음 규칙으로 생성한다.
- color-brand-50, 100, ..., 900, 950
- color-neutral-50, 100, ..., 900, 950
- secondary accent도 동일한 단계 체계를 사용
- success / warning / info / error도 필요 단계 생성

주의:
- 주요 텍스트/배경 조합에서 WCAG 대비를 고려한다.
- neutral-50 계열 배경에서도 3:1, 4.5:1 대비를 만족하는 텍스트/아이콘 색상을 선택할 수 있도록 한다.

## 3. 시맨틱 토큰 생성
프리미티브 토큰을 참조하여 생성한다. Hex 직접 입력 금지.

필수 예:
- color-text-primary
- color-text-secondary
- color-text-tertiary
- color-text-brand
- color-text-on-brand
- color-text-error
- color-background-default
- color-background-surface
- color-background-brand
- color-background-brand-subtle
- color-background-taste
- color-background-disabled
- color-border-default
- color-border-strong
- color-border-brand
- color-border-error
- color-action-primary
- color-action-primary-pressed
- color-action-disabled

## 4. 팔레트 렌더
- 신규 프레임에 렌더한다.
- 컬러 계열별 1행을 사용한다.
- 각 프리미티브 토큰을 정사각형 swatch로 표시한다.
- 토큰명과 용도를 함께 확인할 수 있도록 한다.

## 5. 최종 검토
- 브랜드 컬러가 서비스 전체를 지배하지 않는가?
- pastel/tint가 취향·상태 표현에 제한적으로 사용되는가?
- Warm / Personal한 인상이 유지되는가?
- Primary CTA가 충분히 명확한가?
- 승인 화면에서 공격적인 대비가 발생하지 않는가?
- 모든 시맨틱 컬러가 프리미티브 토큰을 참조하는가?
