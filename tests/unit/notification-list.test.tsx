/**
 * 알림 목록 컴포넌트 테스트 (T047 · US3 · FR-030~FR-032)
 *
 * 이 컴포넌트가 클라이언트인 이유는 **읽음 처리 후 낙관적 갱신** 하나다. 그 갱신과
 * 실패 시 되돌림은 화면(Server Component)이 아니라 여기서만 판정할 수 있다 —
 * E2E(invite-control.spec.ts)는 H 의 화면들이 서야 돌기 시작한다.
 */
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/app/friends/actions/notification', () => ({
  markNotificationRead: h.markNotificationRead,
  markAllNotificationsRead: h.markAllNotificationsRead,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }))

// 앱 라우터 문맥 밖이라 next/link 는 평범한 <a> 로 바꾼다 — 검증 대상은 href 와 onClick 이다
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { NotificationList } = await import('@/components/notification/notification-list')

// T056 이후 문구·이동 경로는 서버(lib/notification/display.ts)가 만들어 내려준다 —
// 이 컴포넌트는 종류를 모른다. 그래서 픽스처도 완성된 문구·href 를 담는다.
const UNREAD = {
  id: '11111111-1111-4111-8111-111111111111',
  href: '/friends/22222222-2222-4222-8222-222222222222',
  message: '김민수님이 링크로 친구가 되었어요',
  createdAtLabel: '3분 전',
  createdAtISO: '2026-08-31T11:57:00.000Z',
  isRead: false,
}

const READ = {
  id: '33333333-3333-4333-8333-333333333333',
  href: '/gifts/44444444-4444-4444-8444-444444444444/result',
  message: '이서연님 선물의 결제가 완료되었어요',
  createdAtLabel: '어제',
  createdAtISO: '2026-08-30T12:00:00.000Z',
  isRead: true,
}

describe('NotificationList (T047)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.markNotificationRead.mockResolvedValue({ ok: true, data: { ok: true } })
    h.markAllNotificationsRead.mockResolvedValue({ ok: true, data: { count: 1 } })
  })

  it('미읽음만 표식을 달고, 각 줄은 그 친구의 취향 카드로 연결된다 (FR-030 · FR-032)', () => {
    render(<NotificationList notifications={[UNREAD, READ]} />)

    expect(screen.getAllByText('읽지 않음')).toHaveLength(1)
    expect(screen.getByText(/김민수님이 링크로 친구가 되었어요/)).toBeInTheDocument()
    expect(screen.getByText('3분 전')).toBeInTheDocument()

    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', UNREAD.href)
    // 선물 알림은 선물 화면으로 간다 — 목록은 종류를 모른 채 href 를 그대로 쓴다 (T056)
    expect(links[1]).toHaveAttribute('href', READ.href)
  })

  it('알림을 누르면 표식이 즉시 사라지고 그 id 로 읽음 처리를 부른다 (FR-031)', async () => {
    render(<NotificationList notifications={[UNREAD, READ]} />)

    fireEvent.click(screen.getAllByRole('link')[0])

    // 서버 응답을 기다리지 않는다 — 누른 즉시 친구 상세로 넘어가기 때문이다
    await waitFor(() => expect(screen.queryByText('읽지 않음')).not.toBeInTheDocument())
    expect(h.markNotificationRead).toHaveBeenCalledWith({ notificationId: UNREAD.id })
  })

  it('이미 읽은 알림을 눌러도 읽음 처리를 부르지 않는다', async () => {
    render(<NotificationList notifications={[READ]} />)

    fireEvent.click(screen.getByRole('link'))

    await waitFor(() => expect(h.markNotificationRead).not.toHaveBeenCalled())
  })

  it('읽음 처리가 실패하면 표식을 되돌리고 오류 문구를 보인다', async () => {
    h.markNotificationRead.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_OWNER', message: '내 알림이 아니에요.' },
    })
    render(<NotificationList notifications={[UNREAD]} />)

    fireEvent.click(screen.getByRole('link'))

    // 읽지 않은 것을 읽은 것처럼 두면 사용자가 알림을 잃는다 — 표식이 돌아와야 한다
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('내 알림이 아니에요.'))
    expect(screen.getByText('읽지 않음')).toBeInTheDocument()
  })

  it('호출 자체가 throw 해도 표식을 되돌린다 — 예외가 error.tsx 로 번지지 않는다 (FR-016)', async () => {
    h.markNotificationRead.mockRejectedValue(new Error('네트워크 단절'))
    render(<NotificationList notifications={[UNREAD]} />)

    fireEvent.click(screen.getByRole('link'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByText('읽지 않음')).toBeInTheDocument()
  })

  it('모두 읽음은 미읽음이 있을 때만 보이고, 누르면 전부 표식이 사라진다', async () => {
    const secondUnread = { ...UNREAD, id: '55555555-5555-4555-8555-555555555555' }
    const { rerender } = render(<NotificationList notifications={[UNREAD, secondUnread, READ]} />)

    expect(screen.getAllByText('읽지 않음')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '모두 읽음' }))

    await waitFor(() => expect(screen.queryByText('읽지 않음')).not.toBeInTheDocument())
    expect(h.markAllNotificationsRead).toHaveBeenCalledTimes(1)
    // 지울 것이 없으면 버튼도 없다
    expect(screen.queryByRole('button', { name: '모두 읽음' })).not.toBeInTheDocument()

    rerender(<NotificationList notifications={[READ]} />)
    expect(screen.queryByRole('button', { name: '모두 읽음' })).not.toBeInTheDocument()
  })

  it('모두 읽음이 실패하면 미읽음 표식이 전부 돌아온다', async () => {
    h.markAllNotificationsRead.mockResolvedValue({
      ok: false,
      error: { code: 'STORAGE_FAILED', message: '읽음으로 표시하지 못했어요.' },
    })
    const secondUnread = { ...UNREAD, id: '55555555-5555-4555-8555-555555555555' }
    render(<NotificationList notifications={[UNREAD, secondUnread]} />)

    fireEvent.click(screen.getByRole('button', { name: '모두 읽음' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getAllByText('읽지 않음')).toHaveLength(2)
  })
})
