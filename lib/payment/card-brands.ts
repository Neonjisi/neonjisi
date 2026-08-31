/**
 * mock 등록 폼이 고르는 카드사 목록 (T031·T032)
 *
 * 'use server' 파일은 async 함수만 export 할 수 있어 상수를 여기 둔다.
 * 등록 폼(components/payment/billing-key-form.tsx)과 Action 의 입력 검증이 같은 목록을 본다 —
 * 화면에 없는 브랜드가 서버로 들어오면 그건 정상 경로가 아니다.
 *
 * 실연동(T058)에서는 결제사 위젯이 브랜드를 정하므로 이 목록은 mock 폼에서만 쓰인다.
 */
export const CARD_BRANDS = ['신한', '국민', '현대', '삼성', '토스뱅크'] as const

export type CardBrand = (typeof CARD_BRANDS)[number]
