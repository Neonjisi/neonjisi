// @vitest-environment node
/**
 * T035 — 선물 요청 생성·취소 통합 테스트 (US3 · FR-013~FR-017 · SC-007)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4 `createGiftRequest` · `cancelGiftRequest`
 *
 * 검사 순서(세션 → 동의 → 친구 active → 활성 결제수단 → 상품 → 자기 자신 → 트랜잭션)가
 * 계약에 "바꾸면 오답"으로 박혀 있다 — 여기서는 위반이 겹치는 입력으로 **앞선 검사의
 * 코드가 이기는지**까지 본다. 성공 시 스냅샷 3종(productSnapshot · receiverDisplayName ·
 * respondDueAt 절대 시각)과 동의 기록(consentAgreedAt · consentVersion), 그리고 수령자
 * `GIFT_REQUEST_RECEIVED` 알림이 **한 트랜잭션**으로 함께 생기는지 확인한다.
 *
 * 실 DB 통합 테스트라 .env.local 이 필요하다. 추가 전제 둘 —
 *   · ①(gnuke/m3-schema)이 merge 되고 `npx prisma generate` 돼 있어야 한다 (GiftRequest 모델)
 *   · `app/gifts/actions/request.ts` 가 import 하는 `app/gifts/actions/shared.ts` 는 D 소유(T018).
 *     origin/main 에 오르기 전까지 이 파일은 아래 probe 로 **실패가 아니라 skip** 된다 —
 *     M2 invite-control.spec.ts 의 화면 probe 와 같은 이유다 (skipped 수를 반드시 본다).
 * 픽스처는 randomUUID 로 격리하고 afterAll 에서 지운다 (accept-invite.test.ts 템플릿).
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

// 호출마다 다른 세션을 묶기 위해 AsyncLocalStorage 로 userId 를 전달한다 (accept-invite.test.ts 와 동일)
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

const hasDatabase = Boolean(process.env.DATABASE_URL)
// lib/prisma 는 임포트 시점에 DATABASE_URL 을 요구하므로 env 로드 뒤에 동적 임포트한다.
const { prisma } = hasDatabase
  ? await import('@/lib/prisma')
  : { prisma: null as unknown as (typeof import('@/lib/prisma'))['prisma'] }

// ① 미병합이면 생성된 클라이언트에 giftRequest 델리게이트가 없다 — 그 상태로 돌리면
// 모든 케이스가 같은 TypeError 로 무너져 진짜 회귀가 묻힌다. 실패 대신 skip + 사유.
const giftDelegate = hasDatabase
  ? (prisma as unknown as Record<string, unknown>).giftRequest
  : undefined
const hasGiftSchema = typeof (giftDelegate as { findFirst?: unknown } | undefined)?.findFirst === 'function'

// D 의 T018(shared.ts)이 없으면 액션 import 자체가 MODULE_NOT_FOUND 다 — 사유를 남기고 skip.
type RequestActions = typeof import('@/app/gifts/actions/request')
let actions: RequestActions | null = null
let importFailure = ''
try {
  actions = await import('@/app/gifts/actions/request')
} catch (e) {
  importFailure = e instanceof Error ? e.message : String(e)
}

const { CONSENT_VERSION } = await import('@/lib/gift/consent')

const skipReason = !hasDatabase
  ? 'DATABASE_URL 미설정 — .env.local 을 확인할 것'
  : !hasGiftSchema
    ? '① gnuke/m3-schema 미병합 — merge 후 `npx prisma generate` 필요 (GiftRequest 모델 없음)'
    : !actions
      ? `request 액션 import 실패 — D 의 T018(app/gifts/actions/shared.ts) 대기 중일 수 있다: ${importFailure}`
      : ''
if (skipReason) console.warn(`[gift-request.test] skip — ${skipReason}`)

describe.skipIf(skipReason !== '')('createGiftRequest · cancelGiftRequest (T035)', () => {
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
      data: { name: `t35-${randomUUID()}`, sortOrder: 9000 },
      select: { id: true },
    })
    categoryIds.push(category.id)
    return category.id
  }

  async function createProduct(
    categoryId: string,
    overrides: { price?: number; isActive?: boolean; imageUrl?: string | null } = {},
  ) {
    const product = await prisma.product.create({
      data: {
        name: `T035 상품 ${randomUUID().slice(0, 8)}`,
        categoryId,
        price: overrides.price ?? 89_000,
        imageUrl: overrides.imageUrl ?? null,
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
        billingKey: `t35-billing-${randomUUID()}`,
        cardBrand: '신한',
        cardLast4: '4821',
        status,
        ...(status === 'DELETED' ? { deletedAt: new Date() } : {}),
      },
      select: { id: true },
    })
    return method.id
  }

  /** 수령자의 취향에 카테고리 하나를 kind 로 표시한다 — unwanted 차단(FR-013 ③) 판정의 원천 */
  async function markTaste(userId: string, categoryId: string, kind: 'WANT' | 'HAVE' | 'UNWANTED') {
    const profile = await prisma.tasteProfile.upsert({
      where: { userId },
      create: { userId, onboardedAt: new Date() },
      update: {},
      select: { id: true },
    })
    await prisma.tasteItem.create({
      data: { profileId: profile.id, kind, categoryId },
    })
  }

  /** userId 의 세션으로 fn 을 실행한다 */
  function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    return h.sessionUser.run(userId, fn)
  }

  function giftRequestsOf(giverId: string) {
    return prisma.giftRequest.findMany({ where: { giverId }, orderBy: { createdAt: 'asc' } })
  }

  function notificationsOf(userId: string) {
    return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  }

  /** 성공 경로의 공통 픽스처 — 활성 친구 · 활성 결제수단 · 허용 상품 */
  async function readyPair(price = 89_000) {
    const giver = await createUser('T035 G')
    const receiver = await createUser('T035 R')
    await befriend(giver.id, receiver.id)
    const paymentMethodId = await addActiveCard(giver.id)
    const categoryId = await createCategory()
    const product = await createProduct(categoryId, { price })
    return { giver, receiver, paymentMethodId, categoryId, product }
  }

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`
  })

  afterAll(async () => {
    // FK 순서를 명시한다 — GiftRequest 가 Product·PaymentMethod 를 참조하고,
    // TasteItem→Category 가 Restrict 라 카테고리는 항목보다 뒤에 지운다.
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.giftRequest.deleteMany({ where: { giverId: { in: userIds } } })
    await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.tasteItem.deleteMany({ where: { profile: { userId: { in: userIds } } } })
    await prisma.tasteProfile.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.friendship.deleteMany({
      where: { OR: [{ requesterId: { in: userIds } }, { addresseeId: { in: userIds } }] },
    })
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.$disconnect()
  })

  it('성공 — 스냅샷 3종·동의 기록이 남고 수령자 GIFT_REQUEST_RECEIVED 알림이 함께 생긴다 (FR-014~FR-016)', async () => {
    const { giver, receiver, paymentMethodId, product } = await readyPair()

    // respondDueAt 이 env(GIFT_RESPOND_TTL)에서 오는지 본다 — 5m 하드코딩이면 여기서 걸린다 (R11)
    const originalTtl = process.env.GIFT_RESPOND_TTL
    Reflect.set(process.env, 'GIFT_RESPOND_TTL', '2m')
    const before = Date.now()
    let result: Awaited<ReturnType<RequestActions['createGiftRequest']>>
    try {
      result = await as(giver.id, () =>
        actions!.createGiftRequest({ receiverId: receiver.id, productId: product.id, consent: true }),
      )
    } finally {
      if (originalTtl === undefined) delete process.env.GIFT_RESPOND_TTL
      else Reflect.set(process.env, 'GIFT_RESPOND_TTL', originalTtl)
    }

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { giftRequestId } = result.data

    const row = await prisma.giftRequest.findUniqueOrThrow({ where: { id: giftRequestId } })
    expect(row).toMatchObject({
      giverId: giver.id,
      receiverId: receiver.id,
      status: 'PENDING',
      resolution: null,
      productId: product.id,
      requestedAmount: product.price,
      paymentMethodId,
      // 스냅샷 3종 (FR-016) — 진행·표시가 이 필드만으로 자립해야 한다
      productSnapshot: { name: product.name, imageUrl: null, price: product.price },
      receiverDisplayName: receiver.displayName,
      // 동의 기록 (FR-015 · SC-007) — 어떤 문구(버전)에 언제 동의했는지
      consentVersion: CONSENT_VERSION,
    })
    expect(row.consentAgreedAt).toBeInstanceOf(Date)
    // 절대 시각 스냅샷 — 생성 시각 + 2분(위에서 넣은 env). 상한은 호출 왕복 여유다
    const ttlMs = row.respondDueAt.getTime() - before
    expect(ttlMs).toBeGreaterThanOrEqual(2 * 60_000 - 1_000)
    expect(ttlMs).toBeLessThan(2 * 60_000 + 60_000)

    // 알림 — 수령자에게만, payload 는 표시용 값 스냅샷 (data-model.md NotificationType)
    const received = await notificationsOf(receiver.id)
    expect(received).toHaveLength(1)
    // payload 는 gift 계열 공통 형태(T015 GiftNotificationPayload) — 알림 목록이 형태 하나만 안다
    expect(received[0]).toMatchObject({
      type: 'GIFT_REQUEST_RECEIVED',
      readAt: null,
      payload: {
        giftRequestId,
        counterpartDisplayName: giver.displayName,
        productName: product.name,
        amount: product.price,
      },
    })
    expect(await notificationsOf(giver.id)).toHaveLength(0)
  })

  it('동의가 참이 아니면 CONSENT_REQUIRED — 다른 검사보다 먼저고, 아무것도 생기지 않는다 (FR-014 · SC-007)', async () => {
    const { giver, receiver, product } = await readyPair()
    // 친구도 아닌 남 — 동의 검사(2)가 친구 검사(3)보다 앞서므로 코드는 CONSENT_REQUIRED 다
    const stranger = await createUser('T035 S')

    const results = await Promise.all([
      as(giver.id, () =>
        actions!.createGiftRequest({ receiverId: receiver.id, productId: product.id, consent: false }),
      ),
      as(giver.id, () =>
        actions!.createGiftRequest({ receiverId: stranger.id, productId: product.id, consent: false }),
      ),
    ])

    for (const result of results) {
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.code).toBe('CONSENT_REQUIRED')
    }
    expect(await giftRequestsOf(giver.id)).toHaveLength(0)
    expect(await notificationsOf(receiver.id)).toHaveLength(0)
  })

  it('활성 친구가 아니면 NOT_FRIENDS — 해제(REMOVED)도 같고, 결제수단 검사보다 먼저다', async () => {
    const giver = await createUser('T035 G')
    const stranger = await createUser('T035 S')
    const removed = await createUser('T035 X')
    await befriend(giver.id, removed.id, 'REMOVED')
    const categoryId = await createCategory()
    const product = await createProduct(categoryId)
    // 결제수단을 일부러 만들지 않는다 — 친구 검사(3)가 결제수단 검사(4)보다 앞선다

    const toStranger = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: stranger.id, productId: product.id, consent: true }),
    )
    const toRemoved = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: removed.id, productId: product.id, consent: true }),
    )

    for (const result of [toStranger, toRemoved]) {
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.code).toBe('NOT_FRIENDS')
    }
    expect(await giftRequestsOf(giver.id)).toHaveLength(0)
  })

  it('활성 결제수단이 없으면 NO_PAYMENT_METHOD — 상품 검사보다 먼저다 (FR-013 ②)', async () => {
    const giver = await createUser('T035 G')
    const receiver = await createUser('T035 R')
    await befriend(giver.id, receiver.id)
    await addActiveCard(giver.id, 'DELETED') // 삭제된 수단만 있다 — 활성이 아니다
    const categoryId = await createCategory()
    await markTaste(receiver.id, categoryId, 'UNWANTED')
    const product = await createProduct(categoryId) // unwanted 상품 — 그래도 4번이 먼저 걸린다

    const result = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: receiver.id, productId: product.id, consent: true }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('NO_PAYMENT_METHOD')
    expect(await giftRequestsOf(giver.id)).toHaveLength(0)
  })

  it('상품이 없거나 isActive=false 면 PRODUCT_UNAVAILABLE — 부재와 비활성을 구분해 알리지 않는다', async () => {
    const { giver, receiver, categoryId } = await readyPair()
    const inactive = await createProduct(categoryId, { isActive: false })

    const missing = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: receiver.id, productId: randomUUID(), consent: true }),
    )
    const off = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: receiver.id, productId: inactive.id, consent: true }),
    )

    for (const result of [missing, off]) {
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.code).toBe('PRODUCT_UNAVAILABLE')
    }
    expect(await giftRequestsOf(giver.id)).toHaveLength(0)
  })

  it('수령자 unwanted 카테고리 상품이면 PRODUCT_UNWANTED — 3중 차단의 최종 지점. have 는 막지 않는다 (R9)', async () => {
    const { giver, receiver, categoryId, product } = await readyPair()
    await markTaste(receiver.id, categoryId, 'UNWANTED')
    const haveCategoryId = await createCategory()
    await markTaste(receiver.id, haveCategoryId, 'HAVE')
    const haveProduct = await createProduct(haveCategoryId)

    const blocked = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: receiver.id, productId: product.id, consent: true }),
    )
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.code).toBe('PRODUCT_UNWANTED')
    expect(await giftRequestsOf(giver.id)).toHaveLength(0)

    // "이미 갖고 있어요"와 "관심 없어요"는 다르다 — have 는 화면 주의 배너일 뿐 생성을 막지 않는다
    const allowed = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: receiver.id, productId: haveProduct.id, consent: true }),
    )
    expect(allowed.ok).toBe(true)
  })

  it('자기 자신에게는 생성되지 않는다 — 검사 순서상 NOT_FRIENDS 로 거부된다 (FR-013 ④)', async () => {
    const giver = await createUser('T035 G')
    await addActiveCard(giver.id)
    const categoryId = await createCategory()
    const product = await createProduct(categoryId)

    const result = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: giver.id, productId: product.id, consent: true }),
    )

    expect(result.ok).toBe(false)
    // 자기 자신과는 활성 친구일 수 없으므로(C4) 3번 검사가 먼저 거른다.
    // 6번 SELF_GIFT 검사와 C7 CHECK 는 그 뒤의 이중 방어다 — 어느 층이든 생성은 0건이어야 한다.
    if (!result.ok) expect(result.error.code).toBe('NOT_FRIENDS')
    expect(await giftRequestsOf(giver.id)).toHaveLength(0)
  })

  it('cancelGiftRequest — PENDING 이면 취소되고 cancelledAt 이 남는다', async () => {
    const { giver, receiver, product } = await readyPair()
    const created = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: receiver.id, productId: product.id, consent: true }),
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const result = await as(giver.id, () =>
      actions!.cancelGiftRequest({ giftRequestId: created.data.giftRequestId }),
    )

    expect(result.ok).toBe(true)
    const row = await prisma.giftRequest.findUniqueOrThrow({
      where: { id: created.data.giftRequestId },
    })
    expect(row.status).toBe('CANCELLED')
    expect(row.cancelledAt).toBeInstanceOf(Date)
  })

  it('PENDING 이 아니면 NOT_CANCELLABLE — 이미 취소·만료된 요청은 다시 취소되지 않는다', async () => {
    const { giver, receiver, product } = await readyPair()
    const created = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: receiver.id, productId: product.id, consent: true }),
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const giftRequestId = created.data.giftRequestId

    const first = await as(giver.id, () => actions!.cancelGiftRequest({ giftRequestId }))
    expect(first.ok).toBe(true)

    const again = await as(giver.id, () => actions!.cancelGiftRequest({ giftRequestId }))
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.error.code).toBe('NOT_CANCELLABLE')

    // 만료로 이미 확정된 요청도 같다 — 종착 상태는 되돌리지 않는다 (도메인 모델 §5)
    await prisma.giftRequest.update({
      where: { id: giftRequestId },
      data: { status: 'EXPIRED', cancelledAt: null, expiredAt: new Date() },
    })
    const expired = await as(giver.id, () => actions!.cancelGiftRequest({ giftRequestId }))
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.error.code).toBe('NOT_CANCELLABLE')
  })

  it('남의 요청·없는 요청은 같은 NOT_OWNER 로 뭉갠다 — 존재를 알리면 id 탐색에 힌트가 된다', async () => {
    const { giver, receiver, product } = await readyPair()
    const created = await as(giver.id, () =>
      actions!.createGiftRequest({ receiverId: receiver.id, productId: product.id, consent: true }),
    )
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const byReceiver = await as(receiver.id, () =>
      actions!.cancelGiftRequest({ giftRequestId: created.data.giftRequestId }),
    )
    const byNobody = await as(receiver.id, () =>
      actions!.cancelGiftRequest({ giftRequestId: randomUUID() }),
    )

    const messages = new Set<string>()
    for (const result of [byReceiver, byNobody]) {
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.error.code).toBe('NOT_OWNER')
      messages.add(result.error.message)
    }
    // 두 경우를 외부에서 구분할 수 없어야 한다 — 문구까지 같다 (M2 알림 읽음 처리와 같은 규칙)
    expect(messages.size).toBe(1)

    // 취소되지 않았다 — 수령자 응답 흐름(④)이 그대로 이어질 수 있어야 한다
    const row = await prisma.giftRequest.findUniqueOrThrow({
      where: { id: created.data.giftRequestId },
    })
    expect(row.status).toBe('PENDING')
  })
})
