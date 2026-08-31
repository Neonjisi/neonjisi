'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { REVOKE_LINK_FAILED_MESSAGE } from '@/lib/actions/call-action'
import { revokeOwnInviteLink } from '@/lib/dal/invite-link'
import { verifySession } from '@/lib/dal/session'
import { guarded, type ActionResult } from './shared'

/**
 * 초대 링크 통제 Server Action — US3 (T042)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2 `revokeInviteLink`
 *
 * 검사 순서:
 *   1. 세션
 *   2. 소유자 검사 + 중지 — DAL 이 한 문장으로 처리한다 (확인 뒤 갱신 사이의 경합 없음)
 *
 * **이 액션이 SCR-M2-03 의 존재 이유다.** 승인 절차를 없앤 대가로 남긴 통제 수단이
 * 만료·중지·알림 셋인데, 링크가 의도치 않은 곳으로 퍼졌을 때 사용자가 그 자리에서 쓸 수
 * 있는 것은 중지 하나뿐이다 (FR-005).
 *
 * 중지는 **이미 맺어진 관계를 되돌리지 않는다** — 그건 해제(US4 `removeFriend`)의 몫이다.
 */

const REVOKE_NOT_OWNER_MESSAGE = '내 링크가 아니에요.'
const ALREADY_REVOKED_MESSAGE = '이미 중지한 링크예요.'

// Server Action 은 클라이언트가 임의 페이로드로 호출할 수 있으므로 형식을 먼저 거른다.
const revokeInputSchema = z.object({ linkId: z.uuid() })

export async function revokeInviteLink(input: {
  linkId: string
}): Promise<ActionResult<{ ok: true }>> {
  // 1. 세션 — 게이트는 guarded 바깥에 둔다 (redirect 예외를 그대로 Next 에 넘긴다)
  const { userId } = await verifySession()

  return guarded(REVOKE_LINK_FAILED_MESSAGE, async () => {
    const parsed = revokeInputSchema.safeParse(input)
    // uuid 가 아니면 그런 링크가 있을 수 없다 — DB 까지 가지 않고 "내 것이 아니다"와 같은 답을 준다
    if (!parsed.success) {
      return { ok: false, error: { code: 'NOT_OWNER', message: REVOKE_NOT_OWNER_MESSAGE } }
    }

    // 2. 소유자 검사 + 중지
    const outcome = await revokeOwnInviteLink(userId, parsed.data.linkId)
    if (outcome === 'NOT_OWNER') {
      return { ok: false, error: { code: 'NOT_OWNER', message: REVOKE_NOT_OWNER_MESSAGE } }
    }
    if (outcome === 'ALREADY_REVOKED') {
      return { ok: false, error: { code: 'ALREADY_REVOKED', message: ALREADY_REVOKED_MESSAGE } }
    }

    // 관리 화면의 두 묶음이 갈리고, 발급 화면은 다음 진입에서 새 링크를 발급한다 (FR-004 · US3-4)
    revalidatePath('/friends/invite/manage')
    revalidatePath('/friends/invite')
    return { ok: true, data: { ok: true } }
  })
}
