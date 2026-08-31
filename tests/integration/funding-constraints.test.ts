// @vitest-environment node
/**
 * T006 / T007 — C9·C10·FK 제약 검증 (specs/004 data-model.md, FR-002·FR-003·FR-006)
 *
 * Funding·Payment 의 세 불변식은 Prisma 문법으로 표현되지 않아 raw SQL 마이그레이션으로 넣었다 (R4):
 *   C9  funding_min_le_goal           — CHECK minAmount <= goalAmount
 *   C10 funding_self_full_goal        — CHECK organizerId <> receiverId OR minAmount = goalAmount
 *   —   payment_funding_contribution_fk — FK Payment.fundingContributionId -> FundingContribution.id
 *
 * 애플리케이션 검사만 있는 불변식은 조용히 새고 화면으로는 알 수 없다 — M1 T010/T011 · M2 C3/C4 ·
 * M3 C5~C8 의 교훈. 이 테스트가 제약이 **실제로 걸렸는지** 판정하는 유일한 장치다. T007 이 적용되기
 * 전에는 (a)(b)(c) 가 실패해야 정상이다 — `migrate dev`(T005)는 테이블·enum만 만들고, CHECK·FK 는
 * `--create-only` 로 아직 걸지 않았기 때문이다. `db push` 로 만든 DB 에도 세 제약 모두 없다.
 *
 * (d)는 FK 추가가 기존 C8(payment_exactly_one_target, M3)을 깨지 않는지 확인한다 — 두 대상이
 * 모두 실재하는 행을 가리켜도(FK 는 만족) C8 의 XOR 은 여전히 거부해야 한다.
 *
 * 실 DB 에 붙는 통합 테스트라 .env.local 이 필요하다. 4개 워크트리가 같은 DB 를 보므로
 * 픽스처는 randomUUID() 로 격리하고 afterAll 에서 지운다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// DB 통합 테스트는 이 머신에서 느리다 — M3 선례대로 상향한다.
vi.setConfig({ testTimeout: 30_000 })

// Vitest 는 Next 와 달리 .env.local 을 자동으로 읽지 않는다.
// 게다가 @next/env 는 NODE_ENV=test 에서 .env.local 을 의도적으로 건너뛰므로,
// 로드하는 동안만 NODE_ENV 를 우회한다 — 이 테스트는 실 DB 가 전제다.
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

describe.skipIf(!hasDatabase)('C9·C10·FK — Funding·Payment 제약', () => {
  const organizer = randomUUID()
  const receiver = randomUUID()
  const contributor = randomUUID()
  const categoryId = randomUUID()
  const productId = randomUUID()
  const paymentMethodId = randomUUID()
  // 제약 미적용 상태(red)에서는 삽입이 성공해 행이 남으므로, 접두로 추적해 지운다.
  const txPrefix = `mock_test_${randomUUID()}`

  // 유효한 Funding 생성 데이터 — 각 케이스는 여기서 한 필드만 비튼다.
  const validFunding = () => ({
    organizerId: organizer,
    receiverId: receiver,
    productId,
    productSnapshot: { name: '제약 테스트 상품', price: 100000, imageUrl: null },
    goalAmount: 100000,
    minAmount: 50000,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    receiverDisplayName: 'C9C10 제약 테스트 수령자',
  })

  // 유효한 GiftRequest 생성 데이터 — (d) 케이스가 C8(XOR) 회귀 확인용으로만 쓴다.
  const validGiftRequest = () => ({
    giverId: organizer,
    receiverId: receiver,
    productId,
    productSnapshot: { name: '제약 테스트 상품', price: 30000, imageUrl: null },
    requestedAmount: 30000,
    receiverDisplayName: 'C8 회귀 테스트 수신자',
    paymentMethodId,
    consentAgreedAt: new Date(),
    consentVersion: '1',
    respondDueAt: new Date(Date.now() + 5 * 60_000),
  })

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: organizer, displayName: 'M4 제약 테스트 organizer' },
        { id: receiver, displayName: 'M4 제약 테스트 receiver' },
        { id: contributor, displayName: 'M4 제약 테스트 contributor' },
      ],
    })
    await prisma.category.create({
      data: { id: categoryId, name: `펀딩제약테스트-${categoryId}`, sortOrder: 9999 },
    })
    await prisma.product.create({
      data: { id: productId, name: '펀딩 제약 테스트 상품', categoryId, price: 100000 },
    })
    await prisma.paymentMethod.create({
      data: {
        id: paymentMethodId,
        userId: organizer,
        provider: 'portone',
        billingKey: 'test-billing-key',
        cardBrand: 'TEST',
        cardLast4: '9999',
      },
    })
  })

  afterAll(async () => {
    // FK 참조 순서대로 지운다: Payment → Funding(FundingContribution cascade)·GiftRequest →
    // User(PaymentMethod cascade) → Product → Category.
    await prisma.payment.deleteMany({ where: { providerTxId: { startsWith: txPrefix } } })
    await prisma.funding.deleteMany({
      where: { OR: [{ organizerId: organizer }, { receiverId: receiver }] },
    })
    await prisma.giftRequest.deleteMany({
      where: { OR: [{ giverId: organizer }, { receiverId: receiver }] },
    })
    await prisma.user.deleteMany({ where: { id: { in: [organizer, receiver, contributor] } } })
    await prisma.product.deleteMany({ where: { id: productId } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.$disconnect()
  })

  it('(a) C9 — minAmount 가 goalAmount 를 넘는 펀딩을 DB 가 거부한다 (FR-002)', async () => {
    await expect(
      prisma.funding.create({
        data: { ...validFunding(), goalAmount: 100000, minAmount: 100001 },
      }),
    ).rejects.toThrow(/funding_min_le_goal/)
  })

  it('(b) C10 — 개설자=수령자인데 minAmount ≠ goalAmount 인 펀딩을 DB 가 거부한다 (FR-003)', async () => {
    await expect(
      prisma.funding.create({
        data: { ...validFunding(), organizerId: organizer, receiverId: organizer, goalAmount: 100000, minAmount: 50000 },
      }),
    ).rejects.toThrow(/funding_self_full_goal/)
  })

  it('(c) FK — 존재하지 않는 FundingContribution 을 가리키는 Payment 를 DB 가 거부한다 (FR-006)', async () => {
    await expect(
      prisma.payment.create({
        data: {
          provider: 'portone',
          providerTxId: `${txPrefix}_fk`,
          amount: 10000,
          status: 'PAID',
          fundingContributionId: randomUUID(), // 존재하지 않는 참조
        },
      }),
    ).rejects.toThrow(/payment_funding_contribution_fk/)
  })

  it('(d) FK 추가가 C8(XOR) 을 깨지 않는다 — 두 대상이 모두 실재해도 동시 지정은 거부된다', async () => {
    const funding = await prisma.funding.create({ data: validFunding() })
    const contribution = await prisma.fundingContribution.create({
      data: {
        fundingId: funding.id,
        contributorId: contributor,
        amount: 10000,
        reservedUntil: new Date(Date.now() + 5 * 60_000),
      },
    })
    const giftRequest = await prisma.giftRequest.create({ data: validGiftRequest() })

    // 양쪽 FK 가 모두 실재하는 행을 가리켜도(FK 는 만족) C8 은 여전히 XOR 을 요구한다
    await expect(
      prisma.payment.create({
        data: {
          provider: 'portone',
          providerTxId: `${txPrefix}_c8_regression`,
          amount: 10000,
          status: 'PAID',
          giftRequestId: giftRequest.id,
          fundingContributionId: contribution.id,
        },
      }),
    ).rejects.toThrow(/payment_exactly_one_target/)
  })

  it('(e) 정상 경로 — 유효한 FundingContribution 하나만 가리키는 Payment 는 통과한다', async () => {
    const funding = await prisma.funding.create({ data: validFunding() })
    const contribution = await prisma.fundingContribution.create({
      data: {
        fundingId: funding.id,
        contributorId: contributor,
        amount: 30000,
        reservedUntil: new Date(Date.now() + 5 * 60_000),
      },
    })

    const payment = await prisma.payment.create({
      data: {
        provider: 'portone',
        providerTxId: `${txPrefix}_ok`,
        amount: 30000,
        status: 'PAID',
        fundingContributionId: contribution.id, // 정확히 하나의 대상
      },
    })
    expect(payment.fundingContributionId).toBe(contribution.id)
  })

  it('(f) 정상 경로 — 개설자=수령자이고 minAmount = goalAmount 인 펀딩은 통과한다', async () => {
    const funding = await prisma.funding.create({
      data: { ...validFunding(), organizerId: organizer, receiverId: organizer, goalAmount: 80000, minAmount: 80000 },
    })
    expect(funding.minAmount).toBe(funding.goalAmount)
  })
})
