# 넌지시 대표 시안 3장 — 디자인 시스템 최종 리팩토링

다음 대표 모바일 시안 3장을 현재 생성한 Foundation 및 UI Component로 리팩토링한다.

대상:
1. 친구 상세 / 맞춤 취향 프로필
2. 친구 기준 선물 추천·탐색
3. 선물 승인 요청

## 1. 컴포넌트 치환
- 시안에 존재하는 UI를 생성 완료된 컴포넌트로 최대한 대체한다.
- Button / Icon Button / Navigation / Chip / Card / Badge / Feedback 등 동일 타입이 존재하면 반드시 컴포넌트를 사용한다.
- 타입 자체가 디자인 시스템에 없으면 기존 디자인을 유지한다.
- 타입은 존재하지만 시안과 UI가 다르면 임의의 별도 디자인을 유지하지 말고 디자인 시스템 컴포넌트로 대체한다.

## 2. Foundation 적용
- 컬러: 시맨틱 컬러 토큰
- Typography: Typography 컴포넌트/토큰
- Icon: Iconography 컴포넌트
- Gap / Padding / Margin: Spacing token
- 반복 radius 값도 가능한 한 시스템 기준을 일관되게 사용한다.

## 3. 서비스 정체성 검토
세 페이지를 나란히 놓고 다음을 확인한다.
- 같은 서비스로 보이는가?
- Soft Playful Minimalism이 기본 구조를 지배하는가?
- Neo-Brutalism Accent는 Primary CTA/Button에만 제한되어 있는가?
- 상품보다 사람과 취향이 먼저 느껴지는가?
- 일반 쇼핑몰처럼 보이지 않는가?
- 승인 화면이 공격적인 “승인 vs 거절” 구조처럼 보이지 않는가?

## 4. 금지
- 모든 Card에 굵은 검정 border 적용
- 모든 CTA에 offset shadow 적용
- 지나치게 많은 pastel color
- gradient/glass 효과 중심 스타일
- 임의 hex/spacing 사용
- 화면마다 서로 다른 디자인 언어 적용

## 5. 완료 기준
3개 화면을 최종적으로 함께 검토했을 때 넌지시의 디자인 방향인
“사람과 취향이 중심이 되는 따뜻하고 명확한 Playful Minimal UI에, 핵심 행동에서만 Neo-Brutalism의 개성을 가볍게 더한다”
가 일관되게 드러나야 한다.


## 확정안 잠금
- 최종 기준: `V2 / Rose + Soft Apricot`
- Soft Apricot: `#FBE2C1`
- Font Family: `Pretendard Variable`
- 확정된 UX 구조와 레이아웃을 재설계하지 않는다.
- 기존 Token / Component를 Single Source of Truth로 사용한다.
- 임의 HEX / Font / spacing / component style 하드코딩 금지.
- Neo-Brutalism Accent는 Primary CTA/Button 범위 밖으로 확장하지 않는다.
