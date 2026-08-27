# 넌지시 UI 컴포넌트 — Action

다음 넌지시 디자인 시스템에 맞게 Action 컴포넌트를 렌더한다.

## 공통조건
- 컴포넌트 종류별 신규 프레임 1개
- 컬러는 시맨틱 토큰 사용
- 텍스트는 Typography 컴포넌트 사용
- 아이콘은 Iconography 컴포넌트 사용
- 타입(행) × 상태(열)로 정렬
- Soft Playful Minimalism을 기본으로 한다.
- Neo-Brutalism Accent는 Primary CTA/Button에만 제한적으로 사용한다.

## Button
타입:
- primary: “민지에게 선물 고르기”, “이 선물로 받을게요”
- secondary: “다른 선물이 더 좋아요”, “직접 찾아보기”
- tertiary/ghost: 취소, 건너뛰기 등 저우선 행동
- destructive: 삭제 등 실제 파괴적 행동에만 사용

상태:
- default
- pressed
- disabled
- loading

사이즈:
- sm 32
- md 40
- lg 48

구조:
- label
- 좌/우 아이콘 optional
- label-lg 중심
- 모바일 핵심 CTA는 lg 우선

스타일:
- radius는 부드럽게 유지
- primary에만 필요 시 outline + 작은 offset shadow 허용
- 승인 화면에서는 shadow/outline 강도를 낮춘다.
- destructive를 “선물 거절” 의미로 사용하지 않는다.

## Icon Button
- 기존 Icon Button 컴포넌트를 재사용하며 임의 수정하지 않는다.

## 생성 및 검토
- 각 타입 × 상태를 컴포넌트화
- 핵심부만 컴포넌트화
- Primary/Secondary 위계가 즉시 구분되는지 확인
- 버튼 스타일이 전체 화면보다 먼저 보일 정도로 과하지 않은지 확인
