// @vitest-environment node
/**
 * T005 / T007 — C5~C8 제약 검증 (specs/003 data-model.md, FR-021·FR-022·FR-013·FR-033)
 *
 * GiftRequest·Payment 의 네 불변식은 Prisma 문법으로 표현되지 않아 raw SQL 마이그레이션으로 넣었다 (R4):
 *   C5 gift_counter_le_requested  — CHECK counterAmount ≤ requestedAmount
 *                                   (PRD 확정 정책 "최초 요청 금액 이하"의 최종 방어선 — 화면 필터는 1차일 뿐)
 *   C6 gift_counter_all_or_none   — counter 3필드(counterProductId·counterProductSnapshot·counterAmount)는
 *                                   전부 NULL 이거나 전부 NOT NULL
 *   C7 gift_no_self               — CHECK giverId <> receiverId
 *   C8 payment_exactly_one_target — Payment 는 정확히 하나의 대상(giftRequestId XOR fundingContributionId)
 *
 * 애플리케이션 검사만 있는 불변식은 조용히 새고 화면으로는 알 수 없다 — M1 T010/T011 · M2 C3/C4 의 교훈.
 * 이 테스트가 제약이 **실제로 걸렸는지** 판정하는 유일한 장치다. T006 이 적용되기 전에는 (a)(b)(c)(d) 가
 * 실패해야 정상이다. `db push` 로 만든 DB 에도 네 제약 모두 없다.
 *
 * 실 DB 에 붙는 통합 테스트라 .env.local 이 필요하다. 4개 워크트리가 같은 DB 를 보므로
 * 픽스처는 randomUUID() 로 격리하고 afterAll 에서 지운다.
 */
import { randomUUID } from 'node:crypto'
import { loadEnvConfig } from '@next/env'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

describe.skipIf(!hasDatabase)('C5~C8 — GiftRequest·Payment 제약', () => {
  const giver = randomUUID()
  const receiver = randomUUID()
  const categoryId = randomUUID()
  const productId = randomUUID()
  const paymentMethodId = randomUUID()
  // 제약 미적용 상태(red)에서는 삽입이 성공해 행이 남으므로, 접두로 추적해 지운다.
  const txPrefix = `mock_test_${randomUUID()}`

  // 유효한 GiftRequest 생성 데이터 — 각 케이스는 여기서 한 필드만 비튼다.
  const validRequest = () => ({
    giverId: giver,
    receiverId: receiver,
    productId,
    productSnapshot: { name: '제약 테스트 상품', price: 30000, imageUrl: null },
    requestedAmount: 30000,
    receiverDisplayName: 'C5C8 제약 테스트 수신자',
    paymentMethodId,
    consentAgreedAt: new Date(),
    consentVersion: '1',
    respondDueAt: new Date(Date.now() + 5 * 60_000),
  })

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: giver, displayName: 'C5C8 제약 테스트 giver' },
        { id: receiver, displayName: 'C5C8 제약 테스트 receiver' },
      ],
    })
    await prisma.category.create({
      data: { id: categoryId, name: `제약테스트-${categoryId}`, sortOrder: 9999 },
    })
    await prisma.product.create({
      data: { id: productId, name: '제약 테스트 상품', categoryId, price: 30000 },
    })
    await prisma.paymentMethod.create({
      data: {
        id: paymentMethodId,
        userId: giver,
        provider: 'portone',
        billingKey: 'test-billing-key',
        cardBrand: 'TEST',
        cardLast4: '9999',
      },
    })
  })

  afterAll(async () => {
    // FK 가 Restrict 라 참조 순서대로 지운다: Payment → GiftRequest → User(수단 Cascade) → Product → Category.
    await prisma.payment.deleteMany({ where: { providerTxId: { startsWith: txPrefix } } })
    await prisma.giftRequest.deleteMany({
      where: { OR: [{ giverId: giver }, { receiverId: receiver }] },
    })
    await prisma.user.deleteMany({ where: { id: { in: [giver, receiver] } } })
    await prisma.product.deleteMany({ where: { id: productId } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.$disconnect()
  })

  it('(a) C5 — 요청 금액을 넘는 대안 금액을 DB 가 거부한다 (FR-021)', async () => {
    await expect(
      prisma.giftRequest.create({
        data: {
          ...validRequest(),
          // C6 을 만족시키기 위해 3필드 전부 채우고, 금액만 상한을 넘긴다
          counterProductId: productId,
          counterProductSnapshot: { name: '제약 테스트 상품', price: 30001, imageUrl: null },
          counterAmount: 30001, // requestedAmount(30000) 초과
          counteredAt: new Date(),
        },
      }),
    ).rejects.toThrow(/gift_counter_le_requested/)
  })

  it('(b) C6 — counter 3필드의 부분 NULL 을 DB 가 거부한다 (FR-022)', async () => {
    await expect(
      prisma.giftRequest.create({
        data: {
          ...validRequest(),
          counterAmount: 10000, // counterProductId·counterProductSnapshot 은 NULL — 반쪽 대안
        },
      }),
    ).rejects.toThrow(/gift_counter_all_or_none/)
  })

  it('(c) C8 — 양쪽 대상이 있거나 아무 대상도 없는 Payment 를 DB 가 거부한다 (FR-033)', async () => {
    const request = await prisma.giftRequest.create({ data: validRequest() })

    // 양쪽 FK — gift 와 funding 에 동시에 연결될 수 없다
    await expect(
      prisma.payment.create({
        data: {
          provider: 'portone',
          providerTxId: `${txPrefix}_both`,
          amount: 30000,
          status: 'PAID',
          giftRequestId: request.id,
          fundingContributionId: randomUUID(), // 컬럼만 선반영 (R4) — FK 없음
        },
      }),
    ).rejects.toThrow(/payment_exactly_one_target/)

    // 무FK — 대상 없는 결제 기록은 존재할 수 없다
    await expect(
      prisma.payment.create({
        data: {
          provider: 'portone',
          providerTxId: `${txPrefix}_none`,
          amount: 30000,
          status: 'PAID',
        },
      }),
    ).rejects.toThrow(/payment_exactly_one_target/)
  })

  it('(d) C7 — 자기 자신에게 보내는 요청을 DB 가 거부한다 (FR-013 ④)', async () => {
    await expect(
      prisma.giftRequest.create({
        data: { ...validRequest(), receiverId: giver }, // giver = receiver
      }),
    ).rejects.toThrow(/gift_no_self/)
  })

  it('(e) 정상 경로 — 상한 이하의 온전한 대안과 단일 대상 Payment 는 통과한다', async () => {
    // 제약이 과하게 걸려 정상 흐름(J14 대안 확정 → D5 결제 기록)을 막지 않는지 확인한다.
    const countered = await prisma.giftRequest.create({
      data: {
        ...validRequest(),
        counterProductId: productId,
        counterProductSnapshot: { name: '제약 테스트 상품', price: 20000, imageUrl: null },
        counterAmount: 20000, // 상한 이하
        counteredAt: new Date(),
      },
    })
    expect(countered.counterAmount).toBe(20000)

    const payment = await prisma.payment.create({
      data: {
        provider: 'portone',
        providerTxId: `${txPrefix}_ok`,
        amount: 20000,
        status: 'PAID',
        giftRequestId: countered.id, // 정확히 하나의 대상
      },
    })
    expect(payment.giftRequestId).toBe(countered.id)
  })
})
