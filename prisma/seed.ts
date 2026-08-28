/**
 * T012 — Category 시드. `npx prisma db seed` 로 실행한다 (prisma.config.ts 참조).
 *
 * 목록의 원본(SSOT)은 specs/001-taste-profile/categories.md §4 — S(기획) 확정안 40개다.
 * name 을 키로 upsert 하므로 몇 번을 돌려도 결과가 같다 (멱등).
 * 순서·묶음 변경은 배열만 고치면 되고, 목록에서 빠진 항목은 지우지 않는다 —
 * 이미 취향이 참조 중인 카테고리는 FK Restrict 로 삭제가 막혀 있다.
 *
 * ⚠️ name 은 unique 키다. 가운뎃점(·)·띄어쓰기까지 문서와 정확히 일치해야 한다 —
 *    오타 하나가 중복 행이 된다.
 */
import { loadEnvConfig } from '@next/env'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// prisma CLI 를 거치지 않고 직접 실행해도 .env.local 을 읽도록 한다.
loadEnvConfig(process.cwd())

// categories.md §4 "시드용 배열" 을 그대로 옮겼다. 배열 순서 = sortOrder = 화면 순서.
const CATEGORIES: { name: string; group: string }[] = [
  { name: '텀블러', group: '리빙' },
  { name: '머그컵·유리컵', group: '리빙' },
  { name: '디퓨저·캔들', group: '리빙' },
  { name: '수건', group: '리빙' },
  { name: '침구', group: '리빙' },
  { name: '그릇·식기', group: '리빙' },
  { name: '핸드크림', group: '뷰티' },
  { name: '립밤·립스틱', group: '뷰티' },
  { name: '향수', group: '뷰티' },
  { name: '바디케어', group: '뷰티' },
  { name: '스킨케어', group: '뷰티' },
  { name: '헤어케어', group: '뷰티' },
  { name: '양말', group: '패션·잡화' },
  { name: '머플러·장갑', group: '패션·잡화' },
  { name: '지갑', group: '패션·잡화' },
  { name: '주얼리', group: '패션·잡화' },
  { name: '가방', group: '패션·잡화' },
  { name: '모자', group: '패션·잡화' },
  { name: '잠옷·홈웨어', group: '패션·잡화' },
  { name: '커피 교환권', group: '교환권' },
  { name: '편의점 교환권', group: '교환권' },
  { name: '치킨·피자 교환권', group: '교환권' },
  { name: '아이스크림·디저트 교환권', group: '교환권' },
  { name: '케이크', group: '식품' },
  { name: '초콜릿·쿠키', group: '식품' },
  { name: '과일 선물세트', group: '식품' },
  { name: '한우·정육 선물세트', group: '식품' },
  { name: '차·티백', group: '식품' },
  { name: '비타민·영양제', group: '건강' },
  { name: '홍삼·건강기능식품', group: '건강' },
  { name: '무선이어폰', group: '디지털' },
  { name: '보조배터리·충전기', group: '디지털' },
  { name: '스마트워치', group: '디지털' },
  { name: '와인', group: '주류' },
  { name: '위스키·전통주', group: '주류' },
  { name: '책', group: '생활·취미' },
  { name: '꽃다발·화분', group: '생활·취미' },
  { name: '운동용품', group: '생활·취미' },
  { name: '반려동물 용품', group: '생활·취미' },
  { name: '유아동 용품', group: '생활·취미' },
]

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL 이 비어 있다. .env.local 을 확인할 것 (tasks.md T006).')
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

  try {
    for (const [index, { name, group }] of CATEGORIES.entries()) {
      const sortOrder = index + 1
      await prisma.category.upsert({
        where: { name },
        update: { sortOrder, group },
        create: { name, sortOrder, group },
      })
    }
    const count = await prisma.category.count()
    process.stdout.write(`Category 시드 완료 — 입력 ${CATEGORIES.length}건, 테이블 총 ${count}행\n`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`시드 실패: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
