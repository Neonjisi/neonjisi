import { prisma } from '@/lib/prisma'

/**
 * 펀딩 개설 DAL (T019) — 계약: specs/004-group-funding/contracts/server-actions.md §4 `createFunding`
 *
 * `app/fundings/actions/create.ts` 전용 프리미티브다. 화면·Server Action 은 `@/lib/prisma` 를
 * 직접 쓰지 못하므로(lint 규칙 — M3 커밋 12f4ff8 "prisma는 lib/dal/에서만") 생성 검증에
 * 필요한 조회와 쓰기를 여기 둔다 — M3 `lib/dal/gift-request.ts` 와 같은 자리다.
 *
 * 조회(getFunding·getMyFundings·getHomeFundings)는 `lib/dal/funding.ts`(② 소유, T016)가
 * 맡는다 — 모든 조회가 정산 트리거(R1)·예약 만료 해제(R2)를 경유해야 하기 때문이다.
 * 이 파일은 **생성만** 둔다 — 총액 합산(R3)·상태 전이는 이 파일 밖(lib/funding/totals.ts ·
 * lib/funding/state.ts, ②)의 몫이고 개설 시점에는 필요하지도 않다.
 */

/**
 * 두 사용자 사이 활성 관계 — 방향 무관 (contracts §4 검사 2).
 * `lib/dal/friend.ts`(H 소유, requireActiveFriendship)가 아직 없어 M3 gift-request.ts 와
 * 같은 방식으로 이 파일에 boolean 프리미티브를 따로 둔다 — 그 함수가 오르면 교체 후보다.
 */
export async function hasActiveFriendship(userA: string, userB: string): Promise<boolean> {
  const found = await prisma.friendship.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [
        { requesterId: userA, addresseeId: userB },
        { requesterId: userB, addresseeId: userA },
      ],
    },
    select: { id: true },
  })
  return found !== null
}

/**
 * 개설자의 활성 결제수단 하나 (FR-004 — 개설자≠수령자일 때만 쓰인다). 없으면 null →
 * NO_PAYMENT_METHOD. 빌링키는 사용자당 재사용이라 보통 1건이다 — 여러 건이면 최신 등록을 쓴다.
 */
export async function findActivePaymentMethodId(userId: string): Promise<string | null> {
  const method = await prisma.paymentMethod.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return method?.id ?? null
}

export type ProductForFunding = {
  id: string
  name: string
  imageUrl: string | null
  price: number
  isActive: boolean
}

/**
 * 개설 대상 상품 — productSnapshot(FR-005) 원천. 부재면 null → 호출부가 STORAGE_FAILED 로
 * 뭉갠다. `isActive` 도 함께 조회한다 — 판정은 호출부(action)가 한다(M3
 * `findProductForGift` + `!product || !product.isActive` 패턴, lib/dal/gift-request.ts:59-64
 * · app/gifts/actions/request.ts:138-140).
 */
export async function findProductForFunding(productId: string): Promise<ProductForFunding | null> {
  return prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, imageUrl: true, price: true, isActive: true },
  })
}

/** 스냅샷·표시명 조회 — 생성 시점에 한 번만 읽는다 (M3 R5 와 같은 원칙) */
export async function findUserDisplayName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  })
  return user?.displayName ?? null
}

export type CreateFundingInput = {
  organizerId: string
  receiverId: string
  product: Pick<ProductForFunding, 'id' | 'name' | 'imageUrl' | 'price'>
  goalAmount: number
  /** 검사 3(개설자=수령자면 goalAmount 강제)을 이미 통과한 최종 값 */
  minAmount: number
  deadline: Date
  /** D3 스냅샷 — 관계가 해제돼도 "누구를 위한 펀딩인지"가 렌더된다 (FR-005) */
  receiverDisplayName: string
  /** 개설자=수령자면 null (차액이 구조적으로 없다 — FR-003) */
  organizerPaymentMethodId: string | null
  organizerConsentAgreedAt: Date | null
  consentVersion: string | null
}

/**
 * 생성 (contracts §4 검사 6). 알림은 만들지 않는다 — funding 알림 4종(FR-020)에 개설
 * 알림은 없다(참여·성사·미달·차액 뿐). 단일 insert 라 별도 트랜잭션이 필요 없다.
 */
export async function createFundingRow(input: CreateFundingInput): Promise<{ fundingId: string }> {
  const funding = await prisma.funding.create({
    data: {
      organizerId: input.organizerId,
      receiverId: input.receiverId,
      productId: input.product.id,
      productSnapshot: {
        name: input.product.name,
        imageUrl: input.product.imageUrl,
        price: input.product.price,
      },
      goalAmount: input.goalAmount,
      minAmount: input.minAmount,
      deadline: input.deadline,
      receiverDisplayName: input.receiverDisplayName,
      organizerPaymentMethodId: input.organizerPaymentMethodId,
      organizerConsentAgreedAt: input.organizerConsentAgreedAt,
      consentVersion: input.consentVersion,
    },
    select: { id: true },
  })
  return { fundingId: funding.id }
}
