# 넌지시 UI 컴포넌트 — Feedback

## Spinner
- 24px
- Brand Primary
- 버튼 loading에서는 label을 유지하고 아이콘 영역에 spinner 표시

## Skeleton
타입:
- text
- rectangle
- circle

넌지시 예:
- circle: 친구 프로필
- rectangle: 위시 아이템/추천 상품 이미지
- text: 이름, 취향 설명, 상품 정보

색상:
- Neutral 계열
- 지나치게 강한 애니메이션/대비 금지

## Toast
타입:
- success
- error
- info
- warning

모바일:
- 화면 너비 - 좌우 margin

구조:
- 상태 아이콘 20px
- body-md 메시지
- optional close

문구 원칙:
- 관계 기능에서는 공격적/비난형 문구 금지
- 예: “선물이 거절되었습니다”보다 상태를 중립적으로 설명
- 시스템 오류와 사용자의 선택을 혼동하지 않는다.

예시:
- success: “취향이 저장됐어요.”
- info: “다른 선물을 고를 수 있어요.”
- error: “저장하지 못했어요. 다시 시도해주세요.”

## 검토
- Feedback UI가 브랜드 스타일보다 상태 전달을 우선하는가?
- error 색상을 관계상 부정적인 선택에 사용하지 않았는가?
