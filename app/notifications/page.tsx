import { BellOff } from "lucide-react";
import { NotificationList } from "@/components/notification/notification-list";
import { TopBar } from "@/components/ui/top-bar";
import { getMyNotifications } from "@/lib/dal/notification";
import { toNotificationItem } from "@/lib/notification/display";
import { safeReturnTo } from "@/lib/navigation/return-to";

/**
 * 알림 목록 (SCR-M3-02 · T046) — 게이트: `getMyNotifications()` 안의 verifySession()
 *
 * **원래 M3 화면인데 M2 로 앞당겼다** (clarify Q4). 승인 절차를 없앤 대가로 남긴 통제 수단이
 * 만료·중지·알림 셋인데, 알림이 빠지면 발급자가 링크 유출을 알아챌 방법이 없다 (FR-017).
 *
 * M3 에서 선물 6종이 더해졌다 (T056). 종류별 문구·이동 매핑은 화면이 아니라
 * lib/notification/display.ts 한 곳에 있다 — 목록·배지·홈이 각자 분기하면 종류가 늘 때마다
 * 세 곳을 고쳐야 하고, 한 곳을 빠뜨리면 눌러도 아무 데도 가지 않는다. funding 4종은 M4 다.
 *
 * 상대 시각도 **서버에서** 문자열로 만든다 — 클라이언트가 다시 계산하면 서버 렌더와
 * 1분 차이로 어긋나 hydration 경고가 난다.
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
        친구 소식과 선물 진행 상황을 여기에서 알려드릴게요.
      </p>
    </div>
  );
}

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const { from, returnTo: rawReturnTo } = await searchParams;
  const returnTo = typeof rawReturnTo === "string" ? rawReturnTo : rawReturnTo?.[0];
  const notifications = await getMyNotifications();
  // 한 화면 안의 기준 시각을 하나로 고정한다 — 줄마다 now 가 달라 순서와 표기가 엇갈리지 않게
  const now = new Date();

  // 표시명·상품명은 발생 시점의 스냅샷이다 — 해제된 뒤에도 이름을 얻으려 User 를 다시 읽지 않는다
  const items = notifications.map((notification) => toNotificationItem(notification, now));

  return (
    <>
      <TopBar title="알림" backHref={safeReturnTo(returnTo, from === "home" ? "/" : "/my")} showNotifications={false} />
      <main className="flex flex-1 flex-col">
        {items.length === 0 ? <EmptyState /> : <NotificationList notifications={items} />}
      </main>
    </>
  );
}
