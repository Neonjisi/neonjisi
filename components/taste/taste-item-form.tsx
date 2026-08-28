"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { RadioOption } from "@/components/ui/radio-option";
import { TextField } from "@/components/ui/text-field";
import { CategoryPicker } from "@/components/taste/category-picker";
import { DeleteConfirmDialog } from "@/components/taste/delete-confirm-dialog";
import type { CategoryMock, TasteItemMock, TasteKind } from "@/lib/mock/taste-data";

/*
 * 취향 항목 폼 시트 (SCR-M1-08 · SCR-M1-09).
 * 저장·삭제는 아직 목업 동작이다 — 서버 액션(createTasteItem 등) 연동 시
 * onSave/onDelete 자리에 액션 호출을 연결한다.
 */

type TasteItemDraft = {
  categoryId: string | null;
  kind: Exclude<TasteKind, "WANT">;
  detail: string;
  memo: string;
};

type TasteItemSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryMock[];
  initialItem?: TasteItemMock;
};

/** `이미 있어요` / `관심 없어요` 항목 추가·편집 시트 */
export function TasteItemSheet({ isOpen, onClose, categories, initialItem }: TasteItemSheetProps) {
  const titleId = useId();
  const detailId = useId();
  const memoId = useId();
  const isEditing = Boolean(initialItem);

  const [draft, setDraft] = useState<TasteItemDraft>({
    categoryId: initialItem?.categoryId ?? null,
    kind: initialItem?.kind === "UNWANTED" ? "UNWANTED" : "HAVE",
    detail: initialItem?.detail ?? "",
    memo: initialItem?.memo ?? "",
  });
  const [categoryError, setCategoryError] = useState<string | undefined>();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleSave = () => {
    if (!draft.categoryId) {
      setCategoryError("카테고리를 선택해주세요");
      return;
    }
    onClose();
  };

  const itemLabel =
    initialItem?.detail ?? initialItem?.categoryName ?? "항목";

  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={onClose} labelledBy={titleId}>
        {isEditing ? (
          <h2 id={titleId} className="pb-4 text-lg font-bold text-neutral-900">
            취향 항목 편집
          </h2>
        ) : (
          <span id={titleId} className="sr-only">
            취향 항목 추가
          </span>
        )}
        <div className="flex flex-col gap-4">
          <CategoryPicker
            categories={categories}
            value={draft.categoryId}
            onChange={(categoryId) => {
              setDraft((prev) => ({ ...prev, categoryId }));
              setCategoryError(undefined);
            }}
            label="어떤 종류인가요?"
            error={categoryError}
          />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="pb-1.5 text-xs font-semibold text-neutral-600">
              어느 쪽인가요?
            </legend>
            <div className="flex items-center gap-6">
              <RadioOption
                name="taste-kind"
                label="이미 있어요"
                checked={draft.kind === "HAVE"}
                onChange={() => setDraft((prev) => ({ ...prev, kind: "HAVE" }))}
              />
              <RadioOption
                name="taste-kind"
                label="관심 없어요"
                checked={draft.kind === "UNWANTED"}
                onChange={() => setDraft((prev) => ({ ...prev, kind: "UNWANTED" }))}
              />
            </div>
          </fieldset>
          <TextField
            id={detailId}
            label="상세 (선택)"
            placeholder="예) 스타벅스 텀블러"
            value={draft.detail}
            onChange={(event) => setDraft((prev) => ({ ...prev, detail: event.target.value }))}
          />
          <TextField
            id={memoId}
            label="메모 (선택)"
            placeholder="예) 이미 3개 있어요"
            value={draft.memo}
            onChange={(event) => setDraft((prev) => ({ ...prev, memo: event.target.value }))}
          />
        </div>
        <div className="flex items-center gap-4 pt-6">
          <Button size="lg" className="flex-1" onClick={handleSave}>
            저장
          </Button>
          {isEditing && (
            <Button
              variant="tertiary"
              className="shrink-0 !text-error-600"
              onClick={() => setIsConfirmingDelete(true)}
            >
              삭제
            </Button>
          )}
        </div>
      </BottomSheet>
      <DeleteConfirmDialog
        isOpen={isConfirmingDelete}
        itemLabel={itemLabel}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={() => {
          setIsConfirmingDelete(false);
          onClose();
        }}
      />
    </>
  );
}

type WishlistItemSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryMock[];
  initialItem?: TasteItemMock;
};

/** `원하는 것` 항목 추가·편집 시트 — M1은 텍스트만, M3에서 카탈로그 연결 (SCR-M1-09) */
export function WishlistItemSheet({
  isOpen,
  onClose,
  categories,
  initialItem,
}: WishlistItemSheetProps) {
  const titleId = useId();
  const detailId = useId();
  const memoId = useId();

  const [categoryId, setCategoryId] = useState<string | null>(initialItem?.categoryId ?? null);
  const [detail, setDetail] = useState(initialItem?.detail ?? "");
  const [memo, setMemo] = useState(initialItem?.memo ?? "");
  const [errors, setErrors] = useState<{ category?: string; detail?: string }>({});

  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!categoryId) nextErrors.category = "카테고리를 선택해주세요";
    if (!detail.trim()) nextErrors.detail = "원하는 것을 적어주세요";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="pb-4 text-lg font-bold text-neutral-900">
        원하는 것을 적어주세요
      </h2>
      <div className="flex flex-col gap-4">
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={(nextId) => {
            setCategoryId(nextId);
            setErrors((prev) => ({ ...prev, category: undefined }));
          }}
          label="종류"
          error={errors.category}
        />
        <TextField
          id={detailId}
          label="무엇인가요?"
          placeholder="예) 핸드드립 케틀"
          value={detail}
          error={errors.detail}
          onChange={(event) => {
            setDetail(event.target.value);
            setErrors((prev) => ({ ...prev, detail: undefined }));
          }}
        />
        <TextField
          id={memoId}
          label="왜 원하는지 (선택)"
          placeholder="예) 요즘 커피에 빠졌어요"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
      </div>
      <div className="pt-6">
        <Button size="lg" onClick={handleSave}>
          저장
        </Button>
      </div>
    </BottomSheet>
  );
}

type AddTasteItemButtonProps = {
  kind: TasteKind;
  categories: CategoryMock[];
};

/** 섹션 헤더의 `+` 버튼 — 종류에 맞는 추가 시트를 연다 */
export function AddTasteItemButton({ kind, categories }: AddTasteItemButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const SheetComponent = kind === "WANT" ? WishlistItemSheet : TasteItemSheet;
  return (
    <>
      <button
        type="button"
        aria-label="항목 추가"
        onClick={() => setIsOpen(true)}
        className="grid size-9 place-items-center rounded-full text-rose-600 active:bg-rose-50"
      >
        <Plus size={22} aria-hidden />
      </button>
      {isOpen && (
        <SheetComponent isOpen categories={categories} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}

type TasteItemRowButtonProps = {
  item: TasteItemMock;
  categories: CategoryMock[];
};

/** 목록 행 — 탭하면 편집 시트를 연다 */
export function TasteItemRowButton({ item, categories }: TasteItemRowButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const label =
    item.kind === "WANT"
      ? (item.detail ?? item.categoryName)
      : item.detail
        ? `${item.categoryName} · ${item.detail}`
        : item.categoryName;
  const SheetComponent = item.kind === "WANT" ? WishlistItemSheet : TasteItemSheet;
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex h-[52px] w-full items-center gap-3 px-1 text-left active:bg-neutral-50"
      >
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-rose-300" />
        <span className="truncate text-[15px] text-neutral-900">{label}</span>
      </button>
      {isOpen && (
        <SheetComponent
          isOpen
          categories={categories}
          initialItem={item}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
