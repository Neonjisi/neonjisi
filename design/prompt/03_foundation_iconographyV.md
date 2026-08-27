# 넌지시 디자인 시스템 — 아이코노그래피

Lucide 아이콘을 기반으로 넌지시에 실제 필요한 아이콘 세트를 구성한다.

## 1. 아이콘 렌더
- 신규 프레임 생성
- 각 아이콘 16 / 20 / 24 / 32px 구성
- 한 행에 한 아이콘 종류와 사이즈 variation을 표시
- 기본은 Outline 아이콘을 사용한다.

## 2. 기본 아이콘
Navigation:
- arrow-left, arrow-right
- chevron-left, chevron-right, chevron-down
- home, users, gift, user, settings

People / Taste:
- heart, star, bookmark
- coffee, sparkles, palette
- plus, edit, check, x

Gift / Commerce:
- search, filter, shopping-bag, gift
- wallet-cards 또는 credit-card
- share, link

Schedule / Status:
- calendar, clock, bell
- info, circle-alert, triangle-alert, circle-check

Utility:
- more-horizontal, more-vertical
- menu, copy, refresh, log-out
- image, camera, trash-2

## 3. 스타일 원칙
- 장식용 아이콘 남용 금지
- 아이콘은 의미 전달과 행동 보조가 우선
- 취향 Tag에서 아이콘은 선택적으로만 사용
- 핵심 CTA에 아이콘을 넣더라도 레이블을 대체하지 않는다.
- Neo-Brutalism accent는 아이콘 자체가 아니라 배경/outline 등 컨테이너에서 제한적으로 표현한다.

## 4. 컴포넌트 생성
- 각 아이콘 × 4개 사이즈를 각각 컴포넌트화
- 아이콘 자체만 컴포넌트로 만들고 외부 영역은 제외

## 5. 검토
- Bottom Navigation의 홈/친구/선물/마이 아이콘이 존재하는가?
- 친구·취향·선물·일정의 의미가 구분되는가?
- 불필요한 범용 아이콘이 과도하게 포함되지 않았는가?
