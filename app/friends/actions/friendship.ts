'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { REMOVE_FRIEND_FAILED_MESSAGE } from '@/lib/actions/call-action'
import { removeActiveFriendship } from '@/lib/dal/friendship'
import { verifySession } from '@/lib/dal/session'
import { guarded, type ActionResult } from './shared'

/**
 * 친구 관계 Server Action — US4 (T051)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2 `removeFriend`
 *
 * 검사 순서:
 *   1. 세션
 *   2. 활성 관계 확인 — 없으면 NOT_FRIENDS
 *   3. status = REMOVED, removedAt = now, removedBy = session.userId
 *
 * 행을 지우지 않는다 (FR-026·FR-027). M2 에는 진행 중 거래가 없으므로 예외 분기가 없다 (R9).
 * 해제 확인 고지(FR-024)는 클라이언트 책임이다 (components/friend/remove-friend-dialog.tsx).
 */

const NOT_FRIENDS_MESSAGE = '이미 친구가 아니에요.'

/**
 * FR-025 — 친구 해제. 어느 쪽이 눌러도 같은 한 행이 바뀌고 양방향으로 차단된다.
 * 2·3 은 DAL 이 한 문장(updateMany)으로 처리하므로 "확인 뒤 갱신" 사이의 경합이 없다.
 */
export async function removeFriend(input: {
  friendUserId: string
}): Promise<ActionResult<{ ok: true }>> {
  const { userId } = await verifySession()

  return guarded(REMOVE_FRIEND_FAILED_MESSAGE, async () => {
    const friendUserId = input?.friendUserId
    // uuid 가 아니면 그런 친구가 있을 수 없다 — DB 까지 가지 않고 같은 답을 준다
    if (!z.uuid().safeParse(friendUserId).success || friendUserId === userId) {
      return { ok: false, error: { code: 'NOT_FRIENDS', message: NOT_FRIENDS_MESSAGE } }
    }

    const { removed } = await removeActiveFriendship(userId, friendUserId)
    if (!removed) {
      return { ok: false, error: { code: 'NOT_FRIENDS', message: NOT_FRIENDS_MESSAGE } }
    }

    // 양쪽 친구 목록과 상세가 함께 바뀐다 — 상세는 이제 requireActiveFriendship 이 거부한다
    revalidatePath('/friends')
    revalidatePath(`/friends/${friendUserId}`)
    return { ok: true, data: { ok: true } }
  })
}
