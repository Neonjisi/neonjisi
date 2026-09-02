// @vitest-environment node
/**
 * T024 (J④) — 참여 예약·확정의 동시성 통합 테스트 (US2 · SC-001 · research R2)
 * 계약: specs/004-group-funding/contracts/server-actions.md §4 `contributeToFunding`·`cancelReservation`
 *
 * **이 마일스톤의 단일 방어 지점을 판정한다.** 예약이 `FOR UPDATE` 안에서 잔여를 선점하지
 * 않으면, 두 사람이 동시에 남은 금액을 참여했을 때 합계가 목표를 넘는다 — 그리고 화면상으로는
 * 완전히 정상으로 보인다(진행바만 100%를 넘는다). M3 의 `PENDING → PAYING` 잠금과 같은 자리다.
 *
 * 여기서 못 박는 것:
 *  ① 동시 참여 2건 → **합계 ≤ 목표** (진 쪽은 OVER_REMAINING)
 *  ② 잔여를 정확히 나눠 가지는 동시 참여는 **둘 다 성공** — 그리고 조기 성사 settle 은 1회
 *  ③ 만료된 예약은 조회·예약 시점에 해제되어 잔여가 즉시 풀린다 (R2)
 *  ④ 결제 실패 → 예약 해제 (잔여가 영영 잡혀 있지 않다)
 *  ⑤ 추가 참여 허용(FR-011) · RESERVED 취소 · 인가·상태 게이트
 *  ⑥ **대사(reconcile)**: 결제가 나가는 사이 예약이 만료 해제돼도 결제 기록을 잃지 않는다
 *     (M3 lib/dal/payment.ts 의 "결제는 이미 일어났다" 철학)
 *
 * 팀원 파일 대체(M3 선례와 같은 자리):
 *  - `lib/funding/settle.ts`(D, T014) → `vi.mock`. 조기 성사 **호출 1회**만 판정하고 정산
 *    자체(상태·환불·알림)에는 손대지 않는다 — contracts §2 소유 경계.
 *  - `app/fundings/actions/shared.ts`(D, T015) → `vi.mock`(M3 `guarded` 이식본과 같은 동작).
 *  - 결제는 **실물 mock 클라이언트**를 그대로 태운다(R1 규약, 뒷자리 `0000` = 결정론적 실패).
 *    대사 경합만 `chargeBillingKey` 앞뒤에 훅을 끼워 주입한다 — charge 로직 자체는 손대지 않는다.
 *
 * 실 DB 통합 테스트라 .env.local 이 필요하다. 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

vi.setConfig({ testTimeout: 30_000 })

// 동시 호출 각각에 다른 세션을 묶어야 한다 — AsyncLocalStorage 로 비동기 문맥마다 userId 를
// 실어 보내고 getClaims 목이 그것을 읽는다 (M3 gift-respond-concurrent.test.ts 와 같은 방식).
const h = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return {
    sessionUser: new AsyncLocalStorage<string>(),
    settleFunding: vi.fn(),
    /** 결제 왕복 '중간'을 재현하는 주입 지점 — 대사(reconcile) 경합 테스트에서만 채운다 */
    duringCharge: { current: null as null | (() => Promise<void>) },
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

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// D 의 T014 대체 — settle.ts 는 아직 없다. ④는 호출만 하고 실물을 만들지 않는다 (contracts §2).
vi.mock('@/lib/funding/settle', () => ({ settleFunding: h.settleFunding }))

// T015(app/fundings/actions/shared.ts)가 올라 진짜 guarded(STORAGE_FAILED 변환)를 태운다 — 대체 mock 은 걷었다.

// 실물 mock 클라이언트를 그대로 쓰되(R1), 결제 왕복 중간에 경합을 주입할 수 있게 감싼다.
vi.mock('@/lib/portone/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/portone/client')>()
  return {
    ...actual,
    getPortOneClient: () => {
      const client = actual.getPortOneClient()
      return {
        ...client,
        chargeBillingKey: async (input: Parameters<typeof client.chargeBillingKey>[0]) => {
          const hook = h.duringCharge.current
          if (hook) {
            h.duringCharge.current = null
            await hook()
          }
          return client.chargeBillingKey(input)
        },
      }
    },
  }
})

const hasDatabase = Boolean(process.env.DATABASE_URL)
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

const fundingDelegate = hasDatabase ? (prisma as unknown as Record<string, unknown>).funding : undefined
const hasFundingSchema =
  typeof (fundingDelegate as { findUnique?: unknown } | undefined)?.findUnique === 'function'

const skipReason = !hasDatabase
  ? 'DATABASE_URL 미설정 — .env.local 을 확인할 것'
  : !hasFundingSchema
    ? '① gnuke/m4-schema 미병합 — merge 후 `npx prisma generate` 필요 (Funding 모델 없음)'
    : ''
if (skipReason) console.warn(`[funding-cap-concurrent.test] skip — ${skipReason}`)

const { contributeToFunding, cancelReservation } = await import('@/app/fundings/actions/contribute')
const { encryptBillingKey } = await import('@/lib/crypto/billing-key')
const { getPortOneClient } = await import('@/lib/portone/client')

/** 테스트 전용 고정 키 — 실키가 아니다 (gift-charge.test.ts 와 같은 값 규약) */
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64')

const MIN_MS = 60 * 1000
const DAY_MS = 24 * 60 * MIN_MS
const past = (ms: number) => new Date(Date.now() - ms)
const future = (ms: number) => new Date(Date.now() + ms)

const GOOD_CARD_LAST4 = '4821'
/** R1 mock 실패 규약 — 이 카드는 결제가 항상 실패한다 */
const FAILING_CARD_LAST4 = '0000'

/** 경합 창이 좁아 한 번으로는 재현되지 않을 수 있다 — 라운드마다 새 펀딩으로 반복한다 */
const ROUNDS = 3
const RACE_TEST_TIMEOUT = 90_000

function errorCode(result: { ok: boolean; error?: { code: string } }): string | null {
  return result.ok ? null : (result.error?.code ?? null)
}

describe.skipIf(skipReason !== '')('contributeToFunding · cancelReservation — 캡 동시성 (T024)', () => {
  const userIds: string[] = []
  const fundingIds: string[] = []
  let categoryId: string
  let productId: string

  let organizer: string
  let receiver: string
  let contributorA: string
  let contributorB: string
  /** 결제가 항상 실패하는 카드를 가진 참여자 (0000) */
  let contributorFail: string
  /** 결제수단이 아예 없는 참여자 */
  let contributorNoMethod: string
  /** 수령자와 아무 관계가 없는 제3자 — canViewFunding 밖 */
  let stranger: string

  async function createUser(label: string): Promise<string> {
    const id = randomUUID()
    await prisma.user.create({ data: { id, displayName: `${label} ${id.slice(0, 8)}` } })
    userIds.push(id)
    return id
  }

  async function createPaymentMethod(userId: string, cardLast4: string): Promise<void> {
    const issued = await getPortOneClient().issueBillingKey({ userId, cardBrand: '신한', cardLast4 })
    if (!issued.ok) throw new Error(`빌링키 발급 실패: ${issued.reason}`)
    await prisma.paymentMethod.create({
      data: {
        userId,
        provider: 'portone',
        billingKey: encryptBillingKey(issued.billingKey),
        cardBrand: '신한',
        cardLast4,
      },
    })
  }

  async function createFunding(overrides: {
    status?: 'OPEN' | 'SUCCEEDED' | 'SETTLED' | 'FAILED' | 'CANCELLED'
    deadline?: Date
    goalAmount?: number
    minAmount?: number
    organizerId?: string
  } = {}): Promise<string> {
    const id = randomUUID()
    await prisma.funding.create({
      data: {
        id,
        organizerId: overrides.organizerId ?? organizer,
        receiverId: receiver,
        status: overrides.status ?? 'OPEN',
        productId,
        productSnapshot: { name: 'T024 테스트 상품', imageUrl: null, price: 100_000 },
        goalAmount: overrides.goalAmount ?? 100_000,
        minAmount: overrides.minAmount ?? 50_000,
        deadline: overrides.deadline ?? future(7 * DAY_MS),
        receiverDisplayName: 'T024 수령자',
      },
    })
    fundingIds.push(id)
    return id
  }

  async function insertReservation(
    fundingId: string,
    contributorId: string,
    amount: number,
    reservedUntil: Date,
  ): Promise<string> {
    const created = await prisma.fundingContribution.create({
      data: { fundingId, contributorId, amount, status: 'RESERVED', reservedUntil },
      select: { id: true },
    })
    return created.id
  }

  function contributions(fundingId: string) {
    return prisma.fundingContribution.findMany({
      where: { fundingId },
      orderBy: { createdAt: 'asc' },
    })
  }

  function receivedNotificationCount(fundingId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId: organizer,
        type: 'FUNDING_CONTRIBUTION_RECEIVED',
        payload: { path: ['fundingId'], equals: fundingId },
      },
    })
  }

  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
  }

  function stubEnv(): void {
    vi.stubEnv('PORTONE_MODE', 'mock')
    vi.stubEnv('BILLING_KEY_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
    vi.stubEnv('FUNDING_RESERVATION_TTL', '5m')
  }

  beforeAll(async () => {
    stubEnv()
    await prisma.$queryRaw`SELECT 1`

    organizer = await createUser('T024 주최자')
    receiver = await createUser('T024 수령자')
    contributorA = await createUser('T024 참여자A')
    contributorB = await createUser('T024 참여자B')
    contributorFail = await createUser('T024 실패카드')
    contributorNoMethod = await createUser('T024 수단없음')
    stranger = await createUser('T024 무관사용자')

    // 참여자는 수령자의 활성 친구여야 상세를 볼 수 있다 (canViewFunding — R6)
    for (const friend of [contributorA, contributorB, contributorFail, contributorNoMethod]) {
      await prisma.friendship.create({
        data: { requesterId: friend, addresseeId: receiver, status: 'ACTIVE' },
      })
    }

    categoryId = randomUUID()
    await prisma.category.create({ data: { id: categoryId, name: `t024-${categoryId}`, sortOrder: 9600 } })
    productId = randomUUID()
    await prisma.product.create({
      data: { id: productId, name: 'T024 테스트 상품', categoryId, price: 100_000 },
    })

    await createPaymentMethod(organizer, GOOD_CARD_LAST4)
    await createPaymentMethod(contributorA, GOOD_CARD_LAST4)
    await createPaymentMethod(contributorB, GOOD_CARD_LAST4)
    await createPaymentMethod(contributorFail, FAILING_CARD_LAST4)
    await createPaymentMethod(stranger, GOOD_CARD_LAST4)
  })

  beforeEach(() => {
    stubEnv()
    h.duringCharge.current = null
    h.settleFunding.mockReset().mockResolvedValue({ outcome: 'STILL_OPEN' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    const rows = await prisma.fundingContribution.findMany({
      where: { fundingId: { in: fundingIds } },
      select: { id: true },
    })
    await prisma.payment.deleteMany({ where: { fundingContributionId: { in: rows.map((r) => r.id) } } })
    await prisma.fundingContribution.deleteMany({ where: { fundingId: { in: fundingIds } } })
    await prisma.funding.deleteMany({ where: { id: { in: fundingIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] },
    })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.product.deleteMany({ where: { id: productId } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.$disconnect()
  })

  // ── ① 캡 동시성 — 이 세션의 완료 판정 ─────────────────────────────────────────
  it(
    '동시에 잔여를 넘는 참여 2건이 오면 한쪽만 성공하고 합계는 목표를 넘지 않는다 (SC-001)',
    async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const fundingId = await createFunding({ goalAmount: 100_000 })

        const results = await Promise.all([
          as(contributorA, () => contributeToFunding({ fundingId, amount: 60_000 })),
          as(contributorB, () => contributeToFunding({ fundingId, amount: 60_000 })),
        ])

        expect(results.map(errorCode).sort(), `round ${round}`).toEqual(['OVER_REMAINING', null])

        const rows = await contributions(fundingId)
        // 진 쪽의 예약이 남아 있으면 잔여가 영영 잡힌다 — 행은 정확히 1건이어야 한다
        expect(rows, `round ${round}: 참여 행`).toHaveLength(1)
        expect(rows[0].status, `round ${round}`).toBe('PAID')
        expect(rows[0].amount, `round ${round}`).toBe(60_000)

        const total = rows.reduce((sum, row) => sum + row.amount, 0)
        expect(total, `round ${round}: 합계 ≤ 목표`).toBeLessThanOrEqual(100_000)

        // 확정 1건 = 주최자 알림 1건 (R8)
        expect(await receivedNotificationCount(fundingId), `round ${round}: 알림`).toBe(1)
        // 목표 미달이므로 조기 성사는 없다
        expect(h.settleFunding, `round ${round}: settle`).not.toHaveBeenCalled()
      }
    },
    RACE_TEST_TIMEOUT,
  )

  it(
    '동시 참여 2건이 잔여를 정확히 나눠 가지면 둘 다 성공하고 조기 성사 settle 은 1회다',
    async () => {
      for (let round = 0; round < 2; round++) {
        const fundingId = await createFunding({ goalAmount: 100_000 })
        h.settleFunding.mockClear()

        const results = await Promise.all([
          as(contributorA, () => contributeToFunding({ fundingId, amount: 50_000 })),
          as(contributorB, () => contributeToFunding({ fundingId, amount: 50_000 })),
        ])

        expect(results.map(errorCode), `round ${round}`).toEqual([null, null])

        const rows = await contributions(fundingId)
        expect(rows, `round ${round}`).toHaveLength(2)
        expect(rows.every((r) => r.status === 'PAID'), `round ${round}`).toBe(true)
        expect(rows.reduce((s, r) => s + r.amount, 0), `round ${round}`).toBe(100_000)

        // 조기 성사는 목표에 닿은 확정 **한 번**만 부른다 — 두 번 부르면 정산이 두 번 돈다
        expect(h.settleFunding, `round ${round}: settle 횟수`).toHaveBeenCalledTimes(1)
        expect(h.settleFunding).toHaveBeenCalledWith(fundingId)

        // 목표 도달을 알린 쪽의 결과가 GOAL_REACHED 다 (화면 결과 변형용)
        const outcomes = results.map((r) => (r.ok ? r.data.outcome : null)).sort()
        expect(outcomes, `round ${round}`).toEqual(['GOAL_REACHED', 'PAID'])
      }
    },
    RACE_TEST_TIMEOUT,
  )

  // ── ② 예약 만료 지연 해제 (R2) ────────────────────────────────────────────────
  it('만료된 예약이 잡고 있던 잔여는 다음 참여 시점에 풀린다 (R2 — cron 없음)', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })
    const expiredId = await insertReservation(fundingId, contributorB, 100_000, past(MIN_MS))

    // 만료 예약이 목표 전액을 잡고 있지만, 지연 해제를 지나면 잔여는 100_000 이다
    const result = await as(contributorA, () => contributeToFunding({ fundingId, amount: 100_000 }))

    expect(errorCode(result)).toBeNull()
    const rows = await contributions(fundingId)
    expect(rows.map((r) => r.id)).not.toContain(expiredId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('PAID')
    expect(rows[0].contributorId).toBe(contributorA)
  })

  it('아직 만료되지 않은 예약은 잔여를 계속 잡는다 — 초과 참여는 OVER_REMAINING', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })
    const liveId = await insertReservation(fundingId, contributorB, 70_000, future(5 * MIN_MS))

    const result = await as(contributorA, () => contributeToFunding({ fundingId, amount: 40_000 }))

    expect(errorCode(result)).toBe('OVER_REMAINING')
    const rows = await contributions(fundingId)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(liveId)
    expect(await receivedNotificationCount(fundingId)).toBe(0)
  })

  // ── ③ 결제 실패 → 예약 해제 ──────────────────────────────────────────────────
  it('결제가 실패하면 예약이 해제되고 PAYMENT_FAILED — 잔여가 다시 열린다 (0000 카드)', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })

    const failed = await as(contributorFail, () => contributeToFunding({ fundingId, amount: 100_000 }))

    expect(errorCode(failed)).toBe('PAYMENT_FAILED')
    expect(await contributions(fundingId)).toHaveLength(0)
    expect(await receivedNotificationCount(fundingId)).toBe(0)
    expect(h.settleFunding).not.toHaveBeenCalled()

    // 해제된 잔여로 다른 참여자가 전액 참여할 수 있다
    const ok = await as(contributorA, () => contributeToFunding({ fundingId, amount: 100_000 }))
    expect(errorCode(ok)).toBeNull()
    expect(await contributions(fundingId)).toHaveLength(1)
  })

  it('활성 결제수단이 없으면 결제사에 가지 않고 PAYMENT_FAILED — 예약도 남지 않는다', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })

    const result = await as(contributorNoMethod, () =>
      contributeToFunding({ fundingId, amount: 30_000 }),
    )

    expect(errorCode(result)).toBe('PAYMENT_FAILED')
    expect(await contributions(fundingId)).toHaveLength(0)
  })

  // ── ④ 추가 참여 · 결제 기록 ──────────────────────────────────────────────────
  it('같은 사람이 여러 번 참여할 수 있다 (FR-011) — 확정마다 Payment·알림 1건', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })

    const first = await as(contributorA, () => contributeToFunding({ fundingId, amount: 20_000 }))
    const second = await as(contributorA, () => contributeToFunding({ fundingId, amount: 30_000 }))

    expect(errorCode(first)).toBeNull()
    expect(errorCode(second)).toBeNull()

    const rows = await contributions(fundingId)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.amount)).toEqual([20_000, 30_000])
    expect(rows.every((r) => r.status === 'PAID' && r.paidAt !== null)).toBe(true)

    const payments = await prisma.payment.findMany({
      where: { fundingContributionId: { in: rows.map((r) => r.id) } },
    })
    expect(payments).toHaveLength(2)
    expect(payments.every((p) => p.status === 'PAID' && p.giftRequestId === null)).toBe(true)
    expect(payments.reduce((s, p) => s + p.amount, 0)).toBe(50_000)

    expect(await receivedNotificationCount(fundingId)).toBe(2)
    // 목표(100_000) 미달 — 조기 성사 없음
    expect(h.settleFunding).not.toHaveBeenCalled()
  })

  it('조기 성사(순차) — 목표에 닿는 확정에서만 settleFunding 을 1회 부른다', async () => {
    const fundingId = await createFunding({ goalAmount: 60_000, minAmount: 30_000 })

    const first = await as(contributorA, () => contributeToFunding({ fundingId, amount: 30_000 }))
    expect(first.ok && first.data.outcome).toBe('PAID')
    expect(h.settleFunding).not.toHaveBeenCalled()

    const second = await as(contributorB, () => contributeToFunding({ fundingId, amount: 30_000 }))
    expect(second.ok && second.data.outcome).toBe('GOAL_REACHED')
    expect(h.settleFunding).toHaveBeenCalledTimes(1)
    expect(h.settleFunding).toHaveBeenCalledWith(fundingId)

    // 정산 상태·알림은 settle 소유다 — 호출자는 손대지 않는다 (contracts §2)
    const funding = await prisma.funding.findUniqueOrThrow({ where: { id: fundingId } })
    expect(funding.status).toBe('OPEN')
    expect(funding.settledAt).toBeNull()
  })

  // ── ⑤ 대사(reconcile) — 결제 성공과 예약 만료·정산이 교차할 때 ────────────────
  it(
    '결제가 나가는 사이 예약이 만료 해제돼도 결제 기록을 잃지 않는다 (대사 — 같은 id 로 PAID 복원)',
    async () => {
      const fundingId = await createFunding({ goalAmount: 100_000 })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // 결제 왕복 '중간'에 만료 해제가 지나간 상황을 **결정론적으로** 주입한다: 실제 경로와
      // 같은 결과(RESERVED 행 삭제)를 만들되, 시간에 기대지 않는다(TTL 대기 = flaky).
      h.duringCharge.current = async () => {
        await prisma.fundingContribution.deleteMany({ where: { fundingId, status: 'RESERVED' } })
      }

      const result = await as(contributorA, () => contributeToFunding({ fundingId, amount: 40_000 }))

      // 결제는 이미 일어났다 — 실패로 돌려주면 돈만 나가고 기록이 사라진다 (M3 lib/dal/payment.ts)
      expect(errorCode(result)).toBeNull()
      const contributionId = result.ok ? result.data.contributionId : ''

      const rows = await contributions(fundingId)
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(contributionId)
      expect(rows[0].status).toBe('PAID')
      expect(rows[0].amount).toBe(40_000)

      const payments = await prisma.payment.findMany({ where: { fundingContributionId: contributionId } })
      expect(payments).toHaveLength(1)
      expect(payments[0].status).toBe('PAID')
      expect(await receivedNotificationCount(fundingId)).toBe(1)

      // 복원 건은 스키마상 다른 PAID 와 구별되지 않는다 — 구조화 로그가 유일한 단서다
      const restoreLog = errorSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('대사'),
      )
      expect(restoreLog?.[1]).toMatchObject({
        fundingId,
        contributionId,
        amount: 40_000,
        capTotal: 40_000,
        goalAmount: 100_000,
        overGoal: false,
      })
      errorSpy.mockRestore()
    },
  )

  it(
    '복원으로 잔여가 목표를 넘으면 초과 사실이 구조화 로그에 남는다 (정산의 후속 판단 단서)',
    async () => {
      const fundingId = await createFunding({ goalAmount: 100_000 })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // 만료 해제로 풀린 잔여를 그 사이 다른 참여자가 가져간 경우 — 복원하면 목표를 넘는다
      h.duringCharge.current = async () => {
        await prisma.fundingContribution.deleteMany({ where: { fundingId, status: 'RESERVED' } })
        await prisma.fundingContribution.create({
          data: {
            fundingId,
            contributorId: contributorB,
            amount: 100_000,
            status: 'PAID',
            reservedUntil: future(5 * MIN_MS),
            paidAt: new Date(),
          },
        })
      }

      const result = await as(contributorA, () => contributeToFunding({ fundingId, amount: 40_000 }))

      expect(errorCode(result)).toBeNull()
      const contributionId = result.ok ? result.data.contributionId : ''
      const rows = await contributions(fundingId)
      expect(rows).toHaveLength(2)
      expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(140_000)

      const restoreLog = errorSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('대사'),
      )
      expect(restoreLog?.[1]).toMatchObject({
        fundingId,
        contributionId,
        capTotal: 140_000,
        goalAmount: 100_000,
        overGoal: true,
      })
      errorSpy.mockRestore()
    },
  )

  it(
    '예약 이후·확정 이전에 정산이 지나가면 기록을 남기고 settle 을 다시 태운다 (고아 PAID 방지)',
    async () => {
      const fundingId = await createFunding({ goalAmount: 100_000 })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // 결제 왕복 중에 마감·주최자 취소 정산이 지나간 상황: 다른 조회가 settle 을 태워
      // FAILED 로 확정하고 그 시점의 PAID 를 전부 환불한 뒤다 — 이 결제는 그 대상에 없었다.
      h.duringCharge.current = async () => {
        await prisma.funding.updateMany({
          where: { id: fundingId, status: 'OPEN' },
          data: { status: 'FAILED', failedAt: new Date() },
        })
      }

      const result = await as(contributorA, () => contributeToFunding({ fundingId, amount: 40_000 }))

      // 기록은 남긴다 — 결제는 이미 일어났다
      expect(errorCode(result)).toBeNull()
      const contributionId = result.ok ? result.data.contributionId : ''
      const rows = await contributions(fundingId)
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('PAID')

      const payments = await prisma.payment.findMany({ where: { fundingContributionId: contributionId } })
      expect(payments).toHaveLength(1)

      // 목표 미달이라 조기 성사는 아니다 — 그래도 정산을 다시 태워야 환불 경로가 생긴다
      expect(result.ok && result.data.outcome).toBe('PAID')
      expect(h.settleFunding).toHaveBeenCalledTimes(1)
      expect(h.settleFunding).toHaveBeenCalledWith(fundingId)

      const settleLog = errorSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('OPEN 이 아니었다'),
      )
      expect(settleLog?.[1]).toMatchObject({
        fundingId,
        contributionId,
        amount: 40_000,
        fundingStatus: 'FAILED',
      })
      errorSpy.mockRestore()

      // 정산 상태 자체는 settle 소유다 — 확정이 상태를 되돌리지 않았는지 확인
      const funding = await prisma.funding.findUniqueOrThrow({ where: { id: fundingId } })
      expect(funding.status).toBe('FAILED')
    },
  )

  // ── ⑥ RESERVED 취소 ─────────────────────────────────────────────────────────
  it('본인의 RESERVED 예약은 취소할 수 있고 잔여가 즉시 풀린다', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })
    const reservationId = await insertReservation(fundingId, contributorA, 100_000, future(5 * MIN_MS))

    const result = await as(contributorA, () => cancelReservation({ contributionId: reservationId }))

    expect(errorCode(result)).toBeNull()
    expect(await contributions(fundingId)).toHaveLength(0)

    // 풀린 잔여로 전액 참여가 된다
    const after = await as(contributorB, () => contributeToFunding({ fundingId, amount: 100_000 }))
    expect(errorCode(after)).toBeNull()
  })

  it('남의 예약·없는 예약은 같은 NOT_OWNER — 존재를 흘리지 않는다', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })
    const reservationId = await insertReservation(fundingId, contributorA, 40_000, future(5 * MIN_MS))

    const byOther = await as(contributorB, () => cancelReservation({ contributionId: reservationId }))
    const missing = await as(contributorA, () => cancelReservation({ contributionId: randomUUID() }))
    const malformed = await as(contributorA, () => cancelReservation({ contributionId: 'not-a-uuid' }))

    expect(errorCode(byOther)).toBe('NOT_OWNER')
    expect(errorCode(missing)).toBe('NOT_OWNER')
    expect(errorCode(malformed)).toBe('NOT_OWNER')
    expect(await contributions(fundingId)).toHaveLength(1)
  })

  it('이미 확정(PAID)된 참여는 취소할 수 없다 — NOT_RESERVED', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })
    const paid = await as(contributorA, () => contributeToFunding({ fundingId, amount: 20_000 }))
    const contributionId = paid.ok ? paid.data.contributionId : ''

    const result = await as(contributorA, () => cancelReservation({ contributionId }))

    expect(errorCode(result)).toBe('NOT_RESERVED')
    const rows = await contributions(fundingId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('PAID')
  })

  // ── ⑦ 인가 · 상태 게이트 ─────────────────────────────────────────────────────
  it('canViewFunding 밖(비친구 제3자)은 NOT_ALLOWED — 부재·형식 불량도 같은 답', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })

    const byStranger = await as(stranger, () => contributeToFunding({ fundingId, amount: 10_000 }))
    const missing = await as(contributorA, () =>
      contributeToFunding({ fundingId: randomUUID(), amount: 10_000 }),
    )
    const malformed = await as(contributorA, () =>
      contributeToFunding({ fundingId: 'not-a-uuid', amount: 10_000 }),
    )

    expect(errorCode(byStranger)).toBe('NOT_ALLOWED')
    expect(errorCode(missing)).toBe('NOT_ALLOWED')
    expect(errorCode(malformed)).toBe('NOT_ALLOWED')
    expect(await contributions(fundingId)).toHaveLength(0)
  })

  it('OPEN 이 아닌 펀딩에는 참여할 수 없다 — FUNDING_CLOSED', async () => {
    const fundingId = await createFunding({ status: 'CANCELLED' })

    const result = await as(contributorA, () => contributeToFunding({ fundingId, amount: 10_000 }))

    expect(errorCode(result)).toBe('FUNDING_CLOSED')
    expect(await contributions(fundingId)).toHaveLength(0)
  })

  it('마감이 지난 펀딩은 정산(R1)을 지난 뒤 FUNDING_CLOSED — 참여가 뒤늦게 끼어들지 않는다', async () => {
    const fundingId = await createFunding({ deadline: past(MIN_MS) })
    // 실 settle 이 하는 일 중 이 판정에 필요한 최소한(OPEN → FAILED)만 흉내 낸다
    h.settleFunding.mockImplementation(async (id: string) => {
      await prisma.funding.updateMany({
        where: { id, status: 'OPEN' },
        data: { status: 'FAILED', failedAt: new Date() },
      })
      return { outcome: 'FAILED' }
    })

    const result = await as(contributorA, () => contributeToFunding({ fundingId, amount: 10_000 }))

    expect(errorCode(result)).toBe('FUNDING_CLOSED')
    expect(h.settleFunding).toHaveBeenCalledWith(fundingId)
    expect(await contributions(fundingId)).toHaveLength(0)
  })

  it('금액이 0·음수·정수가 아니면 INVALID_AMOUNTS — 결제까지 가지 않는다', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })

    for (const amount of [0, -1_000, 10.5, Number.NaN]) {
      const result = await as(contributorA, () => contributeToFunding({ fundingId, amount }))
      expect(errorCode(result), `amount=${amount}`).toBe('INVALID_AMOUNTS')
    }
    expect(await contributions(fundingId)).toHaveLength(0)
  })

  it('잔여를 넘는 단독 참여는 OVER_REMAINING — 예약이 남지 않는다', async () => {
    const fundingId = await createFunding({ goalAmount: 100_000 })
    const paid = await as(contributorA, () => contributeToFunding({ fundingId, amount: 80_000 }))
    expect(errorCode(paid)).toBeNull()

    const over = await as(contributorB, () => contributeToFunding({ fundingId, amount: 30_000 }))

    expect(errorCode(over)).toBe('OVER_REMAINING')
    const rows = await contributions(fundingId)
    expect(rows).toHaveLength(1)
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(80_000)
  })
})
