import { TopBar } from "@/components/ui/top-bar";
import { DescriptionEditor } from "@/components/taste/description-editor";
import { TasteItemList } from "@/components/taste/taste-item-list";
import { MOCK_CATEGORIES, MOCK_DESCRIPTION, MOCK_TASTE_ITEMS } from "@/lib/mock/taste-data";

/**
 * 내 취향 (SCR-M1-07 · T033).
 * 데이터는 목업 — DAL 연동 시 getTasteProfile()·getTasteItemsByKind() 결과로 교체하고,
 * 진입 시 requireOnboarded()를 호출한다.
 */
export default function TastePage() {
  return (
    <>
      <TopBar title="내 취향" backHref="/my" />
      <main className="flex-1 pb-10">
        <div className="px-4 pt-3">
          <DescriptionEditor initialDescription={MOCK_DESCRIPTION} />
        </div>
        <div className="px-5 pt-7">
          <TasteItemList items={MOCK_TASTE_ITEMS} categories={MOCK_CATEGORIES} />
        </div>
      </main>
    </>
  );
}
