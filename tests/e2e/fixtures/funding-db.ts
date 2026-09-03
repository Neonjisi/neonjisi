/**
 * T030 — 정산 E2E 가 **마감을 과거로 당기는** 유일한 통로.
 *
 * e2e 는 원래 DB 를 직접 만지지 않는다 (fixtures/auth.ts · friend-ui.ts — 상태는 UI 로
 * 만들고 UI 로 지운다). 마감만 예외다: 정산 트리거는 `deadline < now` 인데(contracts §2 ·
 * `shouldSettle`) 화면에는 마감을 앞당기는 입력이 없고, 실제로 기다리면 테스트가 며칠 걸린다.
 * tasks.md T030 이 "마감은 DB 로 과거 설정"이라고 못 박은 이유다.
 *
 * 그래서 이 파일의 규칙:
 *  - **쓰기는 `deadline` 한 열뿐이다.** 상태·금액·결제·알림은 전부 제품 코드가 만들게 둔다 —
 *    DB 로 상태를 심으면 정산이 아니라 픽스처를 검증하게 된다.
 *  - **읽기 헬퍼를 두지 않는다.** 정산 결과의 판정은 화면·알림으로 한다 (그게 T030 의 목적이다).
 *    상태 전이 자체는 `tests/integration/funding-settle.test.ts`(T013)가 이미 검증한다.
 *  - `@/lib/prisma` 도 DAL 도 import 하지 않는다. 앱 싱글턴과 무관한 **짧은 수명의 연결**을
 *    직접 열고, 스펙이 끝나면 `closeFundingDb()` 로 닫는다 (안 닫으면 Playwright 가 안 끝난다).
 *
 * `DATABASE_URL` 은 fixtures/auth.ts 가 `@next/env` 로 이미 실어 둔 것을 쓴다 — 모듈 평가
 * 순서에 기대지 않도록 **호출 시점에** 읽는다.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

let client: PrismaClient | null = null

function db(): PrismaClient {
  if (client) return client
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL 이 비어 있다 — 정산 E2E 는 마감을 DB 로 당긴다 (.env.local 확인, tasks.md T030)',
    )
  }
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  return client
}

/** 스펙의 `test.afterAll` 에서 반드시 부른다 — 연결이 남으면 Playwright 프로세스가 끝나지 않는다 */
export async function closeFundingDb(): Promise<void> {
  if (!client) return
  const closing = client
  client = null
  await closing.$disconnect()
}

/**
 * `OPEN` 인 펀딩 **하나**의 마감을 과거로 당긴다. 다음 조회가 정산을 부른다 (R1).
 *
 * 조건에 `status: 'OPEN'` 을 남겨 둔 건 안전장치다 — 이미 정산된 건을 되살리지 않고,
 * 테스트가 방금 만든 펀딩이 아니면 0행이 되어 조용히 지나가는 대신 터진다.
 */
export async function expireFundingDeadline(fundingId: string, minutesAgo = 1): Promise<void> {
  const { count } = await db().funding.updateMany({
    where: { id: fundingId, status: 'OPEN' },
    data: { deadline: new Date(Date.now() - minutesAgo * 60_000) },
  })
  if (count !== 1) {
    throw new Error(
      `마감을 과거로 당기지 못했다 (fundingId=${fundingId}, 갱신 ${count}행) — ` +
        'OPEN 상태가 아니거나 그 사이 정산이 끝난 펀딩이다',
    )
  }
}
