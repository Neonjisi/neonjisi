/**
 * T032 — lib/navigation/return-to.ts 단위 테스트
 *
 * 복귀 경로는 쿼리에서 온다 = 주소를 만든 사람이 정한 값이다. 그대로 이동하면
 * **열린 리다이렉트**가 된다 — 결제수단 등록 직후는 사용자가 "앱이 시킨 대로" 움직이는
 * 순간이라 외부 사이트로 튕겨도 눈치채기 어렵다.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_RETURN_TO, safeReturnTo } from '@/lib/navigation/return-to'

const NEWLINE = String.fromCharCode(10)
const TAB = String.fromCharCode(9)

describe('safeReturnTo', () => {
  it('앱 안의 절대 경로는 그대로 통과시킨다', () => {
    expect(safeReturnTo('/gifts/new')).toBe('/gifts/new')
    expect(safeReturnTo('/gifts/new?productId=abc')).toBe('/gifts/new?productId=abc')
    expect(safeReturnTo('/products/for/11111111-1111-4111-8111-111111111111')).toBe(
      '/products/for/11111111-1111-4111-8111-111111111111',
    )
  })

  it('외부 주소를 거부한다', () => {
    expect(safeReturnTo('https://evil.example.com')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo('//evil.example.com')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo('/\\evil.example.com')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo('javascript:alert(1)')).toBe(DEFAULT_RETURN_TO)
  })

  it('상대 경로·빈 값·없음은 기본 경로로 떨어진다', () => {
    expect(safeReturnTo('gifts/new')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo('')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo(undefined)).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo(null)).toBe(DEFAULT_RETURN_TO)
  })

  it('제어문자가 섞인 값을 거부한다 — 브라우저마다 다르게 정규화된다', () => {
    expect(safeReturnTo('/gifts' + NEWLINE + 'new')).toBe(DEFAULT_RETURN_TO)
    expect(safeReturnTo('/' + TAB + 'gifts')).toBe(DEFAULT_RETURN_TO)
  })

  it('호출부가 다른 기본 경로를 줄 수 있다 — 요청 플로우는 요청 화면으로 돌아간다', () => {
    expect(safeReturnTo('https://evil.example.com', '/gifts/new')).toBe('/gifts/new')
  })
})
