# PEN 화면 동기화 기준

기준 브랜치: `jisang/pen-screen-sync`  
앱 기준: 현재 `main`의 `app/**/page.tsx` 및 화면 컴포넌트  
대상 파일: `design/neonjisi.pen`

## 동기화 원칙

- 화면 배경과 Top Bar 배경은 앱의 `background-default`로 통일한다.
- 홈은 아이콘 로고와 타이포 로고를 함께 사용하고, 비로그인 랜딩·로그인은 큰 한글 로고를 사용한다.
- PEN의 기존 디자인 시스템 컴포넌트와 토큰을 우선 재사용한다.
- 동적 ID 라우트는 대표 데이터 상태 한 장과 사용자 판단이 달라지는 결과 상태를 각각 둔다.
- 실제 앱에서 추가된 화면은 `CURRENT · M{n}` 접두어로 별도 행에 배치한다.

## 라우트 대응표

| 실제 라우트 | PEN 화면 | 상태 |
|---|---|---|
| `/`, `/login`, `/signup/profile` | 랜딩, 로그인·가입, 기본 프로필 | 기존 화면 동기화 |
| `/onboarding`, `/taste`, `/taste/products` | 온보딩 4종, 내 취향, 원하는 상품 고르기 | 누락 화면 추가 |
| `/friends`, `/friends/[userId]`, `/friends/invite` | 친구 목록·상세·추가 | 친구 목록 최신 프레임 추가 및 기존 화면 동기화 |
| `/friends/invite/manage` | 초대 링크 관리 | 누락 화면 추가 |
| `/i/[token]` | 초대 미리보기·수락·만료 | 기존 상태 화면 사용 |
| `/events` | 일정 관리 | 누락 화면 추가 |
| `/notifications` | 알림 목록 | 누락 화면 추가 |
| `/products`, `/products/[id]`, `/products/for/[userId]` | 선물 검색·상품 상세·선물 추천 | 기존 화면 동기화 |
| `/products/[id]/receiver` | 받을 친구 선택 | 누락 화면 추가 |
| `/gifts/new`, `/gifts/new/consent`, `/gifts/new/done` | 요청 확인·결제 동의·전송 완료 | 누락 화면 추가 |
| `/gifts/[id]`, `/respond/*`, `/result` | 승인·재선택·배송·완료·실패·만료 | 기존 상태 화면 사용 |
| `/gifts/[id]/recover` | 결제 복구 | 누락 화면 추가 |
| `/fundings/new`, `/fundings/[id]`, `/contribute` | 개설 3단계·상세·참여 | 기존 화면 동기화 |
| `/fundings/[id]/result` | 성사·미달·차액·취소 | 취소 상태 추가 |
| `/my`, `/my/gifts`, `/my/fundings` | 설정·선물 내역·펀딩 내역 | 기존 화면 동기화 |
| `/settings` | 설정 (`KvkwN`) | 기존 PEN 화면을 앱에 연결 |
| `/payment-methods`, `/payment-methods/new` | 결제수단 관리·등록 | 기존 화면 동기화 |

## 이번 동기화에서 추가한 화면

1. 일정 관리
2. 초대 링크 관리
3. 알림 목록
4. 받을 친구 선택
5. 선물 전송 완료
6. 결제 복구
7. 원하는 상품 고르기
8. 펀딩 취소 결과
9. 친구 목록

`scripts/sync-pen-screens.mjs`는 위 공통 수정과 누락 화면 생성을 재현한다. 팀 검수 후에는 이 대응표에 결정된 변경사항을 먼저 기록한 다음 PEN에 반영한다.

### 알림 진입 동선

- 홈 헤더의 종 아이콘 및 미읽음 배지 → `/notifications?from=home` → 뒤로가기 `/`
- 마이 탭의 알림 메뉴 → `/notifications` → 뒤로가기 `/my`
- PEN 홈의 `TRtfN > CegZ5 > ajjmQ`가 실제 홈 알림 버튼의 시각 기준이다.

### 설정 진입 동선

- 마이 탭의 알림 설정 → `/settings` → 뒤로가기 `/my`
- PEN의 `KvkwN`이 실제 설정 화면의 시각 기준이다.
- 현재는 서비스 내 필수 알림만 제공하므로 세 종류를 항상 받음으로 표시한다. 푸시 알림 저장 정책은 별도 구현 대상이다.
