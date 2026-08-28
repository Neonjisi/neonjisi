# 넌지시 UI 컴포넌트 — Card / Badge / Overlay / Empty

## Card — 핵심 컴포넌트
넌지시는 Card 중심 서비스이므로 단일 범용 Card만 만들지 말고 역할별 variation을 정의한다.

타입:
- profile-card: 친구/사람
- taste-card: 취향 설명/관심사
- wish-card: 갖고 싶은 것
- product-card: 추천/검색 상품
- gift-status-card: 진행 중 선물/승인
- funding-card: 공동 선물 진행 상황

공통:
- auto width/height
- radius 14~20px
- 충분한 padding
- 기본적으로 강한 검정 border 금지
- image optional
- 카드 전체가 과도하게 컬러풀하지 않도록 한다.

Card에는 Neo-Brutalism hard offset shadow를 적용하지 않는다. 강조는 semantic color, border, surface 대비로 처리한다.

## Badge
타입:
- neutral
- brand
- success
- info
- warning
- error
- d-day
- new

사용 예:
- D-22
- 승인 대기
- 새 취향
- 펀딩 진행 상태

상태 색은 의미에 맞게 사용하며 단순 장식용으로 남발하지 않는다.

## Empty State
구조:
- optional visual
- heading-sm title
- optional body-md description
- primary 1개 + optional secondary 1개

넌지시다운 예:
- “아직 등록한 취향이 없어요”
- “친구에게 내 취향을 알려주세요”
- “다가오는 선물 일정이 없어요”

친근하되 유아적인 일러스트는 피한다.

## Modal
- 중요한 확인/설정에 제한
- 제목 + close
- body
- primary / secondary
- scrim
- 선물 승인 자체를 불필요하게 Modal로 만들지 않는다.

## Bottom Sheet
모바일 선택/보조 작업에 우선:
- Select option
- 필터
- 메뉴
- 대안 선택 보조

## Menu / Menu Item
타입:
- default
- destructive
상태:
- default
- disabled

삭제만 destructive로 표현하고, “다른 선물 선택” 같은 관계 행동에는 destructive 스타일을 사용하지 않는다.

## 검토
- Profile/Taste/Product Card가 시각적으로 구분되면서도 같은 시스템으로 보이는가?
- Card가 상품 Grid 중심의 쇼핑몰 인상을 만들지 않는가?
- Badge/Accent가 핵심 정보에만 쓰이는가?
