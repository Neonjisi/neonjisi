// @vitest-environment node
/**
 * T011 — C2 유니크 제약 검증 (data-model.md, FR-011, quickstart V5-3)
 *
 * (profileId, kind, categoryId, detail) 조합에서 detail 이 NULL 인 동일 조합을
 * 두 번 삽입해 **DB 가 거부하는지** 확인한다. PostgreSQL 은 기본적으로 유니크
 * 인덱스에서 NULL 을 서로 다른 값으로 취급하므로, T010 의 NULLS NOT DISTINCT
 * raw SQL 이 빠지면 이 테스트가 실패한다 — 화면상으로는 정상으로 보여 놓치기 쉽다.
 *
 * 실 DB 에 붙는 통합 테스트라 .env.local (T006) 이 필요하다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Vitest 는 Next 와 달리 .env.local 을 자동으로 읽지 않는다.
// 게다가 @next/env 는 NODE_ENV=test 에서 .env.local 을 의도적으로 건너뛰므로,
// 로드하는 동안만 NODE_ENV 를 우회한다 — 이 테스트는 실 DB(T006 로컬 설정)가 전제다.
{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

const hasDatabase = Boolean(process.env.DATABASE_URL)
// lib/prisma 는 임포트 시점에 DATABASE_URL 을 요구하므로 env 로드 뒤에 동적 임포트한다.
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

describe.skipIf(!hasDatabase)('C2 — TasteItem 유니크 제약 (NULLS NOT DISTINCT)', () => {
  const userId = randomUUID()
  let profileId: string
  let categoryId: string

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, displayName: 'C2 제약 테스트' } })
    const profile = await prisma.tasteProfile.create({ data: { userId } })
    profileId = profile.id
    const category = await prisma.category.create({
      data: { name: `__c2-test-${userId}`, sortOrder: 99999, group: '__테스트' },
    })
    categoryId = category.id
  })

  afterAll(async () => {
    // User 삭제가 TasteProfile·TasteItem 을 cascade 로 지운 뒤에야 Category 를 지울 수 있다 (Restrict).
    await prisma.user.delete({ where: { id: userId } })
    await prisma.category.delete({ where: { id: categoryId } })
    await prisma.$disconnect()
  })

  it('detail 이 NULL 인 동일 (profileId, kind, categoryId) 조합의 두 번째 삽입을 DB 가 거부한다', async () => {
    await prisma.tasteItem.create({
      data: { profileId, kind: 'HAVE', categoryId, detail: null },
    })

    await expect(
      prisma.tasteItem.create({
        data: { profileId, kind: 'HAVE', categoryId, detail: null },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('detail 이 다르면 같은 (profileId, kind, categoryId) 라도 저장된다', async () => {
    const created = await prisma.tasteItem.create({
      data: { profileId, kind: 'HAVE', categoryId, detail: '상세가 있는 항목' },
    })
    expect(created.detail).toBe('상세가 있는 항목')
  })

  it('detail 까지 같은 조합의 두 번째 삽입도 거부한다', async () => {
    await prisma.tasteItem.create({
      data: { profileId, kind: 'UNWANTED', categoryId, detail: '완전 동일' },
    })

    await expect(
      prisma.tasteItem.create({
        data: { profileId, kind: 'UNWANTED', categoryId, detail: '완전 동일' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})
