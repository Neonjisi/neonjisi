'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NOTIFICATION_READ_FAILED_MESSAGE } from '@/lib/actions/call-action'
import {
  markAllOwnNotificationsRead,
  markOwnNotificationRead,
} from '@/lib/dal/notification'
import { verifySession } from '@/lib/dal/session'
import { guarded, type ActionResult } from './shared'

/**
 * 알림 읽음 처리 Server Action — US3 (T044)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2
 *
 * 둘 다 **이미 읽은 알림의 `readAt` 을 덮어쓰지 않는다** — 덮어쓰면 언제 읽었는지가 사라지고,
 * 화면상으로는 아무 차이가 없어 눈에 띄지 않는다. 판정은 DAL 의 `readAt: null` 조건이 한다.
 */

const NOT_OWNER_MESSAGE = '내 알림이 아니에요.'

const markReadInputSchema = z.object({ notificationId: z.uuid() })

/**
 * FR-031 — 알림 하나를 읽음으로. 이미 읽은 알림을 다시 눌러도 **성공**이다(멱등) —
 * 사용자가 한 일("읽었다")은 이미 이뤄져 있고, 실패로 돌려주면 화면이 거짓 오류를 띄운다.
 */
export async function markNotificationRead(input: {
  notificationId: string
}): Promise<ActionResult<{ ok: true }>> {
  const { userId } = await verifySession()

  return guarded(NOTIFICATION_READ_FAILED_MESSAGE, async () => {
    const parsed = markReadInputSchema.safeParse(input)
    // uuid 가 아니면 그런 알림이 있을 수 없다 — 남의 것인지 없는 것인지 구분해 알리지 않는다
    if (!parsed.success) {
      return { ok: false, error: { code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE } }
    }

    const outcome = await markOwnNotificationRead(userId, parsed.data.notificationId)
    if (outcome === 'NOT_OWNER') {
      return { ok: false, error: { code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE } }
    }

    revalidatePath('/notifications')
    return { ok: true, data: { ok: true } }
  })
}

/**
 * FR-031 — 모두 읽음. **읽지 않은 것만** 갱신한다.
 * 읽지 않은 알림이 없으면 0건으로 성공한다 — 누를 것이 없었다는 사실이지 실패가 아니다.
 */
export async function markAllNotificationsRead(): Promise<ActionResult<{ count: number }>> {
  const { userId } = await verifySession()

  return guarded(NOTIFICATION_READ_FAILED_MESSAGE, async () => {
    const { count } = await markAllOwnNotificationsRead(userId)
    revalidatePath('/notifications')
    return { ok: true, data: { count } }
  })
}
