// @vitest-environment node
/**
 * T016 — lib/dal/funding.ts 통합 테스트 (계약: specs/004-group-funding/contracts/server-actions.md §3)
 *
 * 검증 대상 셋:
 *  ① 지분 3단계 마스킹(R6) — organizer·receiver: 전원 이름+금액 / contributor: 자기 것만 /
 *     friend: 이름만(금액 전부 null). canViewFunding 밖(비친구·무관 사용자)은 null.
 *  ② 정산 트리거(R1) — 마감 지난 OPEN 을 지나는 조회가 `settleFunding()` 을 정확히 1회
 *     호출하고, 그 뒤 최신 상태를 반영한다. 마감 전·이미 종착 상태는 호출하지 않는다.
 *  ③ 예약 만료 지연 해제(R2) — 만료된 RESERVED 행이 조회 시점에 삭제되고 잔여가 즉시 풀린다.
 *
 * `lib/funding/settle.ts`(D, T014)는 이 세션이 만들지 않는다 — `vi.mock` 으로 대체한다
 * (M3 `gift-respond-concurrent.test.ts` 의 charge.ts 대체와 같은 자리). mock 은 실 settle.ts
 * 가 하는 일 중 이 테스트가 필요로 하는 최소한(상태 UPDATE)만 흉내 낸다.
 *
 * 실 DB 통합 테스트라 .env.local 이 필요하다. 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

vi.setConfig({ testTimeout: 30_000 })

// 호출마다 다른 세션을 묶기 위해 AsyncLocalStorage 로 userId 를 전달한다 (gift-request.test.ts 와 동일)
const h = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return {
    sessionUser: new AsyncLocalStorage<string>(),
    settleFunding: vi.fn(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () => {
        const sub = h.sessionUser.getStore()
        return sub
          ? { data: { claims: { sub } }, error: null }
          : { data: null, error: { message: '세션 없음 (테스트)' } }
      }),
    },
  })),
}))

// D 의 T014 대체 — settle.ts 는 아직 없다. 이 세션은 import 만 쓰고 실물을 만들지 않는다.
vi.mock('@/lib/funding/settle', () => ({ settleFunding: h.settleFunding }))

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

const fundingDelegate = hasDatabase
  ? (prisma as unknown as Record<string, unknown>).funding
  : undefined
const hasFundingSchema = typeof (fundingDelegate as { findUnique?: unknown } | undefined)?.findUnique === 'function'

const skipReason = !hasDatabase
  ? 'DATABASE_URL 미설정 — .env.local 을 확인할 것'
  : !hasFundingSchema
    ? '① gnuke/m4-schema 미병합 — merge 후 `npx prisma generate` 필요 (Funding 모델 없음)'
    : ''
if (skipReason) console.warn(`[funding-dal.test] skip — ${skipReason}`)

const { getFunding, getMyFundings, getHomeFundings } = hasFundingSchema
  ? await import('@/lib/dal/funding')
  : ({} as Partial<typeof import('@/lib/dal/funding')>)

const MIN = 60_000
const DAY = 24 * 60 * MIN
const past = (ms: number) => new Date(Date.now() - ms)
const future = (ms: number) => new Date(Date.now() + ms)

/** 세션을 걸고 콜백을 실행한다 — verifySession() 이 이 store 를 읽는다 */
function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return h.sessionUser.run(userId, fn)
}

describe.skipIf(skipReason !== '')('lib/dal/funding — getFunding·getMyFundings·getHomeFundings (T016)', () => {
  const userIds: string[] = []
  const fundingIds: string[] = []
  let categoryId: string
  let productId: string

  let organizer: string
  let receiver: string
  let contributorA: string
  let contributorB: string
  let friendOfReceiver: string
  let stranger: string

  async function createUser(label: string): Promise<string> {
    const id = randomUUID()
    await prisma.user.create({ data: { id, displayName: `${label} ${id.slice(0, 8)}` } })
    userIds.push(id)
    return id
  }

  async function createFunding(overrides: {
    organizerId: string
    receiverId: string
    status?: 'OPEN' | 'SUCCEEDED' | 'SETTLED' | 'FAILED' | 'CANCELLED'
    deadline: Date
    goalAmount?: number
    minAmount?: number
    topupAttemptCount?: number
    topupRetryUntil?: Date | null
  }): Promise<string> {
    const id = randomUUID()
    await prisma.funding.create({
      data: {
        id,
        organizerId: overrides.organizerId,
        receiverId: overrides.receiverId,
        status: overrides.status ?? 'OPEN',
        productId,
        productSnapshot: { name: 'T016 테스트 상품', imageUrl: null, price: 100_000 },
        goalAmount: overrides.goalAmount ?? 100_000,
        minAmount: overrides.minAmount ?? 50_000,
        deadline: overrides.deadline,
        receiverDisplayName: 'T016 수령자',
        topupAttemptCount: overrides.topupAttemptCount ?? 0,
        topupRetryUntil: overrides.topupRetryUntil ?? null,
      },
    })
    fundingIds.push(id)
    return id
  }

  async function createContribution(
    fundingId: string,
    contributorId: string,
    amount: number,
    status: 'RESERVED' | 'PAID' | 'REFUNDED',
    reservedUntil: Date,
  ) {
    await prisma.fundingContribution.create({
      data: { fundingId, contributorId, amount, status, reservedUntil },
    })
  }

  beforeAll(async () => {
    organizer = await createUser('주최자')
    receiver = await createUser('수령자')
    contributorA = await createUser('참여자A')
    contributorB = await createUser('참여자B')
    friendOfReceiver = await createUser('수령자친구')
    stranger = await createUser('무관사용자')

    await prisma.friendship.create({
      data: { requesterId: friendOfReceiver, addresseeId: receiver, status: 'ACTIVE' },
    })

    categoryId = randomUUID()
    await prisma.category.create({ data: { id: categoryId, name: `t016-${categoryId}`, sortOrder: 9500 } })
    productId = randomUUID()
    await prisma.product.create({
      data: { id: productId, name: 'T016 테스트 상품', categoryId, price: 100_000 },
    })
  })

  beforeEach(() => {
    h.settleFunding.mockClear()
    h.settleFunding.mockResolvedValue({ outcome: 'STILL_OPEN' })
  })

  afterAll(async () => {
    await prisma.fundingContribution.deleteMany({ where: { fundingId: { in: fundingIds } } })
    await prisma.funding.deleteMany({ where: { id: { in: fundingIds } } })
    await prisma.friendship.deleteMany({ where: { requesterId: friendOfReceiver, addresseeId: receiver } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.product.deleteMany({ where: { id: productId } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.$disconnect()
  })

  describe('getFunding — canViewFunding + 지분 3단계 마스킹 (R6)', () => {
    let fundingId: string

    beforeAll(async () => {
      fundingId = await createFunding({
        organizerId: organizer,
        receiverId: receiver,
        deadline: future(7 * DAY),
        goalAmount: 100_000,
        minAmount: 50_000,
      })
      // contributorA: PAID 30000 + RESERVED(진행 중) 10000 — 우선순위(myContribution) 검증도 겸한다
      await createContribution(fundingId, contributorA, 30_000, 'PAID', future(10 * MIN))
      await createContribution(fundingId, contributorA, 10_000, 'RESERVED', future(10 * MIN))
      await createContribution(fundingId, contributorB, 20_000, 'PAID', future(10 * MIN))
    })

    it('organizer: 전원 이름+금액, paidTotal·remaining·reservedInFlight 정확', async () => {
      const view = await asUser(organizer, () => getFunding!(fundingId))
      expect(view).not.toBeNull()
      expect(view!.role).toBe('organizer')
      expect(view!.status).toBe('OPEN')
      expect(view!.paidTotal).toBe(50_000) // PAID 30000+20000 만 — RESERVED 10000 제외 (R3)
      expect(view!.remaining).toBe(100_000 - 60_000) // goal − capTotal(RESERVED+PAID=60000)
      expect(view!.reservedInFlight).toBe(10_000) // cap(60000) − paid(50000)
      expect(view!.contributions).toHaveLength(3)
      for (const c of view!.contributions) expect(c.amount).not.toBeNull()
      const total = view!.contributions.reduce((s, c) => s + (c.amount ?? 0), 0)
      expect(total).toBe(60_000)
    })

    it('receiver: organizer 와 같은 전원 공개', async () => {
      const view = await asUser(receiver, () => getFunding!(fundingId))
      expect(view!.role).toBe('receiver')
      expect(view!.contributions.every((c) => c.amount !== null)).toBe(true)
    })

    it('contributor: 자기 금액만, 남의 금액은 null — myContribution 은 PAID 우선', async () => {
      const view = await asUser(contributorA, () => getFunding!(fundingId))
      expect(view!.role).toBe('contributor')

      // contributorB 행은 amount null — 참여자끼리 서로의 금액을 볼 수 없다 (PRD R5)
      const others = view!.contributions.filter((c) => c.amount === null)
      expect(others.length).toBeGreaterThan(0)

      // contributorA 자신의 행(2건)은 amount 가 보인다
      const mineVisible = view!.contributions.filter((c) => c.amount !== null)
      const mineSum = mineVisible.reduce((s, c) => s + (c.amount ?? 0), 0)
      expect(mineSum).toBe(40_000) // 30000 + 10000

      // PAID(30000) 이 RESERVED(10000) 보다 우선한다 — 이미 확정된 결제를 진행 중 예약이
      // 가리면 안 된다(리뷰 지적: PAID+RESERVED 공존 시 RESERVED 만 보이던 회귀).
      // 진행 중인 예약 자체는 위 contributions[] 의 본인 행(10000)으로 이미 보인다.
      expect(view!.myContribution).toEqual({ amount: 30_000, status: 'PAID' })
    })

    it('myContribution — PAID+RESERVED 공존 시 PAID 가 대표값이다 (확정액을 숨기지 않는다)', async () => {
      const soloFundingId = await createFunding({
        organizerId: organizer,
        receiverId: receiver,
        deadline: future(7 * DAY),
        goalAmount: 100_000,
        minAmount: 50_000,
      })
      const soloContributor = await createUser('myContribution전용참여자')
      // 이미 확정된 30000 결제 + 별도로 새로 건 10000 예약(아직 처리 중) — 별도 참여 건(FR-011)
      await createContribution(soloFundingId, soloContributor, 30_000, 'PAID', future(10 * MIN))
      await createContribution(soloFundingId, soloContributor, 10_000, 'RESERVED', future(10 * MIN))

      const view = await asUser(soloContributor, () => getFunding!(soloFundingId))

      expect(view!.myContribution).toEqual({ amount: 30_000, status: 'PAID' })
    })

    it('friend(활성 친구): 이름만 — 금액 전부 null, myContribution 도 null', async () => {
      const view = await asUser(friendOfReceiver, () => getFunding!(fundingId))
      expect(view!.role).toBe('friend')
      expect(view!.contributions).toHaveLength(3)
      expect(view!.contributions.every((c) => c.amount === null)).toBe(true)
      expect(view!.myContribution).toBeNull()
      expect(view!.topup).toBeNull() // organizer 가 아니다
    })

    it('무관 사용자(비친구·비참여자): null — canViewFunding 밖', async () => {
      const view = await asUser(stranger, () => getFunding!(fundingId))
      expect(view).toBeNull()
    })

    it('존재하지 않는 id: null — 접근 거부와 같은 모양으로 뭉갠다', async () => {
      const view = await asUser(organizer, () => getFunding!(randomUUID()))
      expect(view).toBeNull()
    })

    it('organizer 에게만 topup 필드가 보인다', async () => {
      const view = await asUser(organizer, () => getFunding!(fundingId))
      expect(view!.topup).toEqual({ attemptCount: 0, retryUntil: null })

      const receiverView = await asUser(receiver, () => getFunding!(fundingId))
      expect(receiverView!.topup).toBeNull()
    })
  })

  describe('getFunding — 예약 만료 지연 해제 (R2)', () => {
    it('만료된 RESERVED 는 조회 시점에 삭제되고 잔여가 즉시 풀린다', async () => {
      const fundingId = await createFunding({
        organizerId: organizer,
        receiverId: receiver,
        deadline: future(7 * DAY),
        goalAmount: 100_000,
        minAmount: 50_000,
      })
      await createContribution(fundingId, contributorA, 40_000, 'RESERVED', past(1 * MIN)) // 이미 만료

      const view = await asUser(organizer, () => getFunding!(fundingId))
      expect(view!.contributions).toHaveLength(0)
      expect(view!.remaining).toBe(100_000)
      expect(view!.reservedInFlight).toBe(0)

      const remaining = await prisma.fundingContribution.count({ where: { fundingId } })
      expect(remaining).toBe(0) // 행 자체가 삭제됐다 — ContributionStatus 에 EXPIRED 값이 없다
    })

    it('만료 전 RESERVED 는 그대로 남는다', async () => {
      const fundingId = await createFunding({
        organizerId: organizer,
        receiverId: receiver,
        deadline: future(7 * DAY),
      })
      await createContribution(fundingId, contributorA, 20_000, 'RESERVED', future(10 * MIN))

      const view = await asUser(organizer, () => getFunding!(fundingId))
      expect(view!.contributions).toHaveLength(1)
      expect(view!.reservedInFlight).toBe(20_000)
    })
  })

  describe('getFunding — 정산 트리거 (R1)', () => {
    it('마감 지난 OPEN 은 settleFunding() 을 정확히 1회 호출하고 최신 상태를 반영한다', async () => {
      const fundingId = await createFunding({
        organizerId: organizer,
        receiverId: receiver,
        deadline: past(1 * MIN), // 마감 지남
        status: 'OPEN',
      })
      // settle.ts 가 실제로 하는 일(상태 UPDATE) 중 이 테스트가 필요로 하는 최소한만 흉내 낸다
      h.settleFunding.mockImplementation(async (id: string) => {
        await prisma.funding.update({ where: { id }, data: { status: 'FAILED', failedAt: new Date() } })
        return { outcome: 'FAILED' }
      })

      const view = await asUser(organizer, () => getFunding!(fundingId))

      expect(h.settleFunding).toHaveBeenCalledTimes(1)
      expect(h.settleFunding).toHaveBeenCalledWith(fundingId)
      expect(view!.status).toBe('FAILED') // settle 이후 다시 읽은 최신 상태
    })

    it('같은 펀딩을 다시 조회해도 이미 종착 상태면 settleFunding() 을 또 호출하지 않는다', async () => {
      const fundingId = await createFunding({
        organizerId: organizer,
        receiverId: receiver,
        deadline: past(1 * MIN),
        status: 'FAILED', // 이미 정산됨
      })

      await asUser(organizer, () => getFunding!(fundingId))
      expect(h.settleFunding).not.toHaveBeenCalled()
    })

    it('마감 전 OPEN 은 settleFunding() 을 호출하지 않는다', async () => {
      const fundingId = await createFunding({
        organizerId: organizer,
        receiverId: receiver,
        deadline: future(1 * DAY),
        status: 'OPEN',
      })

      const view = await asUser(organizer, () => getFunding!(fundingId))
      expect(h.settleFunding).not.toHaveBeenCalled()
      expect(view!.status).toBe('OPEN')
    })
  })

  describe('getMyFundings — 내역 탭 2종 (FR-022)', () => {
    it('organized 는 내가 연 것, contributed 는 참여한 것(중복 참여는 한 건으로) — 마감 임박순', async () => {
      const me = await createUser('내역테스트본인')
      const otherOrganizer = await createUser('내역테스트타인')

      const organizedFar = await createFunding({ organizerId: me, receiverId: receiver, deadline: future(10 * DAY) })
      const organizedNear = await createFunding({ organizerId: me, receiverId: receiver, deadline: future(1 * DAY) })
      const contributedFunding = await createFunding({
        organizerId: otherOrganizer,
        receiverId: receiver,
        deadline: future(5 * DAY),
      })
      // 추가 참여(FR-011) — 같은 펀딩에 두 번 참여해도 내역엔 한 건으로 뜬다
      await createContribution(contributedFunding, me, 10_000, 'PAID', future(10 * MIN))
      await createContribution(contributedFunding, me, 5_000, 'RESERVED', future(10 * MIN))

      const result = await asUser(me, () => getMyFundings!())

      expect(result.organized.map((f) => f.id)).toEqual([organizedNear, organizedFar]) // 임박순
      expect(result.contributed).toHaveLength(1)
      expect(result.contributed[0].id).toBe(contributedFunding)
      expect(result.contributed[0].paidTotal).toBe(10_000)
    })

    it('연 것도 참여한 것도 없으면 둘 다 빈 배열', async () => {
      const lonely = await createUser('내역없음')
      const result = await asUser(lonely, () => getMyFundings!())
      expect(result.organized).toEqual([])
      expect(result.contributed).toEqual([])
    })

    it('R1 — 마감 지난 OPEN 은 정산 트리거를 지나 최신 상태로 보인다 (organized·contributed 둘 다)', async () => {
      const me = await createUser('내역R1본인')
      const otherOrganizer = await createUser('내역R1타인')

      const overdueOrganized = await createFunding({
        organizerId: me,
        receiverId: receiver,
        deadline: past(1 * MIN), // 마감 지남
      })
      const overdueContributed = await createFunding({
        organizerId: otherOrganizer,
        receiverId: receiver,
        deadline: past(1 * MIN), // 마감 지남
      })
      await createContribution(overdueContributed, me, 20_000, 'PAID', future(10 * MIN))

      h.settleFunding.mockImplementation(async (id: string) => {
        await prisma.funding.update({ where: { id }, data: { status: 'FAILED', failedAt: new Date() } })
        return { outcome: 'FAILED' }
      })

      const result = await asUser(me, () => getMyFundings!())

      expect(h.settleFunding).toHaveBeenCalledWith(overdueOrganized)
      expect(h.settleFunding).toHaveBeenCalledWith(overdueContributed)
      // 목록이 트리거 이전 상태(OPEN)가 아니라 settle 뒤 최신 상태를 보여준다 — 재조회 확인
      expect(result.organized.find((f) => f.id === overdueOrganized)?.status).toBe('FAILED')
      expect(result.contributed.find((f) => f.id === overdueContributed)?.status).toBe('FAILED')
    })

    it('R2 — 만료된 RESERVED 는 목록 조회로 해제되고 잔여가 풀린다 (organized·contributed 둘 다)', async () => {
      const me = await createUser('내역R2본인')
      const otherOrganizer = await createUser('내역R2타인')

      const organizedFunding = await createFunding({
        organizerId: me,
        receiverId: receiver,
        deadline: future(7 * DAY),
        goalAmount: 100_000,
      })
      await createContribution(organizedFunding, contributorA, 30_000, 'RESERVED', past(1 * MIN)) // 만료

      const contributedFunding = await createFunding({
        organizerId: otherOrganizer,
        receiverId: receiver,
        deadline: future(7 * DAY),
        goalAmount: 100_000,
      })
      await createContribution(contributedFunding, me, 10_000, 'PAID', future(10 * MIN))
      await createContribution(contributedFunding, me, 15_000, 'RESERVED', past(1 * MIN)) // 만료

      const result = await asUser(me, () => getMyFundings!())

      const organizedCard = result.organized.find((f) => f.id === organizedFunding)
      expect(organizedCard?.remaining).toBe(100_000) // 30000 RESERVED 가 풀려 전액 남았다

      const contributedCard = result.contributed.find((f) => f.id === contributedFunding)
      expect(contributedCard?.paidTotal).toBe(10_000)
      expect(contributedCard?.remaining).toBe(100_000 - 10_000) // 15000 RESERVED 는 풀렸다

      const remainingRows = await prisma.fundingContribution.count({
        where: { fundingId: { in: [organizedFunding, contributedFunding] }, status: 'RESERVED' },
      })
      expect(remainingRows).toBe(0) // 행 자체가 삭제됐다 (R2)
    })
  })

  describe('getHomeFundings — 주최·수령·참여 중인 OPEN, 마감 임박순 (FR-023)', () => {
    it('OPEN 만, 관련 없는 펀딩은 제외, 정산으로 OPEN 이 아니게 된 것도 제외', async () => {
      const me = await createUser('홈테스트본인')
      const otherOrganizer = await createUser('홈테스트타인')

      const iOrganize = await createFunding({ organizerId: me, receiverId: receiver, deadline: future(3 * DAY) })
      const iReceive = await createFunding({
        organizerId: otherOrganizer,
        receiverId: me,
        deadline: future(1 * DAY),
      })
      const iContribute = await createFunding({
        organizerId: otherOrganizer,
        receiverId: receiver,
        deadline: future(2 * DAY),
      })
      await createContribution(iContribute, me, 5_000, 'PAID', future(10 * MIN))

      const alreadySettled = await createFunding({
        organizerId: me,
        receiverId: receiver,
        deadline: future(1 * DAY),
        status: 'SETTLED',
      })
      const unrelated = await createFunding({
        organizerId: otherOrganizer,
        receiverId: receiver,
        deadline: future(1 * DAY),
      })
      const overdueMine = await createFunding({
        organizerId: me,
        receiverId: receiver,
        deadline: past(1 * MIN), // 마감 지남 — 트리거로 OPEN 이탈
      })
      h.settleFunding.mockImplementation(async (id: string) => {
        await prisma.funding.update({ where: { id }, data: { status: 'FAILED', failedAt: new Date() } })
        return { outcome: 'FAILED' }
      })

      const views = await asUser(me, () => getHomeFundings!())
      const ids = views.map((v) => v.id)

      expect(ids).toContain(iOrganize)
      expect(ids).toContain(iReceive)
      expect(ids).toContain(iContribute)
      expect(ids).not.toContain(alreadySettled) // 처음부터 OPEN 이 아니었다
      expect(ids).not.toContain(unrelated) // 나와 무관
      expect(ids).not.toContain(overdueMine) // 트리거로 FAILED 가 됐다 — R1

      // 마감 임박순: iReceive(1일) < iContribute(2일) < iOrganize(3일)
      const relevant = ids.filter((id) => [iOrganize, iReceive, iContribute].includes(id))
      expect(relevant).toEqual([iReceive, iContribute, iOrganize])
    })

    it('R2 — 만료된 RESERVED 는 홈 목록 조회로도 해제되고 잔여가 풀린다', async () => {
      const me = await createUser('홈R2본인')

      const fundingId = await createFunding({
        organizerId: me,
        receiverId: receiver,
        deadline: future(7 * DAY), // OPEN 유지 — 이 케이스는 R2 만 확인한다
        goalAmount: 100_000,
      })
      await createContribution(fundingId, contributorA, 25_000, 'RESERVED', past(1 * MIN)) // 만료

      const views = await asUser(me, () => getHomeFundings!())

      const card = views.find((v) => v.id === fundingId)
      expect(card).not.toBeUndefined()
      expect(card!.remaining).toBe(100_000) // 25000 RESERVED 가 풀려 전액 남았다

      const remainingRows = await prisma.fundingContribution.count({ where: { fundingId, status: 'RESERVED' } })
      expect(remainingRows).toBe(0) // 행 자체가 삭제됐다 (R2)
    })
  })
})
