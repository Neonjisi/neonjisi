# 넌지시 디자인 시스템 — 타이포그래피 파운데이션

넌지시 서비스의 모바일 UI를 기준으로 타이포그래피 토큰과 컴포넌트를 생성한다.

## 방향
- 친근하지만 유아적이지 않게
- 본문 가독성 최우선
- 사람 이름, 핵심 질문, 섹션 제목은 명확한 위계를 갖는다.
- Brutalism 계열의 극단적인 Display Typography는 사용하지 않는다.
- 한 화면에서 크기와 굵기 단계가 명확해야 한다.


## 확정 폰트 기준 — 변경 금지
- Font Family는 Pencil Custom Font에 등록된 `Pretendard Variable`로 확정한다.
- 모든 한글 UI 텍스트와 Typography Token에 `Pretendard Variable`을 적용한다.
- 다른 시스템 폰트/fallback 폰트로 임의 변경하지 않는다.
- 기존 size / weight / line-height / hierarchy는 유지한다.

## 1. 프리미티브 토큰
font-family:
- Pretendard Variable

font-size:
- 40 / 36 / 32 / 28 / 24 / 20 / 16 / 14 / 12

font-weight:
- bold 700
- semibold 600
- regular 400

line-height:
- tight 1.2
- normal 1.4
- relaxed 1.6 (취향 서술 등 긴 문장에 필요할 경우)

letter-spacing:
- 기본 -2%
- 작은 label은 가독성을 우선하여 필요 시 완화 가능

## 2. Semantic Typography
- display-lg: 36 / bold / tight
- display-md: 32 / bold / tight
- display-sm: 28 / bold / tight
- heading-lg: 24 / bold / tight
- heading-md: 20 / bold / tight
- heading-sm: 16 / semibold / tight
- body-lg: 16 / regular / normal
- body-md: 14 / regular / normal
- label-lg: 14 / semibold / normal
- label-md: 12 / regular / normal

## 3. 넌지시 사용 원칙
- 친구 이름/핵심 질문: heading-lg 또는 heading-md
- D-Day 및 상태: label 계열
- 취향 Tag: label-lg
- 상품명: body-lg 또는 heading-sm
- 가격: body-lg + semibold
- 취향 설명: body-md 또는 body-lg
- Primary CTA: label-lg 또는 body-lg semibold
- 승인 질문은 상품명보다 명확한 위계를 갖되 과도하게 크지 않게 한다.

## 4. 렌더 및 컴포넌트 생성
- 신규 Typography 프레임 생성
- 각 스타일별 1행
- 실제 넌지시 문구를 샘플로 사용한다.
  - “민지는 이런 걸 좋아해요”
  - “민지에게 줄 선물을 찾고 있어요”
  - “이 선물을 받을까요?”
  - “이 선물로 받을게요”
- 텍스트 자체를 컴포넌트로 만들고 외부 프레임은 컴포넌트화하지 않는다.

## 5. 검토
- 모바일에서 정보 위계가 즉시 구분되는가?
- 취향 설명이 데이터 필드처럼 딱딱해 보이지 않는가?
- 상품보다 사람/질문이 먼저 보이는가?
- 극단적인 Display Typography가 사용되지 않았는가?
