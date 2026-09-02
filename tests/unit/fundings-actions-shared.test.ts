/**
 * T015 — app/fundings/actions/shared.ts 단위 테스트
 * 계약: specs/004-group-funding/contracts/server-actions.md §4
 *
 * M4 Server Action 파일 셋(create · contribute · manage)이 함께 쓰는 기반이다. M3 gifts/actions/shared.ts
 * 이식본이라 동작도 같아야 한다: 예상 가능한 실패는 결과 값으로, 예상 못 한 예외는 STORAGE_FAILED 로,
 * redirect 예외는 그대로. 돈이 움직이는 경로라 예외가 새면 사용자는 참여(결제)가 됐는지 알 수 없다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  failure,
  guarded,
  type ActionErrorCode,
  type ActionResult,
} from '@/app/fundings/actions/shared'

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  consoleError.mockClear()
})

describe('failure', () => {
  it('계약의 실패 형태 { ok: false, error: { code, message } } 를 만든다', () => {
    const result: ActionResult<never> = failure({
      code: 'OVER_REMAINING',
      message: '남은 금액보다 큰 금액은 참여할 수 없어요.',
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'OVER_REMAINING', message: '남은 금액보다 큰 금액은 참여할 수 없어요.' },
    })
  })

  it('계약 §4 의 실패 코드를 전부 담는다 — Action 파일마다 코드를 새로 만들지 않게', () => {
    // 컴파일 타임 검사가 본체다. 코드가 빠지면 이 배열의 타입이 맞지 않는다.
    const codes: ActionErrorCode[] = [
      'NOT_FRIENDS',
      'NO_PAYMENT_METHOD',
      'INVALID_AMOUNTS',
      'INVALID_DEADLINE',
      'CONSENT_REQUIRED',
      'NOT_ALLOWED',
      'FUNDING_CLOSED',
      'OVER_REMAINING',
      'PAYMENT_FAILED',
      'NOT_OWNER',
      'NOT_RESERVED',
      'NOT_ORGANIZER',
      'NOT_OPEN',
      'NOT_RETRYABLE',
      'RETRY_EXPIRED',
      'STORAGE_FAILED',
    ]
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('guarded', () => {
  it('성공 결과는 그대로 돌려준다', async () => {
    const result = await guarded('실패 문구', async () => ({
      ok: true as const,
      data: { fundingId: 'f-1' },
    }))
    expect(result).toEqual({ ok: true, data: { fundingId: 'f-1' } })
  })

  it('값으로 돌려준 실패도 그대로 돌려준다 — 덮어쓰지 않는다', async () => {
    const closed = failure<never>({ code: 'FUNDING_CLOSED', message: '이미 마감된 펀딩이에요.' })
    const result = await guarded('실패 문구', async () => closed)
    expect(result).toBe(closed)
  })

  it('예상 못 한 예외는 STORAGE_FAILED 결과로 바꾸고 원인을 console.error 로 남긴다', async () => {
    const cause = new Error('db down')
    const result = await guarded('참여를 처리하지 못했어요.', async () => {
      throw cause
    })

    expect(result).toEqual({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: '참여를 처리하지 못했어요.' },
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]).toContain(cause)
  })

  it('Next redirect 예외는 삼키지 않고 다시 던진다 — 개설 완료 → 상세 이동이 막힌다', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;push;/fundings/abc;307;',
    })

    await expect(
      guarded('실패 문구', async () => {
        throw redirectError
      }),
    ).rejects.toBe(redirectError)
    expect(consoleError).not.toHaveBeenCalled()
  })
})
