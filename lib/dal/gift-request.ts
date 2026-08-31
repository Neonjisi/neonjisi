import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { transitionGiftRequest, type GiftNotificationPayload } from '@/lib/gift/state'

/**
 * 선물 요청 생성·취소 DAL (T038 · US3) — 계약: specs/003-gift-request-payment/contracts/server-actions.md §4
 *
 * `app/gifts/actions/request.ts` 전용 프리미티브다. 화면·Server Action 은 `@/lib/prisma` 를
 * 직접 쓰지 못하므로(M2 규칙) 생성 검증에 필요한 조회와 트랜잭션을 여기 둔다 —
 * M2 `lib/dal/accept-invite.ts` 와 같은 자리다.
 *
 * 읽기 조회(홈 승인 대기·목록·상세)는 `lib/dal/gift.ts`(T021, 세션 ②)가 맡는다 — 모든
 * 읽기가 `evaluateExpiry()` 를 경유해야 하기 때문이다 (R3). 여기는 생성·취소만 둔다.
 */

/**
 * 두 사용자 사이 활성 관계 — 방향 무관 (contracts §4 검사 3).
 * 계약이 부르는 `requireActiveFriendship` 관문(lib/dal/friend.ts, H 소유)과 같은 판정식이다.
 * 그 함수는 화면용이라 실패를 notFound() 로 던지는데, 액션은 실패를 결과 값(NOT_FRIENDS)으로
 * 돌려줘야 하므로 M2 accept-invite 와 같은 boolean 프리미티브를 쓴다.
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
 * giver 의 활성 결제수단 하나 (FR-013 ②). 없으면 null → NO_PAYMENT_METHOD.
 * 빌링키는 사용자당 재사용이라(FR-009) 보통 1건이다 — 여러 건이면 최신 등록을 쓴다.
 */
export async function findActivePaymentMethodId(userId: string): Promise<string | null> {
  const method = await prisma.paymentMethod.findFirst({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return method?.id ?? null
}

export type ProductForGift = {
  id: string
  name: string
  imageUrl: string | null
  price: number
  categoryId: string
  isActive: boolean
}

/** 요청 대상 상품. 부재면 null — 호출부가 비활성과 같은 응답(PRODUCT_UNAVAILABLE)으로 뭉갠다 */
export async function findProductForGift(productId: string): Promise<ProductForGift | null> {
  return prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, imageUrl: true, price: true, categoryId: true, isActive: true },
  })
}

/**
 * 수령자가 이 카테고리를 `관심 없어요`로 표시했는지 (FR-013 ③ · R9).
 * 목록 필터·상세 비활성에 이은 **3중 차단의 최종 지점**이다 — 화면을 우회한 호출도 여기서 막힌다.
 */
export async function isUnwantedCategoryFor(receiverId: string, categoryId: string): Promise<boolean> {
  const found = await prisma.tasteItem.findFirst({
    where: { kind: 'UNWANTED', categoryId, profile: { userId: receiverId } },
    select: { id: true },
  })
  return found !== null
}

/** 스냅샷·알림 payload 에 복사해 넣을 표시명 — 조회 시점에 User 를 다시 읽지 않는다 (R5) */
export async function findUserDisplayName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  })
  return user?.displayName ?? null
}

export type CreateGiftRequestInput = {
  giverId: string
  /** 알림 payload 스냅샷용 (data-model.md NotificationType — "상대 표시명") */
  giverDisplayName: string
  receiverId: string
  /** D3 스냅샷 — 관계가 해제돼도 "누구에게"가 렌더된다 (FR-016) */
  receiverDisplayName: string
  product: Pick<ProductForGift, 'id' | 'name' | 'imageUrl' | 'price'>
  paymentMethodId: string
  /** 생성 시점 절대 시각 = now + GIFT_RESPOND_TTL (FR-017 · R11) */
  respondDueAt: Date
  consentAgreedAt: Date
  consentVersion: string
}

/**
 * 생성 트랜잭션 (contracts §4 검사 7) — GiftRequest 와 수령자 `GIFT_REQUEST_RECEIVED` 알림이
 * **함께 생기거나 함께 롤백**된다 (R7: 알림은 발생 트랜잭션의 소유자가 만든다).
 * 요청 id 를 미리 만드는 이유: 배열형 $transaction 안에서는 앞 쿼리 결과를 뒤 쿼리가
 * 참조할 수 없는데, 알림 payload 에 giftRequestId 가 들어가야 한다 (M2 R5와 같은 구조).
 */
export async function createGiftRequestTransaction(
  input: CreateGiftRequestInput,
): Promise<{ giftRequestId: string }> {
  const giftRequestId = randomUUID()

  await prisma.$transaction([
    prisma.giftRequest.create({
      data: {
        id: giftRequestId,
        giverId: input.giverId,
        receiverId: input.receiverId,
        status: 'PENDING',
        productId: input.product.id,
        productSnapshot: {
          name: input.product.name,
          imageUrl: input.product.imageUrl,
          price: input.product.price,
        },
        requestedAmount: input.product.price,
        receiverDisplayName: input.receiverDisplayName,
        paymentMethodId: input.paymentMethodId,
        consentAgreedAt: input.consentAgreedAt,
        consentVersion: input.consentVersion,
        respondDueAt: input.respondDueAt,
      },
      select: { id: true },
    }),
    prisma.notification.create({
      data: {
        userId: input.receiverId,
        type: 'GIFT_REQUEST_RECEIVED',
        // gift 계열 공통 payload (T015 GiftNotificationPayload) — 수령자에게 가므로 상대는 giver
        payload: {
          giftRequestId,
          counterpartDisplayName: input.giverDisplayName,
          productName: input.product.name,
          amount: input.product.price,
        } satisfies GiftNotificationPayload,
      },
      select: { id: true },
    }),
  ])

  return { giftRequestId }
}

export type CancelOutcome = 'CANCELLED' | 'NOT_CANCELLABLE' | 'NOT_OWNER'

/**
 * 본인(giver)의 PENDING 요청을 취소한다 — `PENDING → CANCELLED` 전이는 T015 관문
 * (`transitionGiftRequest`) 경유다: 조건부 UPDATE 라 ④의 `PENDING → PAYING` 잠금과
 * 경합해도 어느 한쪽만 이긴다 (R2). `cancelledAt` 은 관문이 채운다.
 *
 * 소유 검사는 전이보다 먼저 따로 한다 — giverId 는 불변이라 검사·전이 사이 경합이 없다.
 * 남의 것·없는 것은 **같은 NOT_OWNER** 로 뭉갠다 — 존재 여부를 알리면 id 탐색에
 * 힌트가 된다 (M2 알림 읽음 처리와 같은 규칙).
 */
export async function cancelOwnPendingGiftRequest(
  giverId: string,
  giftRequestId: string,
): Promise<CancelOutcome> {
  const existing = await prisma.giftRequest.findUnique({
    where: { id: giftRequestId },
    select: { giverId: true },
  })
  if (existing?.giverId !== giverId) return 'NOT_OWNER'

  const { transitioned } = await transitionGiftRequest(giftRequestId, 'PENDING', 'CANCELLED')
  return transitioned ? 'CANCELLED' : 'NOT_CANCELLABLE'
}
