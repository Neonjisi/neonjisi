'use server'

import { z } from 'zod'
import {
  cancelOwnPendingGiftRequest,
  createGiftRequestTransaction,
  findActivePaymentMethodId,
  findProductForGift,
  findUserDisplayName,
  hasActiveFriendship,
  isUnwantedCategoryFor,
} from '@/lib/dal/gift-request'
import { verifySession } from '@/lib/dal/session'
import { CONSENT_VERSION } from '@/lib/gift/consent'
// D 소유 T018 — origin/main 에 오르기 전까지 이 import 는 미해결이다 (M3-J-BRIEFING ③ 게이트:
// "없으면 import 만 써 두고 대기"). M2 app/friends/actions/shared.ts 와 같은 모양일 것.
// 상대 경로 대신 절대 임포트(@/*) — 프로젝트 규칙이기도 하고, T018 전까지 통합 테스트가
// 같은 지정자로 vi.mock 대체할 수 있어야 한다 (gift-request.test.ts 참조).
import { guarded, type ActionResult } from '@/app/gifts/actions/shared'

/**
 * 선물 요청 생성·취소 Server Action (T038 · US3)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4
 *
 * `createGiftRequest` 의 검사 순서가 정해져 있다 — 바꾸면 오답이 난다:
 *   1. 세션            없으면 verifySession 이 /login 으로 보낸다
 *   2. 동의            consent 가 참이 아니면 CONSENT_REQUIRED (화면 비활성과 이중, FR-014)
 *   3. 친구 active     아니면 NOT_FRIENDS (FR-013 ①)
 *   4. 활성 결제수단    없으면 NO_PAYMENT_METHOD (FR-013 ② — 화면은 SCR-M3-06 강제 진입)
 *   5. 상품            부재·비활성 → PRODUCT_UNAVAILABLE. 수령자 unwanted 카테고리 →
 *                      PRODUCT_UNWANTED (3중 차단의 최종 지점, R9)
 *   6. 자기 자신       SELF_GIFT — 검사 3이 먼저 거르므로 실질적으로 C7 CHECK 와 함께
 *                      이중 방어다. 계약 순서 그대로 둔다
 *   7. 트랜잭션        스냅샷 3종 + 동의 기록 + 수령자 GIFT_REQUEST_RECEIVED 알림 (R7)
 *
 * 화면에서 이미 차단된 조건도 생성 시점에 다시 검증한다 (FR-013) — Server Action 은
 * 클라이언트가 임의 페이로드로 부를 수 있다.
 *
 * `respondDueAt` 은 생성 시점의 **절대 시각 스냅샷**이다 (FR-017 · R11) — 운영 중
 * `GIFT_RESPOND_TTL` 을 바꿔도 이미 뜬 요청은 흔들리지 않는다.
 */

export type CreateGiftRequestErrorCode =
  | 'CONSENT_REQUIRED'
  | 'NOT_FRIENDS'
  | 'NO_PAYMENT_METHOD'
  | 'PRODUCT_UNAVAILABLE'
  | 'PRODUCT_UNWANTED'
  | 'SELF_GIFT'
  | 'STORAGE_FAILED'

export type CancelGiftRequestErrorCode = 'NOT_OWNER' | 'NOT_CANCELLABLE' | 'STORAGE_FAILED'

const CONSENT_REQUIRED_MESSAGE = '동의가 필요해요. 동의 화면에서 확인 후 보내주세요.'
/** 화면 명세 SCR-M3-08 진입 차단 문구 그대로 */
const NOT_FRIENDS_MESSAGE = '친구인 사람에게만 보낼 수 있어요.'
/** 화면 명세 SCR-M3-06 문구 그대로 */
const NO_PAYMENT_METHOD_MESSAGE = '선물을 보내려면 결제수단이 필요합니다.'
/** 부재·비활성을 구분해 알리지 않는다 — 존재 여부가 id 탐색의 힌트가 된다 */
const PRODUCT_UNAVAILABLE_MESSAGE = '지금은 보낼 수 없는 상품이에요.'
const PRODUCT_UNWANTED_MESSAGE = '받는 분이 관심 없다고 한 종류의 상품이에요.'
const SELF_GIFT_MESSAGE = '나에게는 선물을 보낼 수 없어요.'
const CREATE_FAILED_MESSAGE = '요청을 보내지 못했어요. 잠시 후 다시 시도해주세요.'
/** 남의 것·없는 것이 같은 문구다 — 구분해 알리면 id 탐색에 힌트가 된다 */
const NOT_OWNER_MESSAGE = '취소할 수 없는 요청이에요.'
const NOT_CANCELLABLE_MESSAGE = '이미 진행되었거나 끝난 요청은 취소할 수 없어요.'
const CANCEL_FAILED_MESSAGE = '취소하지 못했어요. 잠시 후 다시 시도해주세요.'
/** verifySession 이 User 행을 보장하므로 보통 도달하지 않는다 — 세션 DAL 의 폴백과 같은 값 */
const FALLBACK_DISPLAY_NAME = '이름 미설정'

/**
 * GIFT_RESPOND_TTL 파싱 — quickstart 형식("5m" · "24h"), 기본 5분 (도메인 모델 §9).
 * TODO(T009): D 의 `lib/config/gift.ts` env 헬퍼가 origin/main 에 오르면 그쪽 경유로 바꾼다
 * (R11 "읽기는 기본값을 가진 헬퍼 하나로 모은다"). 값의 출처는 지금도 env 다 — 하드코딩 금지.
 */
const DEFAULT_RESPOND_TTL_MS = 5 * 60_000
const TTL_UNIT_MS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }

function respondTtlMs(): number {
  const raw = process.env.GIFT_RESPOND_TTL?.trim()
  if (!raw) return DEFAULT_RESPOND_TTL_MS
  const match = /^(\d+)([smhd])$/.exec(raw)
  if (!match) {
    console.error(`[gifts/request] GIFT_RESPOND_TTL 형식이 아니다("${raw}") — 기본 5m 을 쓴다`)
    return DEFAULT_RESPOND_TTL_MS
  }
  return Number(match[1]) * TTL_UNIT_MS[match[2]]
}

const createInputSchema = z.object({
  receiverId: z.string().uuid(),
  productId: z.string().uuid(),
  consent: z.boolean(),
})

const cancelInputSchema = z.object({ giftRequestId: z.string().uuid() })

function fail<T>(
  code: CreateGiftRequestErrorCode | CancelGiftRequestErrorCode,
  message: string,
): ActionResult<T> {
  return { ok: false, error: { code, message } }
}

export async function createGiftRequest(input: {
  receiverId: string
  productId: string
  consent: boolean
}): Promise<ActionResult<{ giftRequestId: string; respondDueAt: Date; serverNow: Date }>> {
  // 1. 세션 — 게이트는 guarded 바깥에 둔다 (redirect 예외를 그대로 Next 에 넘긴다)
  const { userId } = await verifySession()

  return guarded(CREATE_FAILED_MESSAGE, async () => {
    // 형식 불량은 검사 순서에 맞춰 뭉갠다 — consent 불량은 2, receiverId 불량은 3, productId 불량은 5
    const parsed = createInputSchema.safeParse(input)
    if (!parsed.success) {
      const paths = new Set(parsed.error.issues.map((issue) => issue.path[0]))
      if (paths.has('consent')) return fail('CONSENT_REQUIRED', CONSENT_REQUIRED_MESSAGE)
      if (paths.has('receiverId')) return fail('NOT_FRIENDS', NOT_FRIENDS_MESSAGE)
      return fail('PRODUCT_UNAVAILABLE', PRODUCT_UNAVAILABLE_MESSAGE)
    }
    const { receiverId, productId, consent } = parsed.data

    // 2. 동의 — 동의 없이 생성된 요청은 존재할 수 없다 (SC-007)
    if (consent !== true) return fail('CONSENT_REQUIRED', CONSENT_REQUIRED_MESSAGE)

    // 3. 친구 active — 해제(REMOVED)도 같다
    if (!(await hasActiveFriendship(userId, receiverId))) {
      return fail('NOT_FRIENDS', NOT_FRIENDS_MESSAGE)
    }

    // 4. 활성 결제수단 — 빌링키 등록이 요청보다 앞선다 (FR-013 ②)
    const paymentMethodId = await findActivePaymentMethodId(userId)
    if (paymentMethodId === null) return fail('NO_PAYMENT_METHOD', NO_PAYMENT_METHOD_MESSAGE)

    // 5. 상품 — 부재와 비활성은 같은 응답, unwanted 는 3중 차단의 최종 지점 (R9)
    const product = await findProductForGift(productId)
    if (!product || !product.isActive) {
      return fail('PRODUCT_UNAVAILABLE', PRODUCT_UNAVAILABLE_MESSAGE)
    }
    if (await isUnwantedCategoryFor(receiverId, product.categoryId)) {
      return fail('PRODUCT_UNWANTED', PRODUCT_UNWANTED_MESSAGE)
    }

    // 6. 자기 자신 — 검사 3·C7 과 이중 방어 (FR-013 ④)
    if (receiverId === userId) return fail('SELF_GIFT', SELF_GIFT_MESSAGE)

    // 7. 트랜잭션 — 스냅샷 3종 + 동의 기록 + 수령자 알림이 함께 생기거나 함께 롤백된다
    const now = new Date()
    const respondDueAt = new Date(now.getTime() + respondTtlMs())
    const receiverDisplayName = (await findUserDisplayName(receiverId)) ?? FALLBACK_DISPLAY_NAME
    const giverDisplayName = (await findUserDisplayName(userId)) ?? FALLBACK_DISPLAY_NAME

    const { giftRequestId } = await createGiftRequestTransaction({
      giverId: userId,
      giverDisplayName,
      receiverId,
      receiverDisplayName,
      product: { id: product.id, name: product.name, imageUrl: product.imageUrl, price: product.price },
      paymentMethodId,
      respondDueAt,
      consentAgreedAt: now,
      consentVersion: CONSENT_VERSION,
    })

    return { ok: true, data: { giftRequestId, respondDueAt, serverNow: now } }
  })
}

/**
 * 주는 사람의 취소 (SCR-M3-11) — `PENDING` 에서만. `PAYING` 진입 후에는 불가 —
 * PG 호출이 이미 나갔다. 조건부 UPDATE 라 ④의 잠금과 경합해도 어느 한쪽만 이긴다 (R2).
 */
export async function cancelGiftRequest(input: {
  giftRequestId: string
}): Promise<ActionResult<{ cancelled: true }>> {
  const { userId } = await verifySession()

  return guarded(CANCEL_FAILED_MESSAGE, async () => {
    const parsed = cancelInputSchema.safeParse(input)
    if (!parsed.success) return fail('NOT_OWNER', NOT_OWNER_MESSAGE)

    const outcome = await cancelOwnPendingGiftRequest(userId, parsed.data.giftRequestId)
    if (outcome === 'NOT_OWNER') return fail('NOT_OWNER', NOT_OWNER_MESSAGE)
    if (outcome === 'NOT_CANCELLABLE') return fail('NOT_CANCELLABLE', NOT_CANCELLABLE_MESSAGE)

    return { ok: true, data: { cancelled: true } }
  })
}
