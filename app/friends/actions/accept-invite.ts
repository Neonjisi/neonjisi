'use server'

import { z } from 'zod'
import {
  acceptInviteTransaction,
  findInviteLinkByToken,
  findUserDisplayName,
  hasActiveFriendship,
} from '@/lib/dal/accept-invite'
import { isValid } from '@/lib/dal/invite'
import { verifySession } from '@/lib/dal/session'
import { guarded, type ActionResult } from './shared'

/**
 * 링크 성사 Server Action (T023 · US1)
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2 `acceptInvite`
 *
 * 검사 순서가 정해져 있다 — 바꾸면 오답이 난다:
 *   1. 세션            없으면 verifySession 이 /login 으로 보낸다 (미리보기와 다른 경로)
 *   2. 토큰 유효성      isValid(link). 만료·중지·부재를 구분하지 않는다 → LINK_INVALID (FR-007)
 *   3. 본인 링크        link.inviterId === session.userId → SELF_INVITE (FR-016)
 *   4. 기존 활성 관계   방향 무관 → ALREADY_FRIENDS (FR-015)
 *   5. 트랜잭션         관계 생성 + usedCount { increment: 1 } + 발급자 알림 (research R5)
 *
 * 4 를 통과해도 5 가 C3 유니크 위반(P2002)으로 실패할 수 있다 — 두 사람이 서로의 링크를
 * 동시에 여는 경우다. P2002 를 잡아 ALREADY_FRIENDS 로 바꾼다. 검사는 좋은 메시지를
 * 위해, 제약은 정확성을 위해 둘 다 둔다.
 *
 * revalidatePath 를 부르지 않는다: `/i/[token]`(research R3)은 Server Component 렌더
 * 중에 이 액션을 호출하는데, 렌더 중 revalidatePath 는 Next 가 예외로 거부한다.
 * /friends · /notifications 는 세션 의존 동적 라우트라 다음 요청에서 새로 읽는다.
 */

export type AcceptInviteErrorCode =
  | 'LINK_INVALID'
  | 'SELF_INVITE'
  | 'ALREADY_FRIENDS'
  | 'STORAGE_FAILED'

/** 만료·중지·부재·형식 불량 전부 이 한 문구 — 구분해 알리면 토큰 탐색에 힌트가 된다 (FR-007) */
const LINK_INVALID_MESSAGE = '더 이상 쓸 수 없는 링크예요.'
const SELF_INVITE_MESSAGE = '내 링크예요. 친구에게 보내주세요.'
const ALREADY_FRIENDS_MESSAGE = '이미 친구예요.'
const ACCEPT_FAILED_MESSAGE = '친구 추가를 완료하지 못했어요. 잠시 후 다시 시도해주세요.'
/** verifySession 이 User 행을 보장하므로 보통 도달하지 않는다 — 세션 DAL 의 폴백과 같은 값 */
const FALLBACK_DISPLAY_NAME = '이름 미설정'

// Server Action 은 클라이언트가 임의 페이로드로 호출할 수 있으므로 형식을 먼저 거른다.
// 상한은 실제 토큰(43자, research R2)보다 넉넉하게 — 형식 불량도 LINK_INVALID 로 뭉갠다.
const acceptInviteInputSchema = z.object({ token: z.string().min(1).max(128) })

function fail<T>(code: AcceptInviteErrorCode, message: string): ActionResult<T> {
  return { ok: false, error: { code, message } }
}

export async function acceptInvite(input: {
  token: string
}): Promise<ActionResult<{ friendUserId: string }>> {
  // 1. 세션 — 게이트는 guarded 바깥에 둔다 (redirect 예외를 그대로 Next 에 넘긴다)
  const { userId } = await verifySession()

  return guarded(ACCEPT_FAILED_MESSAGE, async () => {
    const parsed = acceptInviteInputSchema.safeParse(input)
    if (!parsed.success) return fail('LINK_INVALID', LINK_INVALID_MESSAGE)

    // 2. 토큰 유효성 — 부재(null)와 만료·중지(isValid false)를 같은 응답으로
    const link = await findInviteLinkByToken(parsed.data.token)
    if (!link || !isValid(link)) return fail('LINK_INVALID', LINK_INVALID_MESSAGE)

    // 3. 본인 링크
    if (link.inviterId === userId) return fail('SELF_INVITE', SELF_INVITE_MESSAGE)

    // 4. 기존 활성 관계 (방향 무관)
    if (await hasActiveFriendship(userId, link.inviterId)) {
      return fail('ALREADY_FRIENDS', ALREADY_FRIENDS_MESSAGE)
    }

    // 5. 트랜잭션 — 관계 · usedCount · 알림이 함께 생기거나 함께 롤백된다
    const addresseeDisplayName = (await findUserDisplayName(userId)) ?? FALLBACK_DISPLAY_NAME
    try {
      await acceptInviteTransaction({
        linkId: link.id,
        inviterId: link.inviterId,
        addresseeId: userId,
        addresseeDisplayName,
      })
    } catch (e) {
      // 4 와 5 사이의 경합은 C3(friendship_pair_active)가 막는다 — 유니크 위반을 결과 값으로.
      // 그 외는 guarded 가 STORAGE_FAILED 로 바꾼다.
      if ((e as { code?: string }).code === 'P2002') {
        return fail('ALREADY_FRIENDS', ALREADY_FRIENDS_MESSAGE)
      }
      throw e
    }

    return { ok: true, data: { friendUserId: link.inviterId } }
  })
}
