# 넌지시 디자인 시스템 — Spacing Foundation

현재 제작된 대표 시안과 UI 컴포넌트를 기준으로 spacing token을 생성한다.

## 기본 원칙
- 모바일 우선
- 밝고 여유 있는 Playful Minimalism의 공간감을 유지한다.
- 정보 그룹 간 간격을 충분히 확보한다.
- Card 내부는 조밀하게 만들지 않는다.
- 임의 px 값을 반복해서 사용하지 않고 spacing token을 참조한다.

## Primitive Spacing
4px 기반 scale을 우선한다.
- space-0: 0
- space-1: 4
- space-2: 8
- space-3: 12
- space-4: 16
- space-5: 20
- space-6: 24
- space-8: 32
- space-10: 40
- space-12: 48

## 권장 적용
- 모바일 좌우 page margin: 20 또는 24
- section 간: 24~32
- card padding: 16~20
- card 간: 12~16
- label ↔ field: 8
- chip 간: 8
- 프로필 주요 정보 group: 12~16
- CTA 상단 여백: 24 이상

현재 시안에서 실제 사용되는 값에 맞춰 최소한의 토큰만 유지하고 불필요한 단계는 만들지 않는다.

## 검토
- 동일 역할의 gap이 같은 token을 사용하는가?
- 화면별 좌우 margin이 통일되는가?
- 사람/취향 섹션과 상품 섹션의 grouping이 공간으로도 구분되는가?
- 지나치게 빽빽하거나 과도하게 넓은 구간이 없는가?
