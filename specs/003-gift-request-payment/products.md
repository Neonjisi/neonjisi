# Product 시드 콘텐츠 — 마일스톤 3

**작성일**: 2026-09-02 · **담당**: S(기획) · **태스크**: T002 (T008이 소비)
**근거**: [tasks.md](./tasks.md) T002 · [research.md](./research.md) R9 · [spec.md](./spec.md) FR-002·FR-005

> 시연용 카탈로그다. 실제 판매·재고와는 무관하다. 상품명은 시연의 현실감을 위해 실제
> 제품명을 쓴다 — `spec.md`와 기존 테스트가 이미 같은 방식이다(예: 상세 `스타벅스 텀블러`).

---

## 0. 이 문서가 하는 일

카탈로그에 넣을 상품 **52건**과, 그 상품들이 **시연 시나리오를 실제로 성립시키는지**를 담는다.

**J는 3장 배열을 그대로 옮기면 된다.** 1~2장은 왜 이 구성인지에 대한 근거다.

> 개수가 30~50건 범위를 2건 넘는다. 텀블러 가격 사다리(④ 조건)를 6단계로 깔아야 대안
> 재선택이 성립해서다. 줄여야 하면 텀블러 `18,000`과 향수 `38,000`을 먼저 뺀다.

---

## 1. 시나리오 커버 — 이 문서의 존재 이유

R9의 매칭 판정은 **카테고리 단위**다(`getMatchBanner`). 상품명이나 상세 문자열은 판정에
쓰이지 않는다. 따라서 **어느 카테고리에 상품이 몇 건 있느냐**가 시연의 성패를 정한다.

### ① E2E 계정 1의 취향 세팅 — T022 작성자에게

이 세팅이 없으면 아래 상품이 아무리 많아도 배너가 하나도 안 뜬다.

| 종류 | 카테고리 | 무엇을 성립시키나 |
|---|---|---|
| `원하는 것` | **텀블러** | ① 긍정 배너 |
| `이미 있어요` | **수건** | ② 주의 배너 |
| `관심 없어요` | **향수** | ③ 3중 차단 (목록·상세·생성) |

> **`향수`를 차단 대상으로 고른 이유**: 선물로 흔하면서 호불호가 가장 갈리는 품목이라
> "관심 없어요"가 자연스럽다. `수건`을 `이미 있어요`로 둔 것도 같은 이유다 — 실제로 가장
> 흔하게 중복 수령되는 품목이다.

### ② 네 조건이 성립하는지

| # | 조건 | 성립시키는 상품 | 결과 |
|---|---|---|---|
| ① | `want` 카테고리 상품 | 텀블러 6건 | 긍정 배너 |
| ② | `have` 카테고리 상품 | 수건 5건 | 주의 배너 |
| ③ | `unwanted` 카테고리 상품 | 향수 5건 | 목록 제외 · 상세 비활성 · 생성 거부 |
| ④ | 요청가보다 싼 대안 다수 | 텀블러 사다리 6단계 | 재선택 성립 |

**④ 검증** — 32,000원 텀블러로 요청하면 대안 후보가 **24,000 · 18,000 · 12,900** 세 건이다.
요청 금액 이하로 재선택하는 화면이 목록으로 성립하려면 같은 카테고리 안에 여러 개가 있어야 한다.

### ③ M4 펀딩 — 고가 6건

M4에는 **시드 태스크가 없다.** `tasks.md`가 "착수 전제: M3 완료 — **상품**·빌링키…"라고만
적고 있으므로 **펀딩 시연도 이 표로 돌아간다.**

| 상품 | 가격 | 펀딩 시연 |
|---|---|---|
| 갤럭시워치8 클래식 46mm | 569,000 | 3인이 나눠도 1인 19만 — **차액 결제**까지 보여주기 좋다 |
| 갤럭시워치8 40mm | 419,000 | 목표 42만 / 달성선 30만 → 성사·차액 시나리오 |
| 애플워치 SE 3세대 40mm | 409,000 | |
| 에어팟 프로 3 | 369,000 | |
| 갤럭시 버즈4 프로 | 359,000 | |
| 소니 WF-1000XM5 | 319,000 | 3인 균등 시 1인 11만 — 미달 시나리오용 |

> 향수 `조 말론`(235,000)도 고가지만 **계정 1에게는 차단되는 카테고리**다. 펀딩 시연에 쓰지 않는다.

---

## 2. 검증 상태

상품명은 웹 검색으로 확인했다. 확인 수준이 셋으로 갈린다.

| 표시 | 뜻 | 건수 |
|---|---|---|
| ✅ | **가격까지 확인.** 출시가·판매가가 공개된 제품 | 7 |
| ◑ | **제품명 확인.** 실제 판매되는 제품·라인이나 가격은 미확인 | 15 |
| ○ | **브랜드와 품목만 확인.** 그 브랜드가 그 품목을 판다는 것까지. 모델명은 일반 표기 | 30 |

**○ 등급에 없는 모델명을 지어내지 않았다.** `써모스 스테인리스 텀블러 470ml`처럼
브랜드 + 품목 + 용량까지만 쓴다. 실재하지 않는 상품 코드를 카탈로그에 넣는 것보다 낫다.

> 일상 선물용품(텀블러·수건·핸드크림 등)은 판매가가 판매처마다 달라 검색으로 확정되지
> 않는다. 반면 **시연에 실제로 등장하는 고가 6건과 스타벅스 텀블러는 전부 ✅**다.

---

## 3. 확정 목록 — 52건

카테고리는 전부 [`categories.md`](../001-taste-profile/categories.md)의 확정 40개 안에 있다
(검증 완료). `Category.name`으로 조회해 `categoryId`를 채운다.

| # | category | name | price | 검증 | imageUrl |
|---|---|---|---|---|---|
| 1 | 스마트워치 | 갤럭시워치8 클래식 46mm | 569,000 | ✅ | `/products/01-2960027b.png` |
| 2 | 스마트워치 | 갤럭시워치8 40mm 블루투스 | 419,000 | ✅ | `/products/02-8617a54f.png` |
| 3 | 스마트워치 | 애플워치 SE 3세대 40mm | 409,000 | ✅ | `/products/03-350870ed.png` |
| 4 | 무선이어폰 | 에어팟 프로 3 | 369,000 | ✅ | `/products/04-93490d6b.png` |
| 5 | 무선이어폰 | 갤럭시 버즈4 프로 | 359,000 | ✅ | `/products/05-38680890.png` |
| 6 | 무선이어폰 | 소니 WF-1000XM5 | 319,000 | ✅ | `/products/06-3560c0d8.png` |
| 7 | 텀블러 | 스타벅스 스탠리 하우스 보온병 500ml | 47,800 | ✅ | `/products/07-3140a03f.png` |
| 8 | 텀블러 | 스탠리 GO 진공 텀블러 473ml | 38,000 | ◑ | `/products/08-0f2f6267.png` |
| 9 | 텀블러 | 써모스 스테인리스 텀블러 470ml | 32,000 | ○ | `/products/09-595cd2bf.png` |
| 10 | 텀블러 | 모슈 이중구조 텀블러 450ml | 24,000 | ○ | `/products/10-4edfae19.png` |
| 11 | 텀블러 | 오덴세 스테인리스 텀블러 400ml | 18,000 | ○ | `/products/11-6f8a6a47.png` |
| 12 | 텀블러 | 락앤락 스테인리스 텀블러 470ml | 12,900 | ○ | `/products/12-2f61c44f.png` |
| 13 | 향수 | 조 말론 런던 우드 세이지 앤 씨 솔트 코롱 100ml | 235,000 | ◑ | `/products/13-008eb5fe.png` |
| 14 | 향수 | 딥디크 플레르 드 뽀 오드퍼퓸 75ml | 168,000 | ◑ | `/products/14-5bc110dd.png` |
| 15 | 향수 | 논픽션 오드퍼퓸 50ml | 52,000 | ◑ | `/products/15-15b28116.png` |
| 16 | 향수 | 탬버린즈 퍼퓸 30ml | 46,000 | ◑ | `/products/16-96f8fa48.png` |
| 17 | 향수 | 포맨트 시그니처 퍼퓸 50ml | 38,000 | ○ | `/products/17-9924fea6.png` |
| 18 | 수건 | 송월타올 호텔수건 10매 세트 | 55,000 | ○ | `/products/18-3af0a045.png` |
| 19 | 수건 | 무인양품 오가닉코튼 타월 4매 | 38,000 | ○ | `/products/19-454be6dd.png` |
| 20 | 수건 | 코튼브릿지 호텔타월 5매 세트 | 26,000 | ○ | `/products/20-9b12efd8.png` |
| 21 | 수건 | 송월타올 프리미엄 타월 3매 선물세트 | 18,000 | ○ | `/products/21-5942064c.png` |
| 22 | 수건 | 코마사 데일리 타월 5매 | 12,000 | ○ | `/products/22-b316cdef.png` |
| 23 | 핸드크림 | 록시땅 시어버터 핸드크림 세트 | 42,000 | ◑ | `/products/23-e38ecd8d.png` |
| 24 | 핸드크림 | 이솝 레저렉션 아로마틱 핸드밤 75ml | 28,000 | ◑ | `/products/24-5056c4d9.png` |
| 25 | 립밤·립스틱 | 키엘 립케어 세트 | 32,000 | ○ | `/products/25-54b3e37c.png` |
| 26 | 립밤·립스틱 | 라네즈 립 슬리핑 마스크 세트 | 22,000 | ◑ | `/products/26-d962b2a5.png` |
| 27 | 머그컵·유리컵 | 이딸라 티마 머그 2P | 46,000 | ◑ | `/products/27-9d4803d6.png` |
| 28 | 머그컵·유리컵 | 오덴세 머그 2P 세트 | 28,000 | ○ | `/products/28-c2100e03.png` |
| 29 | 디퓨저·캔들 | 조 말론 런던 홈 캔들 200g | 78,000 | ◑ | `/products/29-0ea775c0.png` |
| 30 | 디퓨저·캔들 | 코트카페 디퓨저 200ml 세트 | 39,000 | ○ | `/products/30-e1f00652.png` |
| 31 | 침구 | 이브자리 차렵이불 SS | 119,000 | ○ | `/products/31-16175a84.png` |
| 32 | 침구 | 소프라움 구스 베개 2P | 68,000 | ○ | `/products/32-81986505.png` |
| 33 | 그릇·식기 | 포트메리온 보타닉가든 2인 세트 | 89,000 | ◑ | `/products/33-acd78dde.png` |
| 34 | 그릇·식기 | 광주요 반상기 4P | 64,000 | ○ | `/products/34-0624cd35.png` |
| 35 | 양말 | 마인드브릿지 수면양말 선물세트 5족 | 29,000 | ○ | `/products/35-dfddc2c7.png` |
| 36 | 양말 | 무인양품 발가락양말 5족 세트 | 19,000 | ○ | `/products/36-a2f53024.png` |
| 37 | 지갑 | 닥스 소가죽 카드지갑 | 78,000 | ○ | `/products/37-76358e93.png` |
| 38 | 지갑 | 루이까또즈 반지갑 | 59,000 | ○ | `/products/38-63683ed4.png` |
| 39 | 주얼리 | 디디에두보 실버 목걸이 | 118,000 | ○ | `/products/39-df0d029b.png` |
| 40 | 주얼리 | 제이에스티나 데일리 귀걸이 | 68,000 | ○ | `/products/40-315d5994.png` |
| 41 | 가방 | 마르헨제이 에코백 | 58,000 | ○ | `/products/41-eec87c12.png` |
| 42 | 가방 | 프라이탁 스몰 파우치 | 49,000 | ○ | `/products/42-479e0663.png` |
| 43 | 케이크 | 뚜레쥬르 생크림 케이크 1호 교환권 | 38,000 | ○ | `/products/43-c7ff913f.png` |
| 44 | 초콜릿·쿠키 | 고디바 트러플 초콜릿 12P | 48,000 | ◑ | `/products/44-6386fd7d.png` |
| 45 | 초콜릿·쿠키 | 슈퍼말차 쿠키 선물세트 | 26,000 | ○ | `/products/45-204fdb8c.png` |
| 46 | 과일 선물세트 | 샤인머스캣 2송이 선물세트 | 69,000 | ○ | `/products/46-8fc37a55.png` |
| 47 | 차·티백 | TWG 티백 15종 세트 | 42,000 | ◑ | `/products/47-e4a60f73.png` |
| 48 | 비타민·영양제 | 센트룸 종합비타민 100정 | 39,000 | ◑ | `/products/48-8aa004cc.png` |
| 49 | 와인 | 칠레 까베르네 소비뇽 2병 세트 | 89,000 | ○ | `/products/49-99bc6a9c.png` |
| 50 | 와인 | 모엣샹동 임페리얼 750ml | 78,000 | ◑ | `/products/50-cc9c5ebf.png` |
| 51 | 책 | 2026 베스트셀러 에세이 | 18,000 | ○ | `/products/51-f8a7c608.png` |
| 52 | 꽃다발·화분 | 계절 꽃다발 프리미엄 | 58,000 | ○ | `/products/52-71672fc9.png` |

### 시드용 배열 (T008)

`prisma/seed.ts`에 이어 붙인다. `categoryId`는 `name`으로 조회해 연결한다.

```ts
const PRODUCTS = [
  { category: '스마트워치', name: '갤럭시워치8 클래식 46mm', price: 569000, imageUrl: '/products/01-2960027b.png' },
  { category: '스마트워치', name: '갤럭시워치8 40mm 블루투스', price: 419000, imageUrl: '/products/02-8617a54f.png' },
  { category: '스마트워치', name: '애플워치 SE 3세대 40mm', price: 409000, imageUrl: '/products/03-350870ed.png' },
  { category: '무선이어폰', name: '에어팟 프로 3', price: 369000, imageUrl: '/products/04-93490d6b.png' },
  { category: '무선이어폰', name: '갤럭시 버즈4 프로', price: 359000, imageUrl: '/products/05-38680890.png' },
  { category: '무선이어폰', name: '소니 WF-1000XM5', price: 319000, imageUrl: '/products/06-3560c0d8.png' },
  { category: '텀블러', name: '스타벅스 스탠리 하우스 보온병 500ml', price: 47800, imageUrl: '/products/07-3140a03f.png' },
  { category: '텀블러', name: '스탠리 GO 진공 텀블러 473ml', price: 38000, imageUrl: '/products/08-0f2f6267.png' },
  { category: '텀블러', name: '써모스 스테인리스 텀블러 470ml', price: 32000, imageUrl: '/products/09-595cd2bf.png' },
  { category: '텀블러', name: '모슈 이중구조 텀블러 450ml', price: 24000, imageUrl: '/products/10-4edfae19.png' },
  { category: '텀블러', name: '오덴세 스테인리스 텀블러 400ml', price: 18000, imageUrl: '/products/11-6f8a6a47.png' },
  { category: '텀블러', name: '락앤락 스테인리스 텀블러 470ml', price: 12900, imageUrl: '/products/12-2f61c44f.png' },
  { category: '향수', name: '조 말론 런던 우드 세이지 앤 씨 솔트 코롱 100ml', price: 235000, imageUrl: '/products/13-008eb5fe.png' },
  { category: '향수', name: '딥디크 플레르 드 뽀 오드퍼퓸 75ml', price: 168000, imageUrl: '/products/14-5bc110dd.png' },
  { category: '향수', name: '논픽션 오드퍼퓸 50ml', price: 52000, imageUrl: '/products/15-15b28116.png' },
  { category: '향수', name: '탬버린즈 퍼퓸 30ml', price: 46000, imageUrl: '/products/16-96f8fa48.png' },
  { category: '향수', name: '포맨트 시그니처 퍼퓸 50ml', price: 38000, imageUrl: '/products/17-9924fea6.png' },
  { category: '수건', name: '송월타올 호텔수건 10매 세트', price: 55000, imageUrl: '/products/18-3af0a045.png' },
  { category: '수건', name: '무인양품 오가닉코튼 타월 4매', price: 38000, imageUrl: '/products/19-454be6dd.png' },
  { category: '수건', name: '코튼브릿지 호텔타월 5매 세트', price: 26000, imageUrl: '/products/20-9b12efd8.png' },
  { category: '수건', name: '송월타올 프리미엄 타월 3매 선물세트', price: 18000, imageUrl: '/products/21-5942064c.png' },
  { category: '수건', name: '코마사 데일리 타월 5매', price: 12000, imageUrl: '/products/22-b316cdef.png' },
  { category: '핸드크림', name: '록시땅 시어버터 핸드크림 세트', price: 42000, imageUrl: '/products/23-e38ecd8d.png' },
  { category: '핸드크림', name: '이솝 레저렉션 아로마틱 핸드밤 75ml', price: 28000, imageUrl: '/products/24-5056c4d9.png' },
  { category: '립밤·립스틱', name: '키엘 립케어 세트', price: 32000, imageUrl: '/products/25-54b3e37c.png' },
  { category: '립밤·립스틱', name: '라네즈 립 슬리핑 마스크 세트', price: 22000, imageUrl: '/products/26-d962b2a5.png' },
  { category: '머그컵·유리컵', name: '이딸라 티마 머그 2P', price: 46000, imageUrl: '/products/27-9d4803d6.png' },
  { category: '머그컵·유리컵', name: '오덴세 머그 2P 세트', price: 28000, imageUrl: '/products/28-c2100e03.png' },
  { category: '디퓨저·캔들', name: '조 말론 런던 홈 캔들 200g', price: 78000, imageUrl: '/products/29-0ea775c0.png' },
  { category: '디퓨저·캔들', name: '코트카페 디퓨저 200ml 세트', price: 39000, imageUrl: '/products/30-e1f00652.png' },
  { category: '침구', name: '이브자리 차렵이불 SS', price: 119000, imageUrl: '/products/31-16175a84.png' },
  { category: '침구', name: '소프라움 구스 베개 2P', price: 68000, imageUrl: '/products/32-81986505.png' },
  { category: '그릇·식기', name: '포트메리온 보타닉가든 2인 세트', price: 89000, imageUrl: '/products/33-acd78dde.png' },
  { category: '그릇·식기', name: '광주요 반상기 4P', price: 64000, imageUrl: '/products/34-0624cd35.png' },
  { category: '양말', name: '마인드브릿지 수면양말 선물세트 5족', price: 29000, imageUrl: '/products/35-dfddc2c7.png' },
  { category: '양말', name: '무인양품 발가락양말 5족 세트', price: 19000, imageUrl: '/products/36-a2f53024.png' },
  { category: '지갑', name: '닥스 소가죽 카드지갑', price: 78000, imageUrl: '/products/37-76358e93.png' },
  { category: '지갑', name: '루이까또즈 반지갑', price: 59000, imageUrl: '/products/38-63683ed4.png' },
  { category: '주얼리', name: '디디에두보 실버 목걸이', price: 118000, imageUrl: '/products/39-df0d029b.png' },
  { category: '주얼리', name: '제이에스티나 데일리 귀걸이', price: 68000, imageUrl: '/products/40-315d5994.png' },
  { category: '가방', name: '마르헨제이 에코백', price: 58000, imageUrl: '/products/41-eec87c12.png' },
  { category: '가방', name: '프라이탁 스몰 파우치', price: 49000, imageUrl: '/products/42-479e0663.png' },
  { category: '케이크', name: '뚜레쥬르 생크림 케이크 1호 교환권', price: 38000, imageUrl: '/products/43-c7ff913f.png' },
  { category: '초콜릿·쿠키', name: '고디바 트러플 초콜릿 12P', price: 48000, imageUrl: '/products/44-6386fd7d.png' },
  { category: '초콜릿·쿠키', name: '슈퍼말차 쿠키 선물세트', price: 26000, imageUrl: '/products/45-204fdb8c.png' },
  { category: '과일 선물세트', name: '샤인머스캣 2송이 선물세트', price: 69000, imageUrl: '/products/46-8fc37a55.png' },
  { category: '차·티백', name: 'TWG 티백 15종 세트', price: 42000, imageUrl: '/products/47-e4a60f73.png' },
  { category: '비타민·영양제', name: '센트룸 종합비타민 100정', price: 39000, imageUrl: '/products/48-8aa004cc.png' },
  { category: '와인', name: '칠레 까베르네 소비뇽 2병 세트', price: 89000, imageUrl: '/products/49-99bc6a9c.png' },
  { category: '와인', name: '모엣샹동 임페리얼 750ml', price: 78000, imageUrl: '/products/50-cc9c5ebf.png' },
  { category: '책', name: '2026 베스트셀러 에세이', price: 18000, imageUrl: '/products/51-f8a7c608.png' },
  { category: '꽃다발·화분', name: '계절 꽃다발 프리미엄', price: 58000, imageUrl: '/products/52-71672fc9.png' },
] as const
```

---

## 4. 이미지 — `public/products/` 52장

**실제 상품 사진이 아니라 브랜드 팔레트로 생성한 대체 이미지다.** 카테고리별로 톤이 다르고
상품명·가격이 박혀 있어 카탈로그로 읽힌다.

쇼핑몰 이미지를 쓰지 않은 이유:

| | |
|---|---|
| 외부 주소를 그대로 참조하면 | `next.config.ts`에 도메인 등록이 필요하고, 핫링킹이 막히거나 주소가 바뀌면 **시연 당일에 깨진다** |
| 내려받아 쓰면 | 남의 저작물 복제가 된다 |

`public/` 안에 있으므로 설정 변경이 필요 없고 오프라인에서도 뜬다.

**실제 사진으로 바꾸려면** 같은 파일명으로 덮어쓰면 된다 — 표의 `imageUrl` 열이 매핑표다.
전부 바꿀 필요는 없다. **시연에 실제로 등장하는 것은 고가 6건과 텀블러 6건 정도다.**

---

## 5. 개발자에게 요청하는 것

| 담당 | 태스크 | 요청 |
|---|---|---|
| J | T008 | 위 배열로 `Product` 52건 주입 |
| T022 작성자 | T022 | **1장 ①의 취향 세팅**을 E2E 계정 1에 그대로 넣는다 — 텀블러 `want` · 수건 `have` · 향수 `unwanted` |

> ⚠️ **1장 ①의 취향 세팅이 이 문서의 절반이다.** 상품만 넣고 취향을 다르게 세팅하면
> 배너가 하나도 안 뜨고, `tasks.md` T002가 경고한 "텅 빈 추천 화면"이 그대로 재현된다.

---

## 6. 가격을 고칠 때

조정해도 되지만 **아래 관계는 깨지면 안 된다.**

- 텀블러 6건이 **서로 다른 가격**이고 최소 3단계 이상 벌어져 있을 것 (④)
- 고가 상품이 **1인 부담이 부담스러운 수준**일 것 — 펀딩의 존재 이유다 (PRD: "고가 선물의 가격 상한을 올리는 장치")
- 향수·수건이 카탈로그에 **남아 있을 것** — 차단·주의를 보여주려면 상품이 있어야 한다
