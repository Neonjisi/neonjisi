'use server'

import { z } from 'zod'
import {
  createFundingRow,
  findActivePaymentMethodId,
  findProductForFunding,
  findUserDisplayName,
  hasActiveFriendship,
} from '@/lib/dal/funding-create'
import { verifySession } from '@/lib/dal/session'
import { FUNDING_CONSENT_VERSION } from '@/lib/funding/consent'
// D 소유 T015 — origin/main 에 오르기 전까지 이 import 는 미해결이다 (M4-J-BRIEFING ③ 게이트:
// "없으면 import 만 써 두고 대기"). M3 app/gifts/actions/shared.ts 와 같은 모양일 것.
// 상대 경로 대신 절대 임포트(@/*) — 프로젝트 규칙이기도 하고, T015 전까지 통합 테스트가
// 같은 지정자로 vi.mock 대체할 수 있어야 한다 (funding-create.test.ts 참조).
import { guarded, type ActionResult } from '@/app/fundings/actions/shared'

/**
 * 펀딩 개설 Server Action (T019 · US1)
 * 계약: specs/004-group-funding/contracts/server-actions.md §4
 *
 * `createFunding` 의 검사 순서가 정해져 있다 — 바꾸면 오답이 난다:
 *   1. 세션            없으면 verifySession 이 /login 으로 보낸다
 *   2. 수령자           본인이거나 활성 친구 — 아니면 NOT_FRIENDS (FR-001)
 *   3. 금액             개설자=수령자면 minAmount := goalAmount 강제(C10 과 이중 방어) 후
 *                       0 < minAmount ≤ goalAmount 검증(C9 와 이중) — 아니면 INVALID_AMOUNTS
 *   4. 마감             deadline > now — 아니면 INVALID_DEADLINE
 *   5. 개설자≠수령자만   차액 동의 + 활성 결제수단 — 없으면 CONSENT_REQUIRED / NO_PAYMENT_METHOD
 *                       (FR-004). 개설자=수령자면 건너뛴다 — 차액이 구조적으로 없다(FR-003)
 *   6. 생성             productSnapshot·receiverDisplayName 스냅샷 + consentVersion 기록 (FR-005)
 *
 * 목표 금액 < 상품 가격은 화면 경고일 뿐 서버가 막지 않는다(spec Acceptance Scenario 4) —
 * 이 검사 순서에 없다. 화면에서 이미 차단된 조건도 생성 시점에 다시 검증한다 — Server Action
 * 은 클라이언트가 임의 페이로드로 부를 수 있다.
 */

export type CreateFundingErrorCode =
  | 'NOT_FRIENDS'
  | 'NO_PAYMENT_METHOD'
  | 'INVALID_AMOUNTS'
  | 'INVALID_DEADLINE'
  | 'CONSENT_REQUIRED'
  | 'STORAGE_FAILED'

/** 화면 명세 SCR-M4-01 진입 차단 문구와 맞춘다 */
const NOT_FRIENDS_MESSAGE = '친구인 사람에게만 펀딩을 열 수 있어요.'
const NO_PAYMENT_METHOD_MESSAGE = '차액을 결제할 수단이 필요해요.'
const INVALID_AMOUNTS_MESSAGE = '최소 달성선은 목표 금액보다 클 수 없어요.'
const INVALID_DEADLINE_MESSAGE = '마감일은 지금보다 이후여야 해요.'
const CONSENT_REQUIRED_MESSAGE = '차액 자동 결제 동의가 필요해요.'
const CREATE_FAILED_MESSAGE = '펀딩을 열지 못했어요. 잠시 후 다시 시도해주세요.'
/** verifySession 이 User 행을 보장하므로 보통 도달하지 않는다 — 세션 DAL 의 폴백과 같은 값 */
const FALLBACK_DISPLAY_NAME = '이름 미설정'

const createInputSchema = z.object({
  receiverId: z.string().uuid(),
  productId: z.string().uuid(),
  goalAmount: z.number().int().positive(),
  minAmount: z.number().int().positive(),
  deadline: z.coerce.date(),
  // "나에게" 분기(개설자=수령자)는 동의 스텝 자체가 없어 생략될 수 있다 (FR-003)
  consent: z.boolean().optional(),
})

function fail<T>(code: CreateFundingErrorCode, message: string): ActionResult<T> {
  return { ok: false, error: { code, message } }
}

export async function createFunding(input: {
  receiverId: string
  productId: string
  goalAmount: number
  minAmount: number
  deadline: Date | string
  consent?: boolean
}): Promise<ActionResult<{ fundingId: string }>> {
  // 1. 세션 — 게이트는 guarded 바깥에 둔다 (redirect 예외를 그대로 Next 에 넘긴다)
  const { userId } = await verifySession()

  return guarded(CREATE_FAILED_MESSAGE, async () => {
    const parsed = createInputSchema.safeParse(input)
    if (!parsed.success) return fail('STORAGE_FAILED', CREATE_FAILED_MESSAGE)
    const { receiverId, productId, goalAmount, deadline, consent } = parsed.data
    const isSelf = receiverId === userId

    // 2. 수령자 — 본인이거나 활성 친구
    if (!isSelf && !(await hasActiveFriendship(userId, receiverId))) {
      return fail('NOT_FRIENDS', NOT_FRIENDS_MESSAGE)
    }

    // 3. 금액 — 개설자=수령자면 강제(C10 과 이중 방어)한 뒤 범위 검증(C9 와 이중 방어)
    const minAmount = isSelf ? goalAmount : parsed.data.minAmount
    if (!(minAmount > 0 && minAmount <= goalAmount)) {
      return fail('INVALID_AMOUNTS', INVALID_AMOUNTS_MESSAGE)
    }

    // 4. 마감
    if (!(deadline.getTime() > Date.now())) {
      return fail('INVALID_DEADLINE', INVALID_DEADLINE_MESSAGE)
    }

    // 5. 개설자≠수령자일 때만 — 차액 동의 + 활성 결제수단
    let organizerPaymentMethodId: string | null = null
    let organizerConsentAgreedAt: Date | null = null
    let consentVersion: string | null = null
    if (!isSelf) {
      if (consent !== true) return fail('CONSENT_REQUIRED', CONSENT_REQUIRED_MESSAGE)
      organizerPaymentMethodId = await findActivePaymentMethodId(userId)
      if (organizerPaymentMethodId === null) {
        return fail('NO_PAYMENT_METHOD', NO_PAYMENT_METHOD_MESSAGE)
      }
      organizerConsentAgreedAt = new Date()
      consentVersion = FUNDING_CONSENT_VERSION
    }

    // 6. 생성 — 스냅샷 2종 + 동의 기록
    const product = await findProductForFunding(productId)
    if (!product) return fail('STORAGE_FAILED', CREATE_FAILED_MESSAGE)
    const receiverDisplayName =
      (await findUserDisplayName(receiverId)) ?? FALLBACK_DISPLAY_NAME

    const { fundingId } = await createFundingRow({
      organizerId: userId,
      receiverId,
      product,
      goalAmount,
      minAmount,
      deadline,
      receiverDisplayName,
      organizerPaymentMethodId,
      organizerConsentAgreedAt,
      consentVersion,
    })

    return { ok: true, data: { fundingId } }
  })
}
