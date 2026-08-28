"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTasteDescription } from "@/app/taste/actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/text-field";
import { callAction } from "@/lib/actions/call-action";

/*
 * 취향 서술 카드 + 편집 시트 (SCR-M1-07 · T044/T045).
 * 저장은 updateTasteDescription 액션 — 빈 문자열은 서버가 NULL 로 정규화한다 (FR-007).
 * 실패는 결과 값으로 받아 시트를 닫지 않고 입력을 보존한다 (FR-016) — 호출 자체가
 * throw 해도 callAction 이 같은 결과 형태로 바꿔 주므로 error.tsx 로 새지 않는다.
 */

type DescriptionEditorProps = {
  initialDescription: string | null;
};

export function DescriptionEditor({ initialDescription }: DescriptionEditorProps) {
  const router = useRouter();
  const titleId = useId();
  const textareaId = useId();
  const [description, setDescription] = useState(initialDescription ?? "");
  const [draft, setDraft] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const hasDescription = description.trim().length > 0;

  const openEditor = () => {
    setDraft(description);
    setServerError(null);
    setIsOpen(true);
  };

  const handleSave = () => {
    startSaving(async () => {
      setServerError(null);
      const result = await callAction(() => updateTasteDescription(draft));
      if (!result.ok) {
        setServerError(result.error.message);
        return;
      }
      setDescription(draft.trim());
      router.refresh();
      setIsOpen(false);
    });
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
        {serverError && (
          <p className="pt-3 text-sm text-error-700" role="alert">
            {serverError}
          </p>
        )}
        <div className="pt-6">
          <Button size="lg" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
