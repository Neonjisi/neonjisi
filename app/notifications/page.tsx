import { BellOff } from "lucide-react";
import {
  NotificationList,
  type NotificationItem,
} from "@/components/notification/notification-list";
import { TopBar } from "@/components/ui/top-bar";
import { getMyNotifications } from "@/lib/dal/notification";
import { formatRelativeTime } from "@/lib/format/time";

/**
 * 알림 목록 (SCR-M3-02 · T046) — 게이트: `getMyNotifications()` 안의 verifySession()
 *
 * **원래 M3 화면인데 M2 로 앞당겼다** (clarify Q4). 승인 절차를 없앤 대가로 남긴 통제 수단이
 * 만료·중지·알림 셋인데, 알림이 빠지면 발급자가 링크 유출을 알아챌 방법이 없다 (FR-017).
 *
 * M2 의 알림은 친구 성사 한 종류뿐이다 (research R6) — 도메인 모델 §5 의 나머지 10종은
 * M3·M4 에서 더한다. 여기서 `type` 별 분기를 미리 만들지 않는 이유다.
 *
 * 상대 시각은 **서버에서** 문자열로 만든다 (lib/format/time) — 클라이언트가 다시 계산하면
 * 서버 렌더와 1분 차이로 어긋나 hydration 경고가 난다.
 */

/** FR-034 — 빈 목록만 두지 않는다. 무엇이 여기 쌓이는지 알려준다 */
function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 pb-16 text-center">
      <span className="grid size-[72px] place-items-center rounded-full bg-neutral-100">
        <BellOff size={30} className="text-neutral-400" aria-hidden />
      </span>
      <p className="text-base font-bold text-neutral-900">아직 받은 알림이 없어요</p>
      <p className="text-sm leading-relaxed text-neutral-600">
        내 초대 링크로 친구가 생기면 여기에서 알려드릴게요.
      </p>
    </div>
  );
}

export default async function NotificationsPage() {
  const notifications = await getMyNotifications();
  // 한 화면 안의 기준 시각을 하나로 고정한다 — 줄마다 now 가 달라 순서와 표기가 엇갈리지 않게
  const now = new Date();

  const items: NotificationItem[] = notifications.map((notification) => ({
    id: notification.id,
    // 표시명은 발생 시점의 스냅샷이다 — 해제된 뒤에도 이름을 얻으려 User 를 다시 읽지 않는다
    friendUserId: notification.payload.friendUserId,
    friendDisplayName: notification.payload.friendDisplayName,
    createdAtLabel: formatRelativeTime(notification.createdAt, now),
    createdAtISO: notification.createdAt.toISOString(),
    isRead: notification.readAt !== null,
  }));

  return (
    <>
      <TopBar title="알림" backHref="/my" />
      <main className="flex flex-1 flex-col">
        {items.length === 0 ? <EmptyState /> : <NotificationList notifications={items} />}
      </main>
    </>
  );
}
