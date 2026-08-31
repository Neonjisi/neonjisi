import { cache } from 'react'
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
 * M2 의 알림은 **친구 성사 한 종류뿐**이다 (research R6). 도메인 모델 §5 의 나머지 10종은
 * M3·M4 에서 더한다 — 미리 만들지 않는다.
 */

export type NotificationPayload = {
  friendshipId: string
  friendUserId: string
  friendDisplayName: string
}

export type NotificationView = {
  id: string
  type: 'FRIEND_JOINED_VIA_LINK'
  payload: NotificationPayload
  readAt: Date | null
  createdAt: Date
}

/**
 * payload 는 Json 컬럼이라 타입이 보장되지 않는다 — 우리가 쓴 값이지만 스키마 변경·수동 수정에
 * 대비해 읽는 쪽에서 형태를 검사한다 (입력 검증은 경계에서). 형태가 깨진 행은 목록에서 빼고
 * 서버 로그에 남긴다 — 화면 하나를 통째로 죽이는 대신 그 줄만 잃는다.
 */
const payloadSchema = z.object({
  friendshipId: z.string(),
  friendUserId: z.string(),
  friendDisplayName: z.string(),
})

type NotificationRow = {
  id: string
  type: string
  payload: unknown
  readAt: Date | null
  createdAt: Date
}

function toView(row: NotificationRow): NotificationView | null {
  const parsed = payloadSchema.safeParse(row.payload)
  if (!parsed.success) {
    console.error('[dal/notification] payload 형태가 계약과 다르다 — 목록에서 제외', row.id)
    return null
  }
  return {
    id: row.id,
    type: 'FRIEND_JOINED_VIA_LINK',
    payload: parsed.data,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }
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
