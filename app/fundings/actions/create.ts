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
const INVALID_AMOUNTS_MESSAGE = '최소 달성 금액은 목표 금액보다 클 수 없어요.'
const INVALID_DEADLINE_MESSAGE = '마감일은 지금보다 이후여야 해요.'
const CONSENT_REQUIRED_MESSAGE = '차액 자동 결제 동의가 필요해요.'
const CREATE_FAILED_MESSAGE = '펀딩을 열지 못했어요. 잠시 후 다시 시도해주세요.'
/** verifySession 이 User 행을 보장하므로 보통 도달하지 않는다 — 세션 DAL 의 폴백과 같은 값 */
const FALLBACK_DISPLAY_NAME = '이름 미설정'

// 형식(정수)만 스키마로 막는다 — "0 보다 커야 한다"·"목표 이하여야 한다"는 업무 규칙(검사 3)
// 이라 런타임에서 판정한다. `.positive()` 를 여기 두면 검사 2(수령자·친구)보다 먼저 실행돼
// 검사 순서가 깨진다(리뷰 지적) — 예: 낯선 사람 + minAmount=0 이 NOT_FRIENDS 가 아니라
// 여기서 곧장 걸려버린다.
const createInputSchema = z.object({
  receiverId: z.string().uuid(),
  productId: z.string().uuid(),
  goalAmount: z.number().int(),
  minAmount: z.number().int(),
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
    if (!parsed.success) {
      // 형식 불량도 검사 순서에 맞춰 뭉갠다(M3 request.ts:114-121 패턴) — 이 if-체인 자체가
      // 검사 2→3→4→5 우선순위와 같은 순서라, 여러 필드가 동시에 불량이어도 앞선 검사의
      // 코드가 이긴다. productId 등 대응 코드가 없는 필드는 STORAGE_FAILED 로 뭉갠다.
      const paths = new Set(parsed.error.issues.map((issue) => issue.path[0]))
      if (paths.has('receiverId')) return fail('NOT_FRIENDS', NOT_FRIENDS_MESSAGE)
      if (paths.has('goalAmount') || paths.has('minAmount')) {
        return fail('INVALID_AMOUNTS', INVALID_AMOUNTS_MESSAGE)
      }
      if (paths.has('deadline')) return fail('INVALID_DEADLINE', INVALID_DEADLINE_MESSAGE)
      if (paths.has('consent')) return fail('CONSENT_REQUIRED', CONSENT_REQUIRED_MESSAGE)
      return fail('STORAGE_FAILED', CREATE_FAILED_MESSAGE)
    }
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

    // 6. 생성 — 스냅샷 2종 + 동의 기록. 부재·비활성은 같은 응답(M3 request.ts:138-140 과
    // 같은 이유 — 존재 여부를 구분해 알리면 id 탐색에 힌트가 된다). §4 표에 전용 코드가
    // 없어 STORAGE_FAILED 로 뭉갠다(리뷰 확인 완료).
    const product = await findProductForFunding(productId)
    if (!product || !product.isActive) return fail('STORAGE_FAILED', CREATE_FAILED_MESSAGE)
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
