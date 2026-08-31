'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { failure, guarded, type ActionResult } from '@/app/gifts/actions/shared'
import { encryptBillingKey } from '@/lib/crypto/billing-key'
import { CARD_BRANDS } from '@/lib/payment/card-brands'
import {
  countActiveRequestsUsing,
  createPaymentMethod,
  isMyPaymentMethod,
  softDeletePaymentMethod,
} from '@/lib/dal/payment-method'
import { verifySession } from '@/lib/dal/session'
import { getPortOneClient } from '@/lib/portone/client'

/**
 * 결제수단 Server Action — US2 (T031)
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4
 *
 * registerPaymentMethod 검사·처리 순서:
 *   1. 세션
 *   2. 입력 형태 (브랜드 · 뒷자리 4자리)
 *   3. PortOne 빌링키 발급 (T013 경유) — 실패는 결과 값이다 (ISSUE_FAILED)
 *   4. **암호화** 후 저장 (T011) — 평문 빌링키가 DAL·DB 로 가지 않는다
 *
 * 🔒 카드번호·CVC 는 이 함수의 입력에 아예 없다 (FR-008). mock 은 브랜드와 뒷자리만 받고,
 *    실연동(T058)에서는 결제사 위젯이 발급한 값을 같은 자리에서 받는다.
 */

const REGISTER_FAILED_MESSAGE = '결제수단을 등록하지 못했어요. 잠시 후 다시 시도해주세요.'
const DELETE_FAILED_MESSAGE = '결제수단을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.'
const NOT_OWNER_MESSAGE = '이미 삭제된 결제수단이에요.'

const registerInputSchema = z.object({
  cardBrand: z.enum(CARD_BRANDS),
  cardLast4: z.string().regex(/^\d{4}$/, '카드 뒷자리 4자리를 입력해주세요.'),
})

export async function registerPaymentMethod(input: {
  cardBrand: string
  cardLast4: string
}): Promise<ActionResult<{ paymentMethodId: string }>> {
  const { userId } = await verifySession()

  return guarded(REGISTER_FAILED_MESSAGE, async () => {
    const parsed = registerInputSchema.safeParse(input)
    if (!parsed.success) {
      // 계약 §4 의 registerPaymentMethod 실패 코드는 ISSUE_FAILED · STORAGE_FAILED 둘뿐이다 —
      // 형태 오류도 "발급까지 가지 못했다"는 같은 결과다. 문구로 구분한다.
      return failure({
        code: 'ISSUE_FAILED',
        message: parsed.error.issues[0]?.message ?? '카드 정보를 다시 확인해주세요.',
      })
    }

    const issued = await getPortOneClient().issueBillingKey({
      userId,
      cardBrand: parsed.data.cardBrand,
      cardLast4: parsed.data.cardLast4,
    })
    if (!issued.ok) {
      // 실패 원인은 결제사 문구다 — 그대로 보여준다. 예외로 던지지 않는다 (contracts §1)
      return failure({ code: 'ISSUE_FAILED', message: issued.reason })
    }

    const { paymentMethodId } = await createPaymentMethod({
      userId,
      encryptedBillingKey: encryptBillingKey(issued.billingKey),
      cardBrand: parsed.data.cardBrand,
      cardLast4: parsed.data.cardLast4,
    })

    revalidatePath('/payment-methods')
    revalidatePath('/my')
    return { ok: true, data: { paymentMethodId } }
  })
}

/**
 * 삭제 — soft 다. 진행 중 요청이 이 수단을 참조해도 **막지 않는다** (FR-011):
 * 경고는 화면이 이미 보여줬고, 그 뒤의 결제 시도는 실패 경로(SCR-M3-16)로 흐른다.
 * 반환하는 건수는 삭제 시점에 관측한 값이다 — 화면이 "N건이 영향을 받습니다"로 이어 쓴다.
 */
export async function deletePaymentMethod(input: {
  paymentMethodId: string
}): Promise<ActionResult<{ activeRequestCount: number }>> {
  const { userId } = await verifySession()

  return guarded(DELETE_FAILED_MESSAGE, async () => {
    const paymentMethodId = input?.paymentMethodId
    // uuid 가 아니면 그런 수단이 있을 수 없다 — DB 까지 가지 않고 같은 답을 준다 (M2 removeFriend 패턴)
    if (!z.uuid().safeParse(paymentMethodId).success) {
      return failure({ code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE })
    }
    if (!(await isMyPaymentMethod(userId, paymentMethodId))) {
      return failure({ code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE })
    }

    // 건수를 먼저 센다 — 삭제 뒤에 세면 어차피 같은 값이지만, 순서를 고정해 두면
    // 나중에 "삭제 시 요청을 함께 정리" 같은 변경이 들어와도 관측 시점이 흔들리지 않는다
    const activeRequestCount = await countActiveRequestsUsing(paymentMethodId)

    const { deleted } = await softDeletePaymentMethod(userId, paymentMethodId)
    if (!deleted) {
      return failure({ code: 'NOT_OWNER', message: NOT_OWNER_MESSAGE })
    }

    revalidatePath('/payment-methods')
    revalidatePath('/my')
    return { ok: true, data: { activeRequestCount } }
  })
}
