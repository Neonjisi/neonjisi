import { TopBar } from "@/components/ui/top-bar";
import { DescriptionEditor } from "@/components/taste/description-editor";
import { TasteItemList } from "@/components/taste/taste-item-list";
import { requireOnboarded } from "@/lib/dal/session";
import { getCategories, getTasteItemsByKind, getTasteProfile } from "@/lib/dal/taste";

/**
 * 내 취향 (SCR-M1-07 · T033) — 게이트: requireOnboarded() (FR-018).
 * 조회는 전부 DAL — 인가를 통과한 본인 데이터만 내려온다.
 */
export default async function TastePage() {
  await requireOnboarded();
  const [profile, itemsByKind, categories] = await Promise.all([
    getTasteProfile(),
    getTasteItemsByKind(),
    getCategories(),
  ]);

  return (
    <>
      <TopBar title="내 취향" backHref="/my" />
      <main className="flex-1 pb-10">
        <div className="px-4 pt-3">
          <DescriptionEditor initialDescription={profile.description} />
        </div>
        <div className="px-5 pt-7">
          <TasteItemList itemsByKind={itemsByKind} categories={categories} />
        </div>
      </main>
    </>
  );
}
