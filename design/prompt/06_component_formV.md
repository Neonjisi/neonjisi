# 넌지시 UI 컴포넌트 — Form & Taste Input

넌지시는 취향 입력이 긴 설정 Form처럼 보이지 않도록 한다. 일반 입력 컴포넌트는 유지하되, 취향 기록은 Chip/Card/짧은 문장 중심으로 설계한다.

## 공통조건
- 종류별 신규 프레임 1개
- 시맨틱 컬러 / Typography / Iconography / 기존 Action 컴포넌트 사용
- 타입(행) × 상태(열)
- 모바일 사용성을 우선한다.

## Text Field
상태: default / focused / disabled / error
사이즈: sm 32 / md 40 / lg 48
구조:
- 상단 label
- 입력/placeholder
- optional helper/error
- optional leading/trailing icon
사용 예:
- 친구 검색
- 선물 검색
- 간단 프로필 정보

## Textarea
상태: default / focused / disabled / error
- 기본 3줄
- 글자수 counter optional
사용 예:
- “나는 이런 걸 좋아해요”
- 취향에 대한 짧은 설명
긴 설문 입력처럼 사용하지 않는다.

## Checkbox / Radio / Switch
- 일반 상태 체계 유지
- Checkbox: 복수 선택이 명확한 설정에서만
- Radio: 단독 사용 금지, 하나만 선택하는 옵션 그룹
- Switch: 알림/공개 설정 등 즉시 On/Off 가능한 설정

## Select / Select Item
- default / focused / disabled / error
- 모바일 활성화 시 Bottom Sheet와 연결
- 날짜, 관계, 카테고리 등 제한된 선택지에 사용

## Taste Chip — 중요
타입:
- taste: 커피 / 향수 / 러닝
- possession: 이미 있어요
- avoid: 필요 없어요
- filter: 탐색 필터

상태:
- unselected
- selected
- disabled

사이즈:
- sm 24
- md 32

원칙:
- pill 또는 rounded rectangle
- pastel/tint 사용 허용
- 단, 한 화면에서 색상이 과도하게 늘어나지 않게 한다.
- 모든 취향마다 서로 다른 색을 강제하지 않는다.
- 선택 상태는 색상만이 아니라 border/check 등으로도 구분한다.

## File Uploader
MVP에서 실제 사용 화면이 없다면 우선순위를 낮춘다.
필요할 경우 프로필/취향 이미지 업로드에 사용한다.

## 최종 검토
- 취향 입력이 업무용 Form처럼 보이지 않는가?
- Chip/Card/짧은 문장 중심의 개인 취향 공간처럼 느껴지는가?
- 검색/설정 등 일반 Form과 취향 UI가 구분되는가?
