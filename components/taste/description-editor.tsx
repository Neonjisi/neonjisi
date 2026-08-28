"use client";

import { useId, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/text-field";

/*
 * 취향 서술 카드 + 편집 시트 (SCR-M1-07 · T044/T045).
 * 저장은 아직 목업 동작 — updateTasteDescription 액션 연동 시
 * 빈 문자열은 서버에서 NULL로 정규화된다.
 */

type DescriptionEditorProps = {
  initialDescription: string | null;
};

export function DescriptionEditor({ initialDescription }: DescriptionEditorProps) {
  const titleId = useId();
  const textareaId = useId();
  const [description, setDescription] = useState(initialDescription ?? "");
  const [draft, setDraft] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const hasDescription = description.trim().length > 0;

  const openEditor = () => {
    setDraft(description);
    setIsOpen(true);
  };

  const handleSave = () => {
    setDescription(draft.trim());
    setIsOpen(false);
  };

  return (
    <>
      <section aria-label="취향 서술" className="rounded-[20px] bg-lavender-100 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-lavender-700">취향 서술</h2>
          <button
            type="button"
            onClick={openEditor}
            className="rounded-lg px-1.5 py-0.5 text-[13px] font-semibold text-lavender-700 active:bg-lavender-200"
          >
            편집
          </button>
        </div>
        {hasDescription ? (
          <p className="pt-2 text-sm leading-relaxed text-neutral-800">{description}</p>
        ) : (
          <p className="pt-2 text-sm leading-relaxed text-neutral-500">
            어떤 걸 좋아하는지 한 줄만 적어보세요. 왜 좋아하는지까지 적으면 선물이 훨씬
            정확해집니다.
          </p>
        )}
      </section>

      <BottomSheet isOpen={isOpen} onClose={() => setIsOpen(false)} labelledBy={titleId}>
        <h2 id={titleId} className="pb-4 text-lg font-bold text-neutral-900">
          취향 서술
        </h2>
        <TextareaField
          id={textareaId}
          rows={5}
          placeholder="아침에 혼자 커피 내리는 15분이 좋아요. 산미 있는 원두를 주로 마셔요."
          helper="왜 좋아하는지까지 적으면 선물이 훨씬 정확해집니다."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="pt-6">
          <Button size="lg" onClick={handleSave}>
            저장
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
