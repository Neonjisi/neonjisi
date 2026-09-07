/**
 * T029 — 취향 계정 초기화를 **DB 직접 삭제**로 하는 유일한 통로.
 *
 * e2e 는 상태를 UI 로 만들고 UI 로 지우는 것이 기본이다 (fixtures/auth.ts · friend-ui.ts).
 * 초기화만 예외다. 예전 `resetAccount` 는 /taste 에서 행을 한 건씩 탭 → 삭제 → 확인 하며
 * 매 반복마다 `page.goto('/taste')` 를 다시 돌았다 — 종류별 상한 100건(FR-020) × 3 이라
 * **최대 305회** 왕복이다. 그래서 앞 테스트가 쌓아 둔 항목 수만큼 뒤 테스트가 느려지는
 * 순서 의존이 생겼고, `friend-invite.spec.ts` 뒤쪽 6개가 파일 전체 실행에서만 90초를 넘겨
 * 죽었다 (`:78` 을 단독 `--timeout=300000` 으로 돌리면 26.8초에 통과 — 코드 결함이 아니라
 * 예산 문제였다).
 *
 * 초기화는 **검증 대상이 아니라 전제**다. 그 전제를 만드는 데 화면을 305번 여는 것은 이
 * 테스트들이 무엇을 지키는지와 무관한 비용이다. M3 의 `gift-db.ts` 가 같은 이유로 이미
 * 정리를 DB 로 한다.
 *
 * 규칙:
 *  - **쓰기는 초기화에 필요한 셋뿐이다** — 항목 삭제 · `onboardedAt` · `description`.
 *    상태를 심는 용도로 쓰지 않는다. 심으면 제품이 아니라 픽스처를 검증하게 된다.
 *  - **지운 결과의 판정은 화면이 한다** — `resetAccount` 가 /taste → /onboarding
 *    리다이렉트(FR-018)로 확인한다. 그래서 여기에 읽기 헬퍼를 두지 않는다.
 *  - `@/lib/prisma` 도 DAL 도 import 하지 않는다. 앱 싱글턴과 무관한 연결을 직접 연다.
 *  - **연결은 호출마다 열고 닫는다.** funding-db.ts 는 모듈 수명 클라이언트 + 스펙의
 *    `afterAll(closeFundingDb)` 인데, `resetAccount` 는 스펙 7개가 `beforeEach` 에서
 *    부르므로 그 방식이면 닫기를 7곳에 심어야 하고 하나만 빠뜨려도 Playwright 가 끝나지
 *    않는다. 초기화는 테스트당 한 번이라 연결 비용이 305회 왕복에 비하면 없는 값이다.
 *
 * `DATABASE_URL` 은 fixtures/auth.ts 가 `@next/env` 로 실어 둔 것을 **호출 시점에** 읽는다
 * (funding-db.ts 와 같은 이유 — 모듈 평가 순서에 기대지 않는다).
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

/**
 * `userId`(= `auth.users.id` = `User.id`, schema.prisma R2) 계정의 취향을 비운다.
 * 프로필이 아직 없으면 이미 초기 상태이므로 아무것도 하지 않는다.
 */
export async function resetTasteProfile(userId: string): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL 이 비어 있다 — 취향 초기화는 DB 로 한다 (.env.local 확인, tasks.md T029)',
    )
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  try {
    const profile = await db.tasteProfile.findUnique({
      where: { userId },
      select: { id: true },
    })
    if (!profile) return

    await db.$transaction([
      db.tasteItem.deleteMany({ where: { profileId: profile.id } }),
      // 항목 0건이면 온보딩은 미완료로 되돌아간다 (US4-3 · lib/dal/taste.ts).
      // 서술의 빈 값은 액션이 null 로 정규화하므로(FR-007) 여기도 null 이다.
      db.tasteProfile.update({
        where: { id: profile.id },
        data: { onboardedAt: null, description: null },
      }),
    ])
  } finally {
    await db.$disconnect()
  }
}
