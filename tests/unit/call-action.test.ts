/**
 * lib/actions/call-action.ts 단위 테스트 (FR-016)
 *
 * 클라이언트가 Server Action 을 부를 때 호출 자체가 throw 하면(네트워크 단절 등)
 * startTransition 안에서 unhandled 가 되어 error.tsx 가 화면을 갈아치우고 입력이 사라진다.
 * 헬퍼가 throw 를 STORAGE_FAILED 결과로 바꾸되, Next 의 redirect 예외만은 다시 던지는지 본다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DELETE_FAILED_MESSAGE, SAVE_FAILED_MESSAGE, callAction } from '@/lib/actions/call-action'

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  consoleError.mockClear()
})

describe('callAction', () => {
  it('성공 결과는 그대로 돌려준다', async () => {
    const result = await callAction(async () => ({ ok: true as const, data: { itemId: 'i-1' } }))
    expect(result).toEqual({ ok: true, data: { itemId: 'i-1' } })
  })

  it('Action 이 값으로 돌려준 실패도 그대로 돌려준다 — 헬퍼가 덮어쓰지 않는다', async () => {
    const failure = {
      ok: false as const,
      error: { code: 'DUPLICATE_ITEM' as const, message: '이미 같은 항목이 있어요.' },
    }
    const result = await callAction(async () => failure)
    expect(result).toBe(failure)
  })

  it('호출이 throw 하면 STORAGE_FAILED 결과로 바꾸고 원인을 console.error 로 남긴다', async () => {
    const cause = new TypeError('Failed to fetch')
    const result = await callAction(async () => {
      throw cause
    })

    expect(result).toEqual({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: SAVE_FAILED_MESSAGE },
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]).toContain(cause)
  })

  it('실패 문구를 지정할 수 있다 — 삭제는 "삭제하지 못했어요"', async () => {
    const result = await callAction(async () => {
      throw new Error('boom')
    }, DELETE_FAILED_MESSAGE)

    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_FAILED', message: DELETE_FAILED_MESSAGE } })
    expect(DELETE_FAILED_MESSAGE).not.toBe(SAVE_FAILED_MESSAGE)
  })

  it('Next redirect 예외(digest NEXT_REDIRECT…)는 삼키지 않고 다시 던진다 — React 가 처리한다', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;push;/onboarding;307;',
    })

    await expect(
      callAction(async () => {
        throw redirectError
      }),
    ).rejects.toBe(redirectError)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('digest 가 있어도 NEXT_REDIRECT 가 아니면 일반 예외로 취급한다', async () => {
    const result = await callAction(async () => {
      throw Object.assign(new Error('render error'), { digest: '1234567890' })
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_FAILED' } })
  })
})
