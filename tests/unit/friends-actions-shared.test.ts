/**
 * T015 — app/friends/actions/shared.ts 단위 테스트
 * 계약: specs/002-friend-taste-sharing/contracts/server-actions.md §2
 *
 * M2 Server Action 파일 4개(accept-invite·invite-link·notification·friendship)가 함께 쓰는
 * 기반이다. 예상 가능한 실패는 결과 값으로, 예상 못 한 예외는 guarded 가 STORAGE_FAILED 로 —
 * M1 app/taste/actions.ts 의 guarded 와 같은 동작이어야 한다 (예외로 새면 error.tsx 가
 * 화면을 갈아치우며 입력이 사라진다).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { failure, guarded, type ActionResult } from '@/app/friends/actions/shared'

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  consoleError.mockClear()
})

describe('failure', () => {
  it('계약의 실패 형태 { ok: false, error: { code, message } } 를 만든다', () => {
    const result: ActionResult<never> = failure({
      code: 'LINK_INVALID',
      message: '더 이상 쓸 수 없는 링크예요.',
    })
    expect(result).toEqual({
      ok: false,
      error: { code: 'LINK_INVALID', message: '더 이상 쓸 수 없는 링크예요.' },
    })
  })
})

describe('guarded', () => {
  it('성공 결과는 그대로 돌려준다', async () => {
    const result = await guarded('실패 문구', async () => ({
      ok: true as const,
      data: { friendUserId: 'u-1' },
    }))
    expect(result).toEqual({ ok: true, data: { friendUserId: 'u-1' } })
  })

  it('값으로 돌려준 실패도 그대로 돌려준다 — 덮어쓰지 않는다', async () => {
    const alreadyFriends = failure<never>({ code: 'ALREADY_FRIENDS', message: '이미 친구예요.' })
    const result = await guarded('실패 문구', async () => alreadyFriends)
    expect(result).toBe(alreadyFriends)
  })

  it('예상 못 한 예외는 STORAGE_FAILED 결과로 바꾸고 원인을 console.error 로 남긴다', async () => {
    const cause = new Error('db down')
    const result = await guarded('친구 추가를 완료하지 못했어요.', async () => {
      throw cause
    })

    expect(result).toEqual({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: '친구 추가를 완료하지 못했어요.' },
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]).toContain(cause)
  })

  it('Next redirect 예외(digest NEXT_REDIRECT…)는 삼키지 않고 다시 던진다', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;push;/friends;307;',
    })

    await expect(
      guarded('실패 문구', async () => {
        throw redirectError
      }),
    ).rejects.toBe(redirectError)
    expect(consoleError).not.toHaveBeenCalled()
  })
})
