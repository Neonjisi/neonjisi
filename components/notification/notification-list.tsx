"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/friends/actions/notification";
import { NOTIFICATION_READ_FAILED_MESSAGE } from "@/lib/actions/call-action";
import { isRedirectError } from "@/lib/actions/redirect-error";
import type { NotificationItem } from "@/lib/notification/display";

/**
 * 알림 목록 (SCR-M3-02 · T047) — 클라이언트 컴포넌트 예산(contracts §4)에 계획된 셋 중 하나.
 *
 * 클라이언트인 이유는 **읽음 처리 후 낙관적 갱신** 하나다. 알림을 누르면 곧바로 친구
 * 상세로 넘어가므로, 서버 응답을 기다렸다가 표식을 지우면 이미 화면이 바뀐 뒤가 된다.
 * 그래서 표식은 즉시 지우고 요청은 뒤따라 보낸다 — 실패하면 표식을 되돌린다.
 *
 * **데이터는 서버에서 만들어 내려온다.** 문구·이동 경로·상대 시각 문자열까지 전부
 * lib/notification/display.ts 가 만든다 (T056) — 클라이언트가 다시 계산하면 1분 차이로
 * hydration 이 어긋나고, 종류별 분기가 화면마다 흩어지면 새 종류를 빠뜨린 화면이 생긴다.
 * 여기서 거르는 것은 없다: 목록은 이미 DAL 이 본인 것만 내보낸 결과다 (research R4).
 */

export function NotificationList({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  // 낙관적으로 읽음이 된 id 들. 서버 응답이 실패하면 되돌린다
  const [locallyRead, setLocallyRead] = useState<ReadonlySet<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startReading] = useTransition();

  const isRead = (item: NotificationItem) => item.isRead || locallyRead.has(item.id);
  const unreadCount = notifications.filter((item) => !isRead(item)).length;

  const markRead = (id: string) => {
    setLocallyRead((previous) => new Set(previous).add(id));
    startReading(async () => {
      setErrorMessage(null);
      const result = await guardCall(() => markNotificationRead({ notificationId: id }));
      if (!result.ok) {
        // 되돌린다 — 읽지 않은 것을 읽은 것처럼 두면 사용자가 알림을 잃는다
        setLocallyRead((previous) => {
          const next = new Set(previous);
          next.delete(id);
          return next;
        });
        setErrorMessage(result.error.message);
        return;
      }
      // router.refresh() 를 부르지 않는다 — 누른 즉시 친구 상세로 넘어가므로 새로 그릴 목록이
      // 이 화면에 없다. 서버 쪽 갱신은 액션의 revalidatePath 가 맡는다
    });
  };

  const markAllRead = () => {
    const previouslyUnread = notifications.filter((item) => !isRead(item)).map((item) => item.id);
    setLocallyRead((previous) => new Set([...previous, ...previouslyUnread]));
    startReading(async () => {
      setErrorMessage(null);
      const result = await guardCall(markAllNotificationsRead);
      if (!result.ok) {
        setLocallyRead((previous) => {
          const next = new Set(previous);
          for (const id of previouslyUnread) next.delete(id);
          return next;
        });
        setErrorMessage(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="pb-6">
      <div className="flex min-h-9 items-center justify-end px-5 pt-2">
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-rose-700 active:bg-rose-50"
          >
            모두 읽음
          </button>
        )}
      </div>
      {errorMessage && (
        <p role="alert" className="px-5 pb-2 text-sm text-error-600">
          {errorMessage}
        </p>
      )}
      <ul aria-label="알림 목록" className="flex flex-col gap-2 px-5">
        {notifications.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={() => {
                if (!isRead(item)) markRead(item.id);
              }}
              className={`flex items-start gap-3 rounded-[20px] p-4 active:bg-neutral-100 ${
                isRead(item) ? "bg-surface" : "bg-rose-50"
              }`}
            >
              <span className="grid size-5 shrink-0 place-items-center pt-0.5">
                {!isRead(item) && (
                  <>
                    <span className="size-2 rounded-full bg-rose-500" aria-hidden />
                    <span className="sr-only">읽지 않음</span>
                  </>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-neutral-900">{item.message}</span>
                <time
                  dateTime={item.createdAtISO}
                  className="block pt-1 text-xs text-neutral-500"
                >
                  {item.createdAtLabel}
                </time>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Server Action 호출 자체가 throw 하면(네트워크 단절 등) STORAGE_FAILED 결과로 바꾼다 —
 * remove-friend-dialog.tsx 와 같은 이유(FR-016)다. 여기서 새는 예외는 낙관적 갱신을
 * 되돌리지 못한 채 error.tsx 로 번져 목록을 통째로 날린다.
 */
async function guardCall<T>(
  run: () => Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>,
): Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }> {
  try {
    return await run();
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[notification-list] Server Action 호출 실패 — 낙관적 갱신을 되돌린다", error);
    return { ok: false, error: { message: NOTIFICATION_READ_FAILED_MESSAGE } };
  }
}
