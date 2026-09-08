import { cache } from 'react'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { verifySession } from '@/lib/dal/session'

/**
 * 알림 DAL (T043 · US3) — 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §1
 *
 * 읽기 함수는 내부에서 세션을 검증하고 **본인 알림만** 반환한다 — 호출부(화면)에 소유자
 * 검사가 없다 (research R4). 쓰기 프리미티브(읽음 처리)도 여기 둔다: 알림은 US3 하나가
 * 통째로 소유하므로 읽기/쓰기를 파일로 가를 이유가 없다 (team-assignment §5 충돌 지도).
 *
 * M2 의 알림은 **친구 성사 한 종류뿐**이었다 (research R6). M3 이 선물 6종(T056), M4 가 펀딩 4종(T014·T032)을
 * 더했다 — 도메인 모델 §5 의 11종이 전부 여기 있다.
 */

export type NotificationPayload = {
  friendshipId: string
  friendUserId: string
  friendDisplayName: string
}

/** M2 의 친구 성사 알림 */
export type FriendNotificationView = {
  id: string
  type: 'FRIEND_JOINED_VIA_LINK'
  payload: NotificationPayload
  readAt: Date | null
  createdAt: Date
}

/** M3 의 선물 알림 6종 (T056) — payload 는 발생 시점의 표시용 스냅샷이다 */
export type GiftNotificationView = {
  id: string
  type: GiftNotificationType
  payload: GiftNotificationPayload
  readAt: Date | null
  createdAt: Date
}

/** M4 의 펀딩 알림 4종 (T014·T032) — payload 는 발생 시점의 표시용 스냅샷이다 */
export type FundingNotificationView = {
  id: string
  type: FundingNotificationType
  payload: FundingNotificationPayload
  readAt: Date | null
  createdAt: Date
}

export type NotificationView = FriendNotificationView | GiftNotificationView | FundingNotificationView

/**
 * payload 는 Json 컬럼이라 타입이 보장되지 않는다 — 우리가 쓴 값이지만 스키마 변경·수동 수정에
 * 대비해 읽는 쪽에서 형태를 검사한다 (입력 검증은 경계에서). 형태가 깨진 행은 목록에서 빼고
 * 서버 로그에 남긴다 — 화면 하나를 통째로 죽이는 대신 그 줄만 잃는다.
 */
const friendPayloadSchema = z.object({
  friendshipId: z.string(),
  friendUserId: z.string(),
  friendDisplayName: z.string(),
})

/** 선물 알림 payload (T017 이 쓴 형태) — 목록이 User·Product 를 다시 읽지 않게 하는 스냅샷 */
const giftPayloadSchema = z.object({
  giftRequestId: z.string(),
  counterpartDisplayName: z.string(),
  productName: z.string(),
  amount: z.number(),
})

/**
 * 펀딩 알림 payload — 한 형태로 4종을 덮는다. J 의 확정 트랜잭션(FUNDING_CONTRIBUTION_RECEIVED,
 * lib/dal/funding-contribute.ts)이 쓰는 `{ fundingId, contributorDisplayName, productName, amount }` 를
 * 포함하도록 선택 필드로 넓혔다. settle 3종은 `receiverDisplayName`·`reason`·`cause` 를 더 싣는다.
 */
const fundingPayloadSchema = z.object({
  fundingId: z.string(),
  productName: z.string(),
  amount: z.number(),
  contributorDisplayName: z.string().optional(),
  receiverDisplayName: z.string().optional(),
  reason: z.enum(['FAILED', 'CANCELLED', 'SURPLUS']).optional(),
  cause: z.enum(['ORGANIZER', 'TOPUP_EXHAUSTED']).optional(),
})

const FUNDING_NOTIFICATION_TYPES = [
  'FUNDING_CONTRIBUTION_RECEIVED',
  'FUNDING_SUCCEEDED',
  'FUNDING_FAILED_REFUNDED',
  'FUNDING_ORGANIZER_TOPUP',
] as const

function isFundingNotificationType(type: string): type is FundingNotificationType {
  return (FUNDING_NOTIFICATION_TYPES as readonly string[]).includes(type)
}

const GIFT_NOTIFICATION_TYPES = [
  'GIFT_REQUEST_RECEIVED',
  'GIFT_COUNTERED',
  'GIFT_PAID',
  'GIFT_PAYMENT_FAILED',
  'GIFT_CANCELLED_BY_PAYMENT',
  'GIFT_EXPIRED',
] as const

function isGiftNotificationType(type: string): type is GiftNotificationType {
  return (GIFT_NOTIFICATION_TYPES as readonly string[]).includes(type)
}

type NotificationRow = {
  id: string
  type: string
  payload: unknown
  readAt: Date | null
  createdAt: Date
}

function toView(row: NotificationRow): NotificationView | null {
  const common = { id: row.id, readAt: row.readAt, createdAt: row.createdAt }

  if (row.type === 'FRIEND_JOINED_VIA_LINK') {
    const parsed = friendPayloadSchema.safeParse(row.payload)
    if (!parsed.success) return dropped(row.id)
    return { ...common, type: 'FRIEND_JOINED_VIA_LINK', payload: parsed.data }
  }

  if (isGiftNotificationType(row.type)) {
    const parsed = giftPayloadSchema.safeParse(row.payload)
    if (!parsed.success) return dropped(row.id)
    return { ...common, type: row.type, payload: parsed.data }
  }

  if (isFundingNotificationType(row.type)) {
    const parsed = fundingPayloadSchema.safeParse(row.payload)
    if (!parsed.success) return dropped(row.id)
    return { ...common, type: row.type, payload: parsed.data }
  }

  // 모르는 종류는 조용히 뺀다 — enum 에 값이 먼저 늘고 표시 매핑이 뒤따르는 창에서 화면을 지킨다
  return dropped(row.id)
}

function dropped(id: string): null {
  console.error('[dal/notification] payload 형태가 계약과 다르다 — 목록에서 제외', id)
  return null
}

/**
 * T043 — 본인 알림 최신순 (FR-029). 미읽음 구분은 `readAt` 으로 화면이 한다 (FR-030).
 *
 * React cache() 메모이즈: 한 렌더 패스에서 목록과 배지가 함께 불러도 조회는 1회다.
 */
export const getMyNotifications = cache(async (): Promise<NotificationView[]> => {
  const { userId } = await verifySession()
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
  })
  return rows.map(toView).filter((view): view is NotificationView => view !== null)
})

/** T043 — 배지용 미읽음 개수 (FR-030). 목록을 다 읽어오지 않고 센다 */
export const getUnreadCount = cache(async (): Promise<number> => {
  const { userId } = await verifySession()
  return prisma.notification.count({ where: { userId, readAt: null } })
})

export type NotificationIndicator = {
  unreadCount: number
  latestNotificationId: string | null
}

/** 홈 자동 갱신용 최소 정보 — 개수뿐 아니라 최신 id도 비교해 같은 개수의 새 알림을 놓치지 않는다. */
export const getNotificationIndicator = cache(async (): Promise<NotificationIndicator> => {
  const { userId } = await verifySession()
  const [unreadCount, latest] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    }),
  ])
  return { unreadCount, latestNotificationId: latest?.id ?? null }
})

/** 읽음 처리의 결과 — 호출부(Action)가 오류 코드로 옮긴다 */
export type MarkReadOutcome = 'MARKED' | 'ALREADY_READ' | 'NOT_OWNER'

/**
 * 알림 하나를 읽음으로 (FR-031).
 *
 * `readAt: null` 을 where 에 넣어 **이미 읽은 알림의 시각을 덮어쓰지 않는다** — 덮어쓰면
 * 언제 읽었는지가 사라지고, 화면상으로는 아무 차이가 없어 눈에 띄지 않는다.
 * 0건이 바뀌었을 때만 이유를 가른다: 남의 것·없는 것은 **같은 응답**으로 뭉갠다 —
 * 존재 여부를 알리면 id 탐색에 힌트가 된다.
 */
export async function markOwnNotificationRead(
  userId: string,
  notificationId: string,
): Promise<MarkReadOutcome> {
  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  })
  if (count > 0) return 'MARKED'

  const existing = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true },
  })
  return existing?.userId === userId ? 'ALREADY_READ' : 'NOT_OWNER'
}

/**
 * 본인의 **읽지 않은** 알림 전부를 읽음으로 (FR-031). 이미 읽은 것은 건드리지 않는다.
 * @returns 실제로 바뀐 건수
 */
export async function markAllOwnNotificationsRead(userId: string): Promise<{ count: number }> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
  return { count }
}

// ---------------------------------------------------------------------------
// M3 — 선물 알림 (T017 · research R7)
//
// **생성은 각 트랜잭션 소유자가 트랜잭션 안에서 한다** — 파일은 여기(D 소유)에 두되,
// 결제 알림은 chargeGiftRequest 의 트랜잭션이, 요청·대안 알림은 각 액션의 트랜잭션이 만든다.
// 트랜잭션 밖에서 만들면 "상태는 바뀌었는데 알림이 없다"가 생긴다 (M2 R5 와 같은 이유).
//
// 목록 표시(문구·이동 매핑)는 T056 에서 잇는다 — 위의 NotificationView 는 아직 M2 한 종류다.
// ---------------------------------------------------------------------------

/** 선물 알림 6종 (data-model.md "NotificationType — 6종 추가") */
export type GiftNotificationType =
  | 'GIFT_REQUEST_RECEIVED'
  | 'GIFT_COUNTERED'
  | 'GIFT_PAID'
  | 'GIFT_PAYMENT_FAILED'
  | 'GIFT_CANCELLED_BY_PAYMENT'
  | 'GIFT_EXPIRED'

/**
 * payload 는 **표시용 값의 스냅샷**이다 (M2 와 같은 원칙) — 목록을 그릴 때 User·Product 를
 * 다시 읽지 않는다. 관계가 해제돼도, 상품이 내려가도 지난 알림이 그대로 읽힌다.
 */
export type GiftNotificationPayload = {
  giftRequestId: string
  /** 받는 사람 기준의 상대 표시명 — giver 에게는 수령자, receiver 에게는 주는 사람 */
  counterpartDisplayName: string
  productName: string
  amount: number
}

export type GiftNotificationEntry = {
  userId: string
  type: GiftNotificationType
  payload: GiftNotificationPayload
}

/** 여러 건을 한 번에 — 성공 알림은 양쪽에 간다 (FR-029), 취소 고지도 양쪽이다 (FR-032) */
export async function createGiftNotifications(
  tx: Prisma.TransactionClient,
  entries: GiftNotificationEntry[],
): Promise<void> {
  if (entries.length === 0) return
  await tx.notification.createMany({
    data: entries.map((entry) => ({
      userId: entry.userId,
      type: entry.type,
      payload: entry.payload,
    })),
  })
}

// ---------------------------------------------------------------------------
// M4 — 펀딩 알림 (T014 · research R8)
//
// 생성 경계가 정해져 있다: FUNDING_CONTRIBUTION_RECEIVED 는 참여 **확정 트랜잭션**(J, R2 ③) 안에서,
// 나머지 3종(FUNDING_SUCCEEDED · FUNDING_FAILED_REFUNDED · FUNDING_ORGANIZER_TOPUP)은 전부
// `lib/funding/settle.ts` 안이다. 호출자는 정산 알림을 보내지 않는다 — 트리거 지점이 여럿(상세·홈·내역
// 조회 + 조기 성사 + 취소 + 재시도)이라 호출자에 두면 복제·중복 발송이 난다.
// ---------------------------------------------------------------------------

/** 펀딩 알림 4종 (data-model.md "NotificationType — 4종 추가") */
export type FundingNotificationType = (typeof FUNDING_NOTIFICATION_TYPES)[number]

/**
 * payload 는 **표시용 값의 스냅샷**이다 (M2·M3 와 같은 원칙). 목록이 User·Funding 을 다시 읽지 않는다.
 *
 * `amount` 의 뜻은 종류마다 하나다 — CONTRIBUTION_RECEIVED: 참여 금액 / SUCCEEDED: 모인 금액(목표) /
 * FAILED_REFUNDED: **환불 금액**(0 이면 참여 없는 전원 고지 — topup 상한 초과 취소의 주최자·수령자) /
 * ORGANIZER_TOPUP: 차액.
 * `reason`·`cause` 는 FAILED_REFUNDED 만 쓴다 — 미달(FAILED)과 취소(CANCELLED)를 문구에서 갈라야 한다(FR-018).
 * 취소는 주최자 취소(ORGANIZER)와 차액 결제 상한 초과(TOPUP_EXHAUSTED)로 다시 갈린다. SURPLUS 는 성사가
 * 끝난 뒤 늦게 확정된 결제(대사)를 되돌린 경우다 — 펀딩은 성사했고 이 돈만 필요 없어졌다.
 */
export type FundingNotificationPayload = z.infer<typeof fundingPayloadSchema>

export type FundingNotificationEntry = {
  userId: string
  type: FundingNotificationType
  payload: FundingNotificationPayload
}

/** 여러 건을 한 번에 — 성사 알림은 참여자 전원 + 수령자에게, 취소 고지는 전원에게 간다 */
export async function createFundingNotifications(
  tx: Pick<Prisma.TransactionClient, 'notification'>,
  entries: FundingNotificationEntry[],
): Promise<void> {
  if (entries.length === 0) return
  await tx.notification.createMany({
    data: entries.map((entry) => ({
      userId: entry.userId,
      type: entry.type,
      payload: entry.payload,
    })),
  })
}
