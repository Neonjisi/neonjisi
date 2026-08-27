# 넌지시 UI 컴포넌트 — Navigation

## Top Navigation
높이: 56px
구조:
- 좌측 optional icon button
- 제목
- 우측 optional icon button
- heading-sm

원칙:
- 친구 상세에서는 친구/취향 콘텐츠가 주인공이 되도록 헤더를 과하게 강조하지 않는다.
- 상세 Flow에서는 뒤로가기와 현재 맥락을 명확히 한다.

## Bottom Navigation
모바일 4개 탭 고정:
1. 홈 — 일정 / 승인 / 진행 중 선물·펀딩
2. 친구 — 친구 / 취향 / 친구 기준 추천
3. 선물 — 검색 / 카테고리
4. 마이 — 내 취향 / 선물 내역 / 펀딩 내역 / 설정

구조:
- 높이 56~64px
- 4개 균등 분배
- 24px 아이콘
- label-md
- 선택 상태는 Brand Primary
- 미선택은 Neutral
- 선택 상태를 색상만으로 구분하지 않아도 좋으며 fill/weight 차이를 함께 사용할 수 있다.

## Tab Navigation
사용 후보:
- 친구 상세의 취향/선물 등 정보 구분이 실제로 필요할 경우
- 마이 내역
- 선물 내역 / 펀딩 내역

높이: 48px
- 2개 이상
- label-lg
- selected indicator 2px

## 검토
- 상품 탐색보다 사람/관계 맥락이 먼저 유지되는가?
- Bottom Navigation이 4개 탭을 넘지 않는가?
- Neo-Brutalism accent를 Navigation 전체에 적용하지 않았는가?
