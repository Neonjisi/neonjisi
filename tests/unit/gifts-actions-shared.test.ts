/**
 * T018 — app/gifts/actions/shared.ts 단위 테스트
 * 계약: specs/003-gift-request-payment/contracts/server-actions.md §4
 *
 * M3 Server Action 파일 4개(request·respond·payment · payment-methods/actions ·
 * events/actions)가 함께 쓰는 기반이다. **기반 단계에서 먼저 만들고 그 뒤로는 고치지 않는다**
 * (team-assignment §1) — 스토리 작업 중에 여기를 고치면 US 셋이 같은 파일에서 충돌한다.
 *
 * M2 friends/actions/shared.ts 와 같은 동작이어야 한다: 예상 가능한 실패는 결과 값으로,
 * 예상 못 한 예외는 STORAGE_FAILED 로. 결제 경로에서 특히 중요하다 — 예외가 새면
 * error.tsx 가 화면을 갈아치우고, 사용자는 결제가 됐는지 안 됐는지 알 수 없다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { failure, guarded, type ActionErrorCode, type ActionResult } from '@/app/gifts/actions/shared'

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  consoleError.mockClear()
})

describe('failure', () => {
  it('계약의 실패 형태 { ok: false, error: { code, message } } 를 만든다', () => {
    const result: ActionResult<never> = failure({
      code: 'NO_PAYMENT_METHOD',
      message: '결제수단을 먼저 등록해주세요.',
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'NO_PAYMENT_METHOD', message: '결제수단을 먼저 등록해주세요.' },
    })
  })

  it('계약 §4 의 실패 코드를 전부 담는다 — Action 파일마다 코드를 새로 만들지 않게', () => {
    // 컴파일 타임 검사가 본체다. 코드가 빠지면 이 배열의 타입이 맞지 않는다.
    const codes: ActionErrorCode[] = [
      'NOT_FRIENDS',
      'NO_PAYMENT_METHOD',
      'PRODUCT_UNWANTED',
      'PRODUCT_UNAVAILABLE',
      'SELF_GIFT',
      'CONSENT_REQUIRED',
      'NOT_OWNER',
      'NOT_CANCELLABLE',
      'NOT_RECEIVER',
      'GIFT_EXPIRED',
      'GIFT_CANCELLED',
      'ALREADY_RESPONDED',
      'COUNTER_OVER_LIMIT',
      'NOT_RETRYABLE',
      'RETRY_EXPIRED',
      'ISSUE_FAILED',
      'VALIDATION_FAILED',
      'STORAGE_FAILED',
    ]
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('guarded', () => {
  it('성공 결과는 그대로 돌려준다', async () => {
    const result = await guarded('실패 문구', async () => ({
      ok: true as const,
      data: { giftRequestId: 'g-1' },
    }))
    expect(result).toEqual({ ok: true, data: { giftRequestId: 'g-1' } })
  })

  it('값으로 돌려준 실패도 그대로 돌려준다 — 덮어쓰지 않는다', async () => {
    const overLimit = failure<never>({
      code: 'COUNTER_OVER_LIMIT',
      message: '요청 금액을 넘는 상품은 고를 수 없어요.',
    })
    const result = await guarded('실패 문구', async () => overLimit)
    expect(result).toBe(overLimit)
  })

  it('예상 못 한 예외는 STORAGE_FAILED 결과로 바꾸고 원인을 console.error 로 남긴다', async () => {
    const cause = new Error('db down')
    const result = await guarded('요청을 보내지 못했어요.', async () => {
      throw cause
    })

    expect(result).toEqual({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: '요청을 보내지 못했어요.' },
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]).toContain(cause)
  })

  it('Next redirect 예외는 삼키지 않고 다시 던진다 — 동의 화면 → 완료 화면 이동이 막힌다', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;push;/gifts/new/done;307;',
    })

    await expect(
      guarded('실패 문구', async () => {
        throw redirectError
      }),
    ).rejects.toBe(redirectError)
    expect(consoleError).not.toHaveBeenCalled()
  })
})
