import { MOCK_CATEGORIES } from "@/lib/mock/taste-data";
import { OnboardingFlow } from "./onboarding-flow";

/**
 * 온보딩 (SCR-M1-01~05 · T030).
 * 카테고리는 목업 — DAL 연동 시 getCategories() 결과로 교체한다.
 */
export default function OnboardingPage() {
  return <OnboardingFlow categories={MOCK_CATEGORIES} />;
}
