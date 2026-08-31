import type { prisma as PrismaClientType } from '@/lib/prisma'

/**
 * M3 테이블 존재 프로브 (T016·T052 통합 테스트용)
 *
 * D 의 결제 작업은 J 의 마이그레이션(T004)보다 앞서 있다. 테이블이 없는 DB 에서 이 테스트들은
 * **실패가 아니라 skip** 이다 — 아직 오지 않은 남의 태스크 때문에 팀 전체의 `npm run test` 가
 * 빨개지면 진짜 회귀가 묻힌다 (M1·M2 의 E2E probe skip 과 같은 판단, R12).
 *
 * ⚠️ 그래서 **`skipped` 수를 확인한다.** 마이그레이션이 들어온 뒤에도 skip 이 남아 있으면
 *    그건 이 프로브가 아니라 DB 연결을 의심해야 한다 (M1·M2 와 같은 함정).
 */
export async function hasM3GiftTables(prisma: typeof PrismaClientType): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public."GiftRequest"') IS NOT NULL AS present
    `
    return rows[0]?.present === true
  } catch (e) {
    console.error('[tests] M3 테이블 확인에 실패했다 — skip 으로 처리한다', e)
    return false
  }
}

export const M3_TABLES_SKIP_REASON =
  'M3 테이블이 없다 — J 의 마이그레이션(T004) 적용 후 이 테스트가 켜진다'
