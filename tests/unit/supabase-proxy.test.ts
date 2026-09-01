import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: h.createServerClient }))

const { updateSupabaseSession } = await import('@/lib/supabase/proxy')

describe('updateSupabaseSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project-ref.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  })

  it('getClaims로 세션을 검증하고 갱신 쿠키를 요청과 응답에 함께 기록한다', async () => {
    h.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getClaims: h.getClaims.mockImplementation(async () => {
          options.cookies.setAll(
            [
              {
                name: 'sb-project-ref-auth-token',
                value: 'refreshed-session',
                options: { path: '/', sameSite: 'lax' },
              },
            ],
            {
              'Cache-Control': 'private, no-store',
              Expires: '0',
              Pragma: 'no-cache',
            },
          )
          return { data: { claims: { sub: 'user-id' } }, error: null }
        }),
      },
    }))

    const request = new NextRequest('http://localhost:3000/taste', {
      headers: { cookie: 'sb-project-ref-auth-token=old-session' },
    })
    const response = await updateSupabaseSession(request)

    expect(h.getClaims).toHaveBeenCalledOnce()
    expect(request.cookies.get('sb-project-ref-auth-token')?.value).toBe('refreshed-session')
    expect(response.cookies.get('sb-project-ref-auth-token')?.value).toBe('refreshed-session')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('expires')).toBe('0')
    expect(response.headers.get('pragma')).toBe('no-cache')
  })
})
