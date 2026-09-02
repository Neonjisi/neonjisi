/**
 * T012 — Category 시드 + T008 — Product 시드. `npx prisma db seed` 로 실행한다.
 *
 * [Category] 목록의 원본(SSOT)은 specs/001-taste-profile/categories.md §4 — S(기획) 확정안 40개다.
 * name 을 키로 upsert 하므로 몇 번을 돌려도 결과가 같다 (멱등).
 * 순서 변경은 배열 순서만 바꾸면 되고, 목록에서 빠진 항목은 지우지 않는다 —
 * 이미 취향이 참조 중인 카테고리는 FK Restrict 로 삭제가 막혀 있다.
 *
 * ⚠️ name 은 unique 키다. 가운뎃점(·)·띄어쓰기까지 문서와 정확히 일치해야 한다 —
 *    오타 하나가 중복 행이 된다. 묶음은 순서에만 반영되고 DB에는 저장하지 않는다.
 *
 * [Product] 콘텐츠의 원본(SSOT)은 S의 시드 표(T002)다 — products.md §3 에서 그대로 가져왔다.
 * 내용을 고쳐야 하면 문서를 먼저 고치고 배열을 다시 가져온다 — 반대 방향은 안 된다.
 * name 으로 찾아 갱신/생성하므로 멱등이다. 시나리오 커버 4조건(spec Assumptions —
 * want 일치 · have · unwanted · 싼 대안 여러 건)은 주입 후 리포트로 확인을 돕고,
 * 최종 판정은 quickstart V1~V8 수동 검증(T069, S 주도)이 한다.
 */
import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// prisma CLI 를 거치지 않고 직접 실행해도 .env.local 을 읽도록 한다.
loadEnvConfig(process.cwd())

// categories.md §4 확정 순서 그대로. 배열 순서 = sortOrder = 화면 순서.
const CATEGORY_NAMES: string[] = [
  // 리빙
  '텀블러',
  '머그컵·유리컵',
  '디퓨저·캔들',
  '수건',
  '침구',
  '그릇·식기',
  // 뷰티
  '핸드크림',
  '립밤·립스틱',
  '향수',
  '바디케어',
  '스킨케어',
  '헤어케어',
  // 패션·잡화
  '양말',
  '머플러·장갑',
  '지갑',
  '주얼리',
  '가방',
  '모자',
  '잠옷·홈웨어',
  // 교환권
  '커피 교환권',
  '편의점 교환권',
  '치킨·피자 교환권',
  '아이스크림·디저트 교환권',
  // 식품
  '케이크',
  '초콜릿·쿠키',
  '과일 선물세트',
  '한우·정육 선물세트',
  '차·티백',
  // 건강
  '비타민·영양제',
  '홍삼·건강기능식품',
  // 디지털
  '무선이어폰',
  '보조배터리·충전기',
  '스마트워치',
  // 주류
  '와인',
  '위스키·전통주',
  // 생활·취미
  '책',
  '꽃다발·화분',
  '운동용품',
  '반려동물 용품',
  '유아동 용품',
]

// ── Product 시드 (T008) ──────────────────────────────────────────────────────

type ProductSeed = {
  name: string
  /** CATEGORY_NAMES 의 값과 정확히 일치해야 한다 — 불일치는 주입 시 즉시 실패한다 */
  category: string
  /** 원 단위 정수 (data-model Product.price) */
  price: number
  imageUrl: string | null
}

/**
 * ⛔ 콘텐츠의 SSOT 는 S의 표다 — specs/003-gift-request-payment/products.md §3 "시드용 배열".
 * 이 배열은 그 문서에서 그대로 옮겨 왔다. 수정은 문서를 먼저 고치고 다시 옮긴다.
 * 30~52건 + 시나리오 커버 4조건은 아래 리포트가 확인을 돕는다.
 *
 * 상한이 50 이 아니라 52 인 이유: 텀블러 가격 사다리를 6단계로 깔아야 싼 대안
 * 재선택(커버 ④)이 성립한다는 S의 판단이다 (products.md §0). spec Assumptions 동시 갱신.
 */
const PRODUCT_SEED: ProductSeed[] = [
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
]

async function seedProducts(prisma: PrismaClient): Promise<void> {
  if (PRODUCT_SEED.length === 0) {
    process.stdout.write(
      'Product 시드 생략 — S의 표(T002) 미전달. 확정되면 PRODUCT_SEED 에 옮겨 다시 실행한다.\n',
    )
    return
  }
  if (PRODUCT_SEED.length < 30 || PRODUCT_SEED.length > 52) {
    throw new Error(
      `Product 시드는 30~52건이어야 한다 (spec Assumptions) — 현재 ${PRODUCT_SEED.length}건`,
    )
  }

  const categories = await prisma.category.findMany({ select: { id: true, name: true } })
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]))

  for (const item of PRODUCT_SEED) {
    const categoryId = categoryIdByName.get(item.category)
    if (!categoryId) {
      // 오타를 조용히 넘기면 unwanted 필터·매칭 배너가 그 상품에서 전부 빗나간다
      throw new Error(`Product "${item.name}" 의 카테고리 "${item.category}" 가 Category 시드에 없다`)
    }
    if (!Number.isInteger(item.price) || item.price <= 0) {
      throw new Error(`Product "${item.name}" 의 가격이 원 단위 양의 정수가 아니다: ${item.price}`)
    }

    // name 은 unique 제약이 없으므로 upsert 대신 찾아서 갱신/생성한다 — 멱등
    const existing = await prisma.product.findFirst({ where: { name: item.name }, select: { id: true } })
    const data = { name: item.name, categoryId, price: item.price, imageUrl: item.imageUrl, isActive: true }
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data })
    } else {
      await prisma.product.create({ data })
    }
  }

  const count = await prisma.product.count({ where: { isActive: true } })
  process.stdout.write(`Product 시드 완료 — 입력 ${PRODUCT_SEED.length}건, 활성 총 ${count}행\n`)
  await reportScenarioCoverage(prisma)
}

/**
 * 시나리오 커버 4조건 리포트 — E2E 계정 취향과 엮여야 성립하므로 (분담표 §5-S②) 여기서는
 * DB의 온보딩된 취향 전체를 상대로 근사 확인한다. 경고가 나오면 S의 표 또는 quickstart 의
 * E2E 계정 취향 세팅을 조정한다. 시드를 실패시키지는 않는다 — 판정은 T069 몫이다.
 */
async function reportScenarioCoverage(prisma: PrismaClient): Promise<void> {
  const kinds = ['WANT', 'HAVE', 'UNWANTED'] as const
  for (const kind of kinds) {
    const items = await prisma.tasteItem.findMany({
      where: { kind },
      select: { categoryId: true },
      distinct: ['categoryId'],
    })
    const categoryIds = items.map((i) => i.categoryId)
    const matched =
      categoryIds.length === 0
        ? 0
        : await prisma.product.count({ where: { isActive: true, categoryId: { in: categoryIds } } })
    const label = { WANT: 'want 일치', HAVE: 'have 카테고리', UNWANTED: 'unwanted 카테고리' }[kind]
    const mark = matched > 0 || categoryIds.length === 0 ? 'ok' : '⚠ 0건'
    process.stdout.write(
      `  커버 ${label}: 취향 카테고리 ${categoryIds.length}종 ↔ 활성 상품 ${matched}건 [${mark}]\n`,
    )
  }

  // ④ 싼 대안 여러 건 — 가장 비싼 활성 상품 기준으로 그보다 싼 상품 수를 본다 (근사)
  const priciest = await prisma.product.findFirst({
    where: { isActive: true },
    orderBy: { price: 'desc' },
    select: { name: true, price: true },
  })
  if (priciest) {
    const cheaper = await prisma.product.count({
      where: { isActive: true, price: { lt: priciest.price } },
    })
    const mark = cheaper >= 2 ? 'ok' : '⚠ 부족'
    process.stdout.write(
      `  커버 싼 대안: 최고가 "${priciest.name}"(${priciest.price}원)보다 싼 활성 상품 ${cheaper}건 [${mark}]\n`,
    )
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL 이 비어 있다. .env.local 을 확인할 것 (tasks.md T006).')
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    for (const [index, name] of CATEGORY_NAMES.entries()) {
      const sortOrder = index + 1
      await prisma.category.upsert({
        where: { name },
        update: { sortOrder },
        create: { name, sortOrder },
      })
    }
    const count = await prisma.category.count()
    process.stdout.write(`Category 시드 완료 — 입력 ${CATEGORY_NAMES.length}건, 테이블 총 ${count}행\n`)

    await seedProducts(prisma)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`시드 실패: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
