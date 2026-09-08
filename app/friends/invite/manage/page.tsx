import { Link2 } from "lucide-react";
import { TopBar } from "@/components/ui/top-bar";
import { RevokeLinkButton } from "@/components/friend/revoke-link-dialog";
import { CopyInviteLinkButton } from "@/components/friend/invite-link-card";
import { getMyInviteLinks, type InviteLinkView } from "@/lib/dal/invite";
import { formatTimeUntil } from "@/lib/format/time";

/**
 * 내 초대 링크 관리 (SCR-M2-03 · T045) — 게이트: `getMyInviteLinks()` 안의 verifySession()
 *
 * **이 화면의 존재 이유는 `[ 중지 ]` 다.** 승인 절차를 없앤 대가로 남긴 통제 수단이
 * 만료·중지·알림 셋인데, 링크가 의도치 않은 곳으로 퍼졌을 때 그 자리에서 쓸 수 있는 것은
 * 중지 하나뿐이다 (FR-005). 사용 인원수(FR-006)는 "얼마나 퍼졌나"를 알려주는 신호다.
 *
 * 목록 렌더는 Server Component 다 — 클라이언트로 가는 것은 중지 버튼 하나뿐이다 (contracts §4).
 */

/**
 * 상태 라벨 — 화면 명세 SCR-M2-03 의 판정표 그대로다.
 * 유효/무효 판정은 `isValid()` 한 곳(DAL)이 내린 `link.isValid` 를 그대로 쓴다 — 여기서 다시
 * 계산하면 목록을 가른 기준과 라벨이 어긋날 수 있다. 남은 기간만 표시용으로 만든다.
 */
function statusLabel(link: InviteLinkView, now: Date): string {
  if (link.revokedAt !== null) return "중지함";
  if (!link.isValid) return "만료됨";
  return `${formatTimeUntil(link.expiresAt, now) ?? "오늘"} 만료`;
}

function LinkCard({ link, now, siteUrl }: { link: InviteLinkView; now: Date; siteUrl: string }) {
  const inviteUrl = `${siteUrl}/i/${link.token}`;

  return (
    <li className="rounded-[16px] bg-surface p-4">
      <div className="flex items-center gap-2">
        <Link2 size={18} className="shrink-0 text-success-700" aria-hidden />
        {/* 토큰은 43자다 — 좁은 폭에서 줄을 밀지 않도록 잘라 보여준다 (SC-006) */}
        <p className="min-w-0 flex-1 truncate text-sm text-neutral-900">{inviteUrl}</p>
        <span className="shrink-0 rounded-lg bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700">
          사용 중
        </span>
      </div>
      <p className="pt-3 text-xs text-neutral-600">
        {link.usedCount}명이 수락함 · {statusLabel(link, now)}
      </p>
      <div className="mt-3 h-px bg-neutral-100" />
      <div className="flex gap-2 pt-3">
        <CopyInviteLinkButton inviteUrl={inviteUrl} />
        {link.isValid && <RevokeLinkButton linkId={link.id} />}
      </div>
    </li>
  );
}

function LinkSection({
  title,
  listLabel,
  emptyText,
  links,
  now,
  siteUrl,
}: {
  title: string;
  /** 목록의 접근성 이름 */
  listLabel: string;
  emptyText: string;
  links: InviteLinkView[];
  now: Date;
  siteUrl: string;
}) {
  return (
    <section className="px-5 pt-6">
      <h2 className="pb-2 text-sm font-semibold text-neutral-900">{title}</h2>
      {links.length === 0 ? (
        <p className="rounded-[20px] bg-surface p-4 text-sm text-neutral-600">{emptyText}</p>
      ) : (
        <ul aria-label={listLabel} className="flex flex-col gap-2">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} now={now} siteUrl={siteUrl} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function InviteLinkManagePage({
  searchParams,
}: PageProps<"/friends/invite/manage">) {
  const { from } = await searchParams;
  const links = await getMyInviteLinks();
  // 한 화면 안의 판정 기준을 하나로 고정한다 — 카드마다 now 가 달라 상태가 엇갈리지 않게
  const now = new Date();
  const active = links.filter((link) => link.isValid);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return (
    <>
      <TopBar title="초대 링크" backHref={from === "my" ? "/my" : "/friends/invite"} />
      <main className="flex-1 pb-10">
        <LinkSection
          title="사용 중"
          listLabel="사용 중 링크"
          emptyText="사용 중인 링크가 없어요. 친구 추가 화면에서 새로 만들 수 있어요."
          links={active}
          now={now}
          siteUrl={siteUrl}
        />
      </main>
    </>
  );
}
