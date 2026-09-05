import { Check } from "lucide-react";
import { TopBar } from "@/components/ui/top-bar";
import { verifySession } from "@/lib/dal/session";

const NOTIFICATION_GROUPS = [
  { label: "선물 요청 알림", description: "선물 요청과 결제 진행 상황" },
  { label: "펀딩 소식 알림", description: "참여와 성사·환불 진행 상황" },
  { label: "친구 소식 알림", description: "초대 링크를 통한 친구 연결" },
] as const;

function NotificationRow({ label, description }: (typeof NOTIFICATION_GROUPS)[number]) {
  return (
    <li className="flex min-h-[64px] items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <strong className="block text-[15px] font-medium text-neutral-900">{label}</strong>
        <span className="mt-0.5 block text-xs text-neutral-500">{description}</span>
      </span>
      <span
        role="switch"
        aria-checked="true"
        aria-disabled="true"
        aria-label={`${label}, 항상 받음`}
        className="flex h-7 w-12 shrink-0 items-center justify-end rounded-full bg-rose-500 p-1"
      >
        <span className="grid size-5 place-items-center rounded-full bg-white">
          <Check size={12} className="text-rose-600" aria-hidden />
        </span>
      </span>
    </li>
  );
}

function InformationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[52px] items-center justify-between">
      <span className="text-[15px] text-neutral-900">{label}</span>
      <span className="text-sm text-neutral-500">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  await verifySession();

  return (
    <>
      <TopBar title="설정" backHref="/my" />
      <main className="flex-1 px-5 pb-8 pt-4">
        <section aria-labelledby="notification-settings-title">
          <h2 id="notification-settings-title" className="text-sm font-semibold text-neutral-900">
            알림
          </h2>
          <ul className="mt-3 divide-y divide-neutral-100 rounded-[20px] bg-surface px-4">
            {NOTIFICATION_GROUPS.map((item) => (
              <NotificationRow key={item.label} {...item} />
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            중요한 선물·펀딩·친구 진행 상황은 현재 서비스 내 알림으로 항상 알려드립니다.
            푸시 알림 선택 기능은 준비 중입니다.
          </p>
        </section>

        <section className="mt-8" aria-labelledby="service-information-title">
          <h2 id="service-information-title" className="text-sm font-semibold text-neutral-900">
            이용 정보
          </h2>
          <div className="mt-3 divide-y divide-neutral-100 rounded-[20px] bg-surface px-4">
            <InformationRow label="약관 · 개인정보처리방침" value="준비 중" />
            <InformationRow label="오픈소스 라이선스" value="준비 중" />
            <InformationRow label="버전 정보" value="v0.1.0" />
          </div>
        </section>
      </main>
    </>
  );
}
