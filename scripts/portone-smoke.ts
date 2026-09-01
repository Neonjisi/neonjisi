/**
 * T058 — PortOne 실연동 스모크 (수동 실행 전용)
 *
 *   npx tsx scripts/portone-smoke.ts
 *
 * .env.local 을 읽고 이 프로세스 안에서만 PORTONE_MODE 를 real 로 강제한 뒤,
 * 실 API(api.portone.io)에 인증이 붙는지 확인한다.
 *
 * **비용이 들 수 없다** — 존재하지 않는 빌링키로 결제를 시도하므로 반드시 실패한다.
 * 인증 실패(401)와 정상 거절(빌링키 없음)은 reason 이 다르게 정규화되어 구분된다.
 *
 * E2E·통합 테스트는 여전히 mock 이다 (team-assignment §6). 이 스크립트는 실키가
 * .env.local 에 채워진 사람만 돌린다 — 비어 있으면 무엇이 비었는지 던져서 알려준다.
 */
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())
process.env.PORTONE_MODE = 'real'

async function main(): Promise<void> {
  // env 를 실제로 세팅한 뒤에 불러야 하므로 여기서 import 한다
  const { getPortOneClient } = await import('@/lib/portone/client')

  console.log('[smoke] PORTONE_MODE=real — 실연동 설정 검증')
  const client = getPortOneClient() // 필수 env 3종이 비면 여기서 던진다

  const paymentId = client.createPaymentId()
  console.log(`[smoke] 결제 시도 id: ${paymentId}`)
  console.log('[smoke] 존재하지 않는 빌링키로 결제 시도 — 반드시 실패해야 정상이다')

  const charged = await client.chargeBillingKey({
    billingKey: 'billing-key-smoke-nonexistent',
    paymentId,
    amount: 1000,
    orderName: '실연동 스모크 (결제되지 않음)',
  })

  if (charged.ok) {
    // 있을 수 없는 결과 — 가짜 빌링키가 결제됐다면 무언가 심각하게 잘못됐다
    console.error('[smoke] ❌ 가짜 빌링키 결제가 성공으로 돌아왔다 — 즉시 확인 필요')
    process.exitCode = 1
    return
  }

  switch (charged.reason) {
    case '결제사 인증에 실패했습니다':
      console.error('[smoke] ❌ 인증 실패 (401) — PORTONE_API_SECRET 확인')
      console.error('        V2 API Secret 이어야 한다: PortOne 콘솔 → 결제 연동 → 식별코드·API Keys')
      console.error('        (토스 시크릿 키 test_sk_… 는 여기 들어갈 값이 아니다 — 채널 설정용)')
      process.exitCode = 1
      return
    case '결제사에서 요청을 거절했습니다':
      console.log('[smoke] ✅ 인증 통과 — 결제사가 없는 빌링키를 정상적으로 거절했다')
      console.log('        실키·상점·API 왕복이 성립한다. 실 빌링키 발급(결제사 인증 창)은 실서비스 전환 몫.')
      return
    default:
      console.error(`[smoke] ⚠️ 예상 밖의 실패: ${charged.reason} — 위의 [portone] 로그로 원인을 본다`)
      process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('[smoke] ❌ 스모크가 던졌다 —', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
