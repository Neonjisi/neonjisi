// @vitest-environment node
/**
 * T019 — 펀딩 개설 통합 테스트 (US1 · FR-001~FR-005 · SC-005)
 * 계약: specs/004-group-funding/contracts/server-actions.md §4 `createFunding`
 *
 * 검사 순서(세션 → 수령자 → 금액 → 마감 → (개설자≠수령자) 동의·결제수단 → 생성)가
 * 계약에 "바꾸면 오답"으로 박혀 있다 — 위반이 겹치는 입력으로 **앞선 검사의 코드가
 * 이기는지**까지 본다. 성공 시 스냅샷 2종(productSnapshot · receiverDisplayName)과
 * 개설자=수령자면 `minAmount := goalAmount` 강제(C10 과 이중 방어)를 확인한다.
 *
 * 실 DB 통합 테스트라 .env.local 이 필요하다. 추가 전제 —
 *   · ①(gnuke/m4-schema)이 merge 되고 `npx prisma generate` 돼 있어야 한다 (Funding 모델)
 *   · `app/fundings/actions/create.ts` 가 import 하는 `app/fundings/actions/shared.ts` 는
 *     D 소유(T015). origin/main 에 오르기 전까지는 vi.mock 으로 대체한다(M3 ③ 선례,
 *     gift-request.test.ts 5f66621 의 모양 그대로) — **파일은 만들지 않는다**.
 * 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다 (gift-request.test.ts 템플릿).
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

{
  const nodeEnv = process.env.NODE_ENV
  Reflect.set(process.env, 'NODE_ENV', 'development')
  loadEnvConfig(process.cwd())
  Reflect.set(process.env, 'NODE_ENV', nodeEnv)
}

// 호출마다 다른 세션을 묶기 위해 AsyncLocalStorage 로 userId 를 전달한다 (gift-request.test.ts 와 동일)
const h = await vi.hoisted(async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return { sessionUser: new AsyncLocalStorage<string>() }
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

// D 소유 T015(app/fundings/actions/shared.ts)가 origin/main 에 오르기 전까지 M3
// gift-request.test.ts(5f66621) 와 같은 모양으로 대체한다 — **파일은 만들지 않는다**.
// T015 가 실제로 오르면 이 mock 을 지워 진짜 guarded(STORAGE_FAILED 변환)를 태운다.
vi.mock('@/app/fundings/actions/shared', () => ({
  failure: (error: { code: string; message: string }) => ({ ok: false, error }),
  guarded: async (message: string, run: () => Promise<unknown>) => {
    try {
      return await run()
    } catch (e) {
      console.error('[funding-create.test mock guarded] 예상 못 한 예외 — STORAGE_FAILED 변환', e)
      return { ok: false, error: { code: 'STORAGE_FAILED', message } }
    }
  },
}))

// 이 머신에서 실 DB 왕복이 느려 기본 5초를 넘는 케이스가 있다(로직 문제 아님) — M3 선례대로 상향
vi.setConfig({ testTimeout: 30_000 })

const hasDatabase = Boolean(process.env.DATABASE_URL)
// lib/prisma 는 임포트 시점에 DATABASE_URL 을 요구하므로 env 로드 뒤에 동적 임포트한다.
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

// ① 미병합이면 생성된 클라이언트에 funding 델리게이트가 없다 — 실패 대신 skip + 사유.
const fundingDelegate = hasDatabase
  ? (prisma as unknown as Record<string, unknown>).funding
  : undefined
const hasFundingSchema = typeof (fundingDelegate as { findFirst?: unknown } | undefined)?.findFirst === 'function'

type CreateActions = typeof import('@/app/fundings/actions/create')
let actions: CreateActions | null = null
let importFailure = ''
try {
  actions = await import('@/app/fundings/actions/create')
} catch (e) {
  importFailure = e instanceof Error ? e.message : String(e)
}

const { FUNDING_CONSENT_VERSION } = await import('@/lib/funding/consent')

const skipReason = !hasDatabase
  ? 'DATABASE_URL 미설정 — .env.local 을 확인할 것'
  : !hasFundingSchema
    ? '① gnuke/m4-schema 미병합 — merge 후 `npx prisma generate` 필요 (Funding 모델 없음)'
    : !actions
      ? `create 액션 import 실패 — T019(app/fundings/actions/create.ts) 미구현일 수 있다: ${importFailure}`
      : ''
if (skipReason) console.warn(`[funding-create.test] skip — ${skipReason}`)

describe.skipIf(skipReason !== '')('createFunding (T019)', () => {
  const userIds: string[] = []
  const categoryIds: string[] = []
  const productIds: string[] = []

  async function createUser(label: string): Promise<{ id: string; displayName: string }> {
    const id = randomUUID()
    const displayName = `${label} ${id.slice(0, 8)}`
    await prisma.user.create({ data: { id, displayName } })
    userIds.push(id)
    return { id, displayName }
  }

  async function befriend(a: string, b: string, status: 'ACTIVE' | 'REMOVED' = 'ACTIVE') {
    return prisma.friendship.create({
      data: {
        requesterId: a,
        addresseeId: b,
        status,
        ...(status === 'REMOVED' ? { removedAt: new Date(), removedBy: a } : {}),
      },
    })
  }

  async function createCategory(): Promise<string> {
    const category = await prisma.category.create({
      data: { name: `t19-${randomUUID()}`, sortOrder: 9000 },
      select: { id: true },
    })
    categoryIds.push(category.id)
    return category.id
  }

  async function createProduct(
    categoryId: string,
    overrides: { price?: number; isActive?: boolean } = {},
  ) {
    const product = await prisma.product.create({
      data: {
        name: `T019 상품 ${randomUUID().slice(0, 8)}`,
        categoryId,
        price: overrides.price ?? 300_000,
        imageUrl: null,
        isActive: overrides.isActive ?? true,
      },
    })
    productIds.push(product.id)
    return product
  }

  async function addActiveCard(
    userId: string,
    status: 'ACTIVE' | 'EXPIRED' | 'DELETED' = 'ACTIVE',
  ): Promise<string> {
    const method = await prisma.paymentMethod.create({
      data: {
        userId,
        provider: 'portone',
        billingKey: `t19-billing-${randomUUID()}`,
        cardBrand: '신한',
        cardLast4: '4821',
        status,
        ...(status === 'DELETED' ? { deletedAt: new Date() } : {}),
      },
      select: { id: true },
    })
    return method.id
  }

  /** userId 의 세션으로 fn 을 실행한다 */
  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
  }

  function fundingsOf(organizerId: string) {
    return prisma.funding.findMany({ where: { organizerId }, orderBy: { createdAt: 'asc' } })
  }

  function futureDeadline(days = 7): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  }

  /** 성공 경로의 공통 픽스처 — 활성 친구 · 활성 결제수단 · 상품 (친구에게 분기) */
  async function readyPair(price = 300_000) {
    const organizer = await createUser('T019 O')
    const receiver = await createUser('T019 R')
    await befriend(organizer.id, receiver.id)
    const paymentMethodId = await addActiveCard(organizer.id)
    const categoryId = await createCategory()
    const product = await createProduct(categoryId, { price })
    return { organizer, receiver, paymentMethodId, categoryId, product }
  }

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`
  })

  afterAll(async () => {
    // FK 순서 — Funding 이 Product·PaymentMethod·User 를 참조한다.
    await prisma.funding.deleteMany({ where: { organizerId: { in: userIds } } })
    await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] },
    })
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })

  it('성공(친구에게) — 스냅샷 2종·동의 기록이 남는다 (FR-004·FR-005)', async () => {
    const { organizer, receiver, paymentMethodId, product } = await readyPair()
    const deadline = futureDeadline()
    const before = Date.now()

    const result = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: receiver.id,
        productId: product.id,
        goalAmount: 300_000,
        minAmount: 200_000,
        deadline,
        consent: true,
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { fundingId } = result.data

    const row = await prisma.funding.findUniqueOrThrow({ where: { id: fundingId } })
    expect(row).toMatchObject({
      organizerId: organizer.id,
      receiverId: receiver.id,
      status: 'OPEN',
      productId: product.id,
      goalAmount: 300_000,
      minAmount: 200_000,
      organizerPaymentMethodId: paymentMethodId,
      // 스냅샷 2종 (FR-005) — 진행·표시가 이 필드만으로 자립해야 한다
      productSnapshot: { name: product.name, imageUrl: null, price: product.price },
      receiverDisplayName: receiver.displayName,
      // 동의 기록 (FR-004) — 어떤 문구(버전)에 언제 동의했는지
      consentVersion: FUNDING_CONSENT_VERSION,
    })
    expect(row.organizerConsentAgreedAt).toBeInstanceOf(Date)
    expect(row.organizerConsentAgreedAt!.getTime()).toBeGreaterThanOrEqual(before)
    expect(row.deadline.getTime()).toBe(deadline.getTime())
  })

  it('개설자=수령자면 minAmount 입력이 달라도 goalAmount 로 강제되고, 동의·결제수단 없이 성공한다 (FR-003)', async () => {
    const organizer = await createUser('T019 SELF')
    const categoryId = await createCategory()
    const product = await createProduct(categoryId, { price: 150_000 })
    // 결제수단을 일부러 만들지 않는다 — 자기 자신이면 5번 검사(동의·결제수단)를 건너뛴다

    const result = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: organizer.id,
        productId: product.id,
        goalAmount: 150_000,
        minAmount: 50_000, // goalAmount 와 다르게 입력해도 강제된다
        deadline: futureDeadline(),
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const row = await prisma.funding.findUniqueOrThrow({ where: { id: result.data.fundingId } })
    expect(row.minAmount).toBe(row.goalAmount)
    expect(row.minAmount).toBe(150_000)
    expect(row.organizerPaymentMethodId).toBeNull()
    expect(row.organizerConsentAgreedAt).toBeNull()
    expect(row.consentVersion).toBeNull()
  })

  it('수령자가 활성 친구가 아니면 NOT_FRIENDS — 해제(REMOVED)도 같고, 금액 검사보다 먼저다', async () => {
    const organizer = await createUser('T019 O')
    const stranger = await createUser('T019 S')
    const removed = await createUser('T019 X')
    await befriend(organizer.id, removed.id, 'REMOVED')
    const categoryId = await createCategory()
    const product = await createProduct(categoryId)

    const toStranger = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: stranger.id,
        productId: product.id,
        goalAmount: 100, // 금액이 터무니없어도 친구 검사가 먼저 걸린다
        minAmount: 999_999,
        deadline: new Date(Date.now() - 1000), // 마감도 과거여도 친구 검사가 먼저다
        consent: false,
      }),
    )
    const toRemoved = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: removed.id,
        productId: product.id,
        goalAmount: 300_000,
        minAmount: 200_000,
        deadline: futureDeadline(),
        consent: true,
      }),
    )

    for (const result of [toStranger, toRemoved]) {
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.code).toBe('NOT_FRIENDS')
    }
    expect(await fundingsOf(organizer.id)).toHaveLength(0)
  })

  it('minAmount 가 goalAmount 를 넘으면 INVALID_AMOUNTS — 마감 검사보다 먼저다 (FR-002)', async () => {
    const { organizer, receiver, product } = await readyPair()

    const result = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: receiver.id,
        productId: product.id,
        goalAmount: 100_000,
        minAmount: 100_001,
        deadline: new Date(Date.now() - 1000), // 마감도 과거지만 금액 검사가 먼저다
        consent: true,
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_AMOUNTS')
    expect(await fundingsOf(organizer.id)).toHaveLength(0)
  })

  it('마감이 현재 이전이면 INVALID_DEADLINE — 동의 검사보다 먼저다', async () => {
    const { organizer, receiver, product } = await readyPair()

    const result = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: receiver.id,
        productId: product.id,
        goalAmount: 300_000,
        minAmount: 200_000,
        deadline: new Date(Date.now() - 1000),
        consent: false, // 동의도 없지만 마감 검사가 먼저다
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INVALID_DEADLINE')
    expect(await fundingsOf(organizer.id)).toHaveLength(0)
  })

  it('개설자≠수령자인데 동의가 없으면 CONSENT_REQUIRED — 결제수단 검사보다 먼저다 (FR-004)', async () => {
    const { organizer, receiver, product } = await readyPair()

    const result = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: receiver.id,
        productId: product.id,
        goalAmount: 300_000,
        minAmount: 200_000,
        deadline: futureDeadline(),
        consent: false,
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CONSENT_REQUIRED')
    expect(await fundingsOf(organizer.id)).toHaveLength(0)
  })

  it('개설자≠수령자인데 활성 결제수단이 없으면 NO_PAYMENT_METHOD (FR-004)', async () => {
    const organizer = await createUser('T019 O')
    const receiver = await createUser('T019 R')
    await befriend(organizer.id, receiver.id)
    await addActiveCard(organizer.id, 'DELETED') // 삭제된 수단만 있다 — 활성이 아니다
    const categoryId = await createCategory()
    const product = await createProduct(categoryId)

    const result = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: receiver.id,
        productId: product.id,
        goalAmount: 300_000,
        minAmount: 200_000,
        deadline: futureDeadline(),
        consent: true,
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NO_PAYMENT_METHOD')
    expect(await fundingsOf(organizer.id)).toHaveLength(0)
  })

  it('비친구 + 금액 0(또는 음수) 조합이어도 NOT_FRIENDS 가 이긴다 — 검사 2 가 검사 3(금액)보다 먼저다', async () => {
    const organizer = await createUser('T019 O')
    const stranger = await createUser('T019 S')
    const categoryId = await createCategory()
    const product = await createProduct(categoryId)
    // 결제수단도 일부러 안 만든다 — 5번(동의·결제수단)까지 갈 것도 없이 2번에서 끝나야 한다

    const zero = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: stranger.id,
        productId: product.id,
        goalAmount: 300_000,
        minAmount: 0, // `.positive()` 스키마 검사였다면 여기서 STORAGE_FAILED 로 새어나간다
        deadline: futureDeadline(),
        consent: false,
      }),
    )
    const negative = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: stranger.id,
        productId: product.id,
        goalAmount: 300_000,
        minAmount: -100_000,
        deadline: futureDeadline(),
        consent: false,
      }),
    )

    for (const result of [zero, negative]) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('NOT_FRIENDS')
    }
    expect(await fundingsOf(organizer.id)).toHaveLength(0)
  })

  it('상품이 비활성(isActive=false)이면 STORAGE_FAILED — 존재 여부를 구분해 알리지 않는다', async () => {
    const { organizer, receiver, categoryId } = await readyPair()
    const inactive = await createProduct(categoryId, { isActive: false })

    const result = await as(organizer.id, () =>
      actions!.createFunding({
        receiverId: receiver.id,
        productId: inactive.id,
        goalAmount: 300_000,
        minAmount: 200_000,
        deadline: futureDeadline(),
        consent: true,
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('STORAGE_FAILED')
    expect(await fundingsOf(organizer.id)).toHaveLength(0)
  })
})
