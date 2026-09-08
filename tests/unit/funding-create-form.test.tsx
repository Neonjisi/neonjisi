/**
 * 펀딩 개설 폼 — 최소 달성 금액 자동 산출 (FR-002)
 *
 * 통합테스트 피드백: "최소 달성금액 사용자가 설정하게 돼있는데 비율 자동 적용을 고려해볼
 * 필요가 있을 듯 — 백엔드에서 로직 짜고 프런트로 넘김".
 *
 * 이전 구현은 `Math.floor(product.price * 0.7)` 을 **초기값 한 번**만 계산했다. 그래서
 *   ① 비율이 화면에 박혀 서버(`createFunding`)가 같은 규칙을 쓸 수 없었고
 *   ② 기준이 **상품 가격**이라, 사용자가 목표 금액을 바꿔도 최소 달성선이 그대로 남았다
 *      — 목표를 20만원으로 올려도 최소는 상품가 기준 7만원에 머무는 식.
 * 비율은 서버(`lib/config/funding.ts`)가 정해 `minAmountRatio` 로 내려주고, 화면은 **목표
 * 금액**을 따라 다시 계산한다. 단 사용자가 직접 고친 값은 덮지 않는다.
 */
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ createFunding: vi.fn(), push: vi.fn() }))

vi.mock('@/app/fundings/actions/create', () => ({ createFunding: h.createFunding }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string; children?: ReactNode }) => <span role="img" aria-label={alt} />,
}))

const { FundingCreateForm } = await import('@/components/funding/create-form')

const PRODUCT = { id: '33333333-3333-4333-8333-333333333333', name: '테스트 상품', imageUrl: null, price: 100_000 }
const FRIEND = { userId: '44444444-4444-4444-8444-444444444444', displayName: '친구' }
const ME = '55555555-5555-4555-8555-555555555555'

/** 금액 스텝(2단계)에서 시작한다 — 받는 사람·결제수단은 이미 갖춰진 상태 */
function renderAmountStep(minAmountRatio: number) {
  return render(
    <FundingCreateForm
      currentUserId={ME}
      product={PRODUCT}
      friends={[FRIEND]}
      initialReceiverId={FRIEND.userId}
      hasPaymentMethod
      initialStep={2}
      minAmountRatio={minAmountRatio}
      returnTo={`/products/${PRODUCT.id}`}
    />,
  )
}

const goalField = () => screen.getByLabelText('목표 금액') as HTMLInputElement
const minimumField = () => screen.getByLabelText('최소 달성 금액') as HTMLInputElement

describe('FundingCreateForm — 최소 달성 금액 비율 (FR-002)', () => {
  it('초기값은 서버가 내려준 비율로 정해진다 — 0.7 이 화면에 박혀 있지 않다', () => {
    renderAmountStep(0.5)
    expect(minimumField().value).toBe('50000') // 목표 100,000 x 0.5
  })

  it('목표 금액을 바꾸면 최소 달성 금액이 따라온다 — 기준은 상품 가격이 아니라 목표 금액이다', () => {
    renderAmountStep(0.7)
    expect(minimumField().value).toBe('70000')

    fireEvent.change(goalField(), { target: { value: '200000' } })

    expect(minimumField().value).toBe('140000')
  })

  it('사용자가 최소 달성 금액을 직접 고치면 그 뒤 목표가 바뀌어도 덮어쓰지 않는다', () => {
    renderAmountStep(0.7)

    fireEvent.change(minimumField(), { target: { value: '30000' } })
    fireEvent.change(goalField(), { target: { value: '200000' } })

    expect(minimumField().value).toBe('30000')
  })
})
