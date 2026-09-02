import { TopBar } from "@/components/ui/top-bar";
import { ProfileForm } from "./profile-form";
import { getMyProfileSummary } from "@/lib/dal/profile";

/** 가입 — 기본 프로필 (SCR-M0-03). 완료 시 TasteProfile을 만들고 온보딩으로 이동한다. */
export default async function SignupProfilePage() {
  const profile = await getMyProfileSummary();
  return (
    <>
      <TopBar backHref="/login" />
      <main className="flex flex-1 flex-col px-5">
        <h1 className="text-2xl font-bold text-neutral-900">어떻게 불러드릴까요?</h1>
        <ProfileForm
          initialName={profile.displayName}
          avatarUrl={profile.avatarUrl}
          returnTo={profile.isOnboarded ? "/my" : "/onboarding"}
        />
      </main>
    </>
  );
}
