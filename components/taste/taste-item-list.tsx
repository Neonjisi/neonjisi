import { Fragment } from "react";
import { AddTasteItemButton, TasteItemRowButton } from "@/components/taste/taste-item-form";
import type { CategoryView, TasteItemsByKind } from "@/lib/dal/taste";
import type { TasteKindInput } from "@/lib/validation/taste-item";

/*
 * 내 취향 목록 (SCR-M1-07 · T032).
 * 서버 컴포넌트 — 데이터는 DAL 이 종류별로 묶어 내려주고(FR-012),
 * 행 탭·추가 같은 인터랙션만 클라이언트 컴포넌트에 맡긴다.
 */

const SECTIONS: { kind: TasteKindInput; title: string; emptyMessage?: string }[] = [
  { kind: "WANT", title: "원하는 것", emptyMessage: "친구가 볼 수 있게 원하는 걸 적어보세요" },
  { kind: "HAVE", title: "이미 있어요" },
  { kind: "UNWANTED", title: "관심 없어요" },
];

type TasteItemListProps = {
  itemsByKind: TasteItemsByKind;
  categories: CategoryView[];
};

export function TasteItemList({ itemsByKind, categories }: TasteItemListProps) {
  // 모순 즉시 경고(FR-010, 리뷰 R2)용 전체 항목 — 시트가 카테고리 선택 직후 대조한다
  const existingItems = [...itemsByKind.WANT, ...itemsByKind.HAVE, ...itemsByKind.UNWANTED];

  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map(({ kind, title, emptyMessage }) => {
        const sectionItems = itemsByKind[kind];
        return (
          <section key={kind} aria-label={title}>
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-base font-bold text-neutral-900">
                {title}{" "}
                <span className="text-sm font-normal text-neutral-500">
                  ({sectionItems.length})
                </span>
              </h2>
              <AddTasteItemButton
                kind={kind}
                categories={categories}
                existingItems={existingItems}
              />
            </div>
            <div className="rounded-[20px] bg-surface px-3">
              {sectionItems.length === 0 ? (
                <p className="px-1 py-5 text-sm text-neutral-500">
                  {emptyMessage ?? "아직 등록한 항목이 없어요"}
                </p>
              ) : (
                sectionItems.map((item, index) => (
                  <Fragment key={item.id}>
                    {index > 0 && <hr className="border-neutral-100" />}
                    <TasteItemRowButton
                      item={item}
                      categories={categories}
                      existingItems={existingItems}
                    />
                  </Fragment>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
