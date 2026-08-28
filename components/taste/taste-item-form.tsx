"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createTasteItem, deleteTasteItem, updateTasteItem } from "@/app/taste/actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { RadioOption } from "@/components/ui/radio-option";
import { TextField } from "@/components/ui/text-field";
import { CategoryPicker } from "@/components/taste/category-picker";
import { DeleteConfirmDialog } from "@/components/taste/delete-confirm-dialog";
import { DELETE_FAILED_MESSAGE, callAction } from "@/lib/actions/call-action";
import type { CategoryView, TasteItemView } from "@/lib/dal/taste";
import { josa } from "@/lib/format/josa";
import { findContradiction, type TasteKindInput } from "@/lib/validation/taste-item";

/*
 * 취향 항목 폼 시트 (SCR-M1-08 · SCR-M1-09 · T029·T051).
 * 등록·수정·삭제가 각각 createTasteItem/updateTasteItem/deleteTasteItem 액션에
 * 연결되어 있다. 실패는 결과 값으로 받아 시트를 닫지 않고 입력을 보존한 채
 * 안내한다 (FR-016) — 호출 자체가 throw 해도(네트워크 단절 등) callAction 이
 * 같은 결과 형태로 바꿔 주므로 error.tsx 로 새지 않는다.
 * 삭제는 확인 다이얼로그를 거친다 — hard delete 라 복구 불가.
 *
 * 모순(FR-010)은 저장 시점이 아니라 **카테고리를 고르는 순간** 경고한다 (명세 SCR-M1-08,
 * 리뷰 R2) — 다 적고 나서 막히면 입력을 통째로 버리게 된다. 최종 판정은 서버가 한다.
 */

function ContradictionNotice({ conflict }: { conflict: TasteItemView | null }) {
  if (!conflict) return null;
  const conflictLabel = conflict.kind === "WANT" ? "원하는 것" : "관심 없어요";
  return (
    <p className="rounded-xl bg-warning-50 px-3.5 py-2.5 text-sm text-warning-700" role="alert">
      &lsquo;{conflict.categoryName}&rsquo;{josa(conflict.categoryName, "을", "를")} {conflictLabel}에
      이미 넣어두셨어요. 한쪽만 남겨주세요.
    </p>
  );
}

type TasteItemSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryView[];
  initialItem?: TasteItemView;
  /** 모순 즉시 경고용 현재 항목 목록 — 서버가 최종 판정하므로 없으면 경고만 생략된다 */
  existingItems?: TasteItemView[];
};

/** `이미 있어요` / `관심 없어요` 항목 추가·편집 시트 */
export function TasteItemSheet({
  isOpen,
  onClose,
  categories,
  initialItem,
  existingItems = [],
}: TasteItemSheetProps) {
  const router = useRouter();
  const titleId = useId();
  const detailId = useId();
  const isEditing = Boolean(initialItem);

  const [categoryId, setCategoryId] = useState<string | null>(initialItem?.categoryId ?? null);
  const [kind, setKind] = useState<Exclude<TasteKindInput, "WANT">>(
    initialItem?.kind === "UNWANTED" ? "UNWANTED" : "HAVE",
  );
  const [detail, setDetail] = useState(initialItem?.detail ?? "");
  const [categoryError, setCategoryError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const liveContradiction = categoryId
    ? findContradiction(
        { kind, categoryId, detail: detail.trim() || null },
        existingItems.filter((item) => item.id !== initialItem?.id),
      )
    : null;

  const handleSave = () => {
    if (!categoryId) {
      setCategoryError("카테고리를 선택해주세요");
      return;
    }
    startSaving(async () => {
      setServerError(null);
      const payload = { kind, categoryId, detail: detail.trim() || null };
      const result = await callAction(async () =>
        initialItem ? updateTasteItem(initialItem.id, payload) : createTasteItem(payload),
      );
      if (!result.ok) {
        setServerError(result.error.message);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const handleDelete = () => {
    if (!initialItem) return;
    setIsConfirmingDelete(false);
    startSaving(async () => {
      setServerError(null);
      const result = await callAction(() => deleteTasteItem(initialItem.id), DELETE_FAILED_MESSAGE);
      if (!result.ok) {
        setServerError(result.error.message);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const itemLabel = initialItem?.detail ?? initialItem?.categoryName ?? "항목";

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
            value={categoryId}
            onChange={(nextId) => {
              setCategoryId(nextId);
              setCategoryError(undefined);
              setServerError(null);
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
                checked={kind === "HAVE"}
                onChange={() => setKind("HAVE")}
              />
              <RadioOption
                name="taste-kind"
                label="관심 없어요"
                checked={kind === "UNWANTED"}
                onChange={() => setKind("UNWANTED")}
              />
            </div>
          </fieldset>
          <TextField
            id={detailId}
            label="상세 (선택)"
            placeholder="예) 스타벅스 텀블러"
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
          />
          <ContradictionNotice conflict={liveContradiction} />
        </div>
        {serverError && (
          <p className="pt-3 text-sm text-error-700" role="alert">
            {serverError}
          </p>
        )}
        <div className="flex items-center gap-4 pt-6">
          <Button size="lg" className="flex-1" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "저장 중…" : "저장"}
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
        onConfirm={handleDelete}
      />
    </>
  );
}

type WishlistItemSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryView[];
  initialItem?: TasteItemView;
  /** 모순 즉시 경고용 현재 항목 목록 — 서버가 최종 판정하므로 없으면 경고만 생략된다 */
  existingItems?: TasteItemView[];
};

/** `원하는 것` 항목 추가 시트 — M1은 텍스트만, M3에서 카탈로그 연결 (SCR-M1-09) */
export function WishlistItemSheet({
  isOpen,
  onClose,
  categories,
  initialItem,
  existingItems = [],
}: WishlistItemSheetProps) {
  const router = useRouter();
  const titleId = useId();
  const detailId = useId();
  const isEditing = Boolean(initialItem);

  const [categoryId, setCategoryId] = useState<string | null>(initialItem?.categoryId ?? null);
  const [detail, setDetail] = useState(initialItem?.detail ?? "");
  const [errors, setErrors] = useState<{ category?: string; detail?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const liveContradiction = categoryId
    ? findContradiction(
        { kind: "WANT", categoryId, detail: detail.trim() || null },
        existingItems.filter((item) => item.id !== initialItem?.id),
      )
    : null;

  const handleSave = () => {
    const nextErrors: typeof errors = {};
    if (!categoryId) nextErrors.category = "카테고리를 선택해주세요";
    if (!detail.trim()) nextErrors.detail = "원하는 것을 적어주세요";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !categoryId) return;
    startSaving(async () => {
      setServerError(null);
      const payload = { kind: "WANT" as const, categoryId, detail: detail.trim() };
      const result = await callAction(async () =>
        initialItem ? updateTasteItem(initialItem.id, payload) : createTasteItem(payload),
      );
      if (!result.ok) {
        setServerError(result.error.message);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const handleDelete = () => {
    if (!initialItem) return;
    setIsConfirmingDelete(false);
    startSaving(async () => {
      setServerError(null);
      const result = await callAction(() => deleteTasteItem(initialItem.id), DELETE_FAILED_MESSAGE);
      if (!result.ok) {
        setServerError(result.error.message);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <>
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
            setServerError(null);
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
        <ContradictionNotice conflict={liveContradiction} />
      </div>
      {serverError && (
        <p className="pt-3 text-sm text-error-700" role="alert">
          {serverError}
        </p>
      )}
      <div className="flex items-center gap-4 pt-6">
        <Button size="lg" className="flex-1" disabled={isSaving} onClick={handleSave}>
          {isSaving ? "저장 중…" : "저장"}
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
        itemLabel={initialItem?.detail ?? initialItem?.categoryName ?? "항목"}
        onCancel={() => setIsConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}

type AddTasteItemButtonProps = {
  kind: TasteKindInput;
  categories: CategoryView[];
  existingItems?: TasteItemView[];
};

/** 섹션 헤더의 `+` 버튼 — 종류에 맞는 추가 시트를 연다 */
export function AddTasteItemButton({ kind, categories, existingItems }: AddTasteItemButtonProps) {
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
        <SheetComponent
          isOpen
          categories={categories}
          existingItems={existingItems}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

type TasteItemRowButtonProps = {
  item: TasteItemView;
  categories: CategoryView[];
  existingItems?: TasteItemView[];
};

/** 목록 행 — 탭하면 편집 시트를 연다 */
export function TasteItemRowButton({ item, categories, existingItems }: TasteItemRowButtonProps) {
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
          existingItems={existingItems}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
