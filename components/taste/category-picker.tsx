"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { CategoryView } from "@/lib/dal/taste";

type CategoryPickerProps = {
  categories: CategoryView[];
  value: string | null;
  onChange: (categoryId: string) => void;
  label: string;
  error?: string;
};

/** 대분류 선택 + 검색 필터 (SCR-M1-08 · T028) */
export function CategoryPicker({ categories, value, onChange, label, error }: CategoryPickerProps) {
  const titleId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = categories.find((category) => category.id === value) ?? null;
  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? categories.filter((category) => category.name.includes(trimmedQuery))
    : categories;

  const handleSelect = (categoryId: string) => {
    onChange(categoryId);
    setIsOpen(false);
    setQuery("");
  };

  const renderRow = (category: CategoryView) => {
    const isSelected = category.id === value;
    return (
      <li key={category.id}>
        <button
          type="button"
          onClick={() => handleSelect(category.id)}
          className="flex h-12 w-full items-center justify-between rounded-xl px-3 text-left text-sm text-neutral-900 active:bg-neutral-100"
        >
          <span className={isSelected ? "font-semibold text-rose-700" : undefined}>
            {category.name}
          </span>
          {isSelected && <Check size={18} className="text-rose-600" aria-hidden />}
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-neutral-600">{label}</span>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        className={
          "flex h-12 w-full items-center justify-between rounded-xl border bg-surface px-3.5 text-sm " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-100 " +
          (error ? "border-error-500" : "border-neutral-200")
        }
      >
        <span className={selected ? "text-neutral-900" : "text-neutral-400"}>
          {selected ? selected.name : "카테고리 선택"}
        </span>
        <ChevronDown size={20} className="text-neutral-600" aria-hidden />
      </button>
      {error && <p className="text-xs text-error-700">{error}</p>}

      <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} labelledBy={titleId}>
        <h2 id={titleId} className="pb-3 text-lg font-bold text-neutral-900">
          카테고리 선택
        </h2>
        <div className="relative pb-3">
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 mt-[-0.375rem] -translate-y-1/2 text-neutral-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="카테고리 검색"
            aria-label="카테고리 검색"
            className={
              "h-12 w-full rounded-xl border border-neutral-200 bg-surface pl-10 pr-3.5 text-sm " +
              "text-neutral-900 placeholder:text-neutral-400 focus:border-rose-500 " +
              "focus:outline-none focus:ring-2 focus:ring-rose-100"
            }
          />
        </div>
        <ul className="-mx-1 max-h-[45vh] overflow-y-auto pb-1">
          {filtered.map(renderRow)}
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-neutral-500">
              검색 결과가 없어요
            </li>
          )}
        </ul>
      </BottomSheet>
    </div>
  );
}
