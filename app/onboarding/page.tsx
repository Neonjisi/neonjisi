import { verifySession } from "@/lib/dal/session";
import { getCategories } from "@/lib/dal/taste";
import { OnboardingFlow } from "./onboarding-flow";

/**
 * 온보딩 (SCR-M1-01~05 · T030) — 게이트: verifySession() (contracts 화면 계약).
 * 카테고리는 DAL 에서 sortOrder 순으로 가져온다 (FR-005).
 */
export default async function OnboardingPage() {
  await verifySession();
  const categories = await getCategories();
  return <OnboardingFlow categories={categories} />;
}
