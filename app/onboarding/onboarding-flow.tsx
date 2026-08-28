"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, Plus } from "lucide-react";
import { createTasteItem, updateTasteDescription } from "@/app/taste/actions";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RadioOption } from "@/components/ui/radio-option";
import { TextField, TextareaField } from "@/components/ui/text-field";
import type { CategoryView } from "@/lib/dal/taste";

/*
 * 온보딩 플로우 (SCR-M1-01~05 · T030).
 * 인트로 → 1/3 카테고리(필수) → 2/3 구분 → 3/3 서술(skip 가능) → 완료.
 * 2/3 완료 시 createTasteItem 으로 일괄 저장한다 — 첫 HAVE/UNWANTED 저장이
 * onboardedAt 을 설정한다 (FR-008). 실패는 결과 값으로 받아 입력을 보존한다 (FR-016).
 */

type OnboardingStep = "intro" | "categories" | "kinds" | "description" | "done";

const INITIAL_VISIBLE_CATEGORIES = 10;

const INTRO_STEPS = [
  "이미 있거나 필요 없는 것",
  "어느 쪽인지 구분",
  "좋아하는 것 한 줄 (선택)",
];

type StepHeaderProps = {
  stepNumber: 1 | 2 | 3;
  onBack: () => void;
};

function StepHeader({ stepNumber, onBack }: StepHeaderProps) {
  return (
    <div className="flex flex-col gap-3 pb-1">
      <div className="flex h-10 items-center justify-between">
        <button
          type="button"
          aria-label="이전 단계"
          onClick={onBack}
          className="-ml-2 grid size-10 place-items-center rounded-full text-neutral-900 active:bg-neutral-100"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="text-sm text-neutral-500">{stepNumber} / 3</span>
      </div>
      <ProgressBar value={stepNumber / 3} label="온보딩 진행률" />
    </div>
  );
}

type OnboardingFlowProps = {
  categories: CategoryView[];
};

export function OnboardingFlow({ categories }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>("intro");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [kindById, setKindById] = useState<Record<string, "HAVE" | "UNWANTED">>({});
  const [detailById, setDetailById] = useState<Record<string, string>>({});
  const [description, setDescription] = useState("");
  const [isShowingAll, setIsShowingAll] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const toggleCategory = (categoryId: string) => {
    setSelectedIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  const goToKinds = () => {
    setKindById((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        if (!next[id]) next[id] = "HAVE";
      }
      return next;
    });
    setSaveError(null);
    setStep("kinds");
  };

  // 2/3 완료 — 선택한 항목을 일괄 저장한다. 이미 있는 항목(DUPLICATE_ITEM)은
  // 재진입 시나리오이므로 성공으로 취급하고, 그 외 실패는 입력을 보존한 채 알린다.
  const submitTasteItems = () => {
    startSaving(async () => {
      setSaveError(null);
      for (const category of categories.filter((c) => selectedIds.includes(c.id))) {
        const detail = (detailById[category.id] ?? "").trim();
        const result = await createTasteItem({
          kind: kindById[category.id] ?? "HAVE",
          categoryId: category.id,
          detail: detail || null,
        });
        if (!result.ok && result.error.code !== "DUPLICATE_ITEM") {
          setSaveError(`${category.name} — ${result.error.message}`);
          return;
        }
      }
      setStep("description");
    });
  };

  // 3/3 완료 — 서술은 선택이다. skip 해도 온보딩은 이미 완료 상태다 (FR-008).
  const finishOnboarding = (shouldSaveDescription: boolean) => {
    startSaving(async () => {
      setSaveError(null);
      if (shouldSaveDescription && description.trim()) {
        const result = await updateTasteDescription(description);
        if (!result.ok) {
          setSaveError(result.error.message);
          return;
        }
      }
      setStep("done");
    });
  };

  const visibleCategories = isShowingAll
    ? categories
    : categories.slice(0, INITIAL_VISIBLE_CATEGORIES);
  const selectedCategories = categories.filter((category) =>
    selectedIds.includes(category.id),
  );

  if (step === "intro") {
    return (
      <main className="flex flex-1 flex-col px-5 pb-8 pt-8">
        <h1 className="text-[28px] font-bold leading-[1.3] text-neutral-900">
          선물이 어긋나는 건 몰라서입니다.
        </h1>
        <p className="pt-3 text-base text-neutral-600">30초면 됩니다.</p>
        <ol className="flex flex-col gap-4 pt-8">
          {INTRO_STEPS.map((text, index) => (
            <li key={text} className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-apricot-100 text-sm font-bold text-apricot-700">
                {index + 1}
              </span>
              <span className="text-base text-neutral-900">{text}</span>
            </li>
          ))}
        </ol>
        <div className="mt-auto flex flex-col gap-4">
          <p className="text-sm text-neutral-600">적은 만큼 정확한 선물이 돌아옵니다.</p>
          <Button size="lg" onClick={() => setStep("categories")}>
            시작하기
          </Button>
        </div>
      </main>
    );
  }

  if (step === "categories") {
    return (
      <main className="flex flex-1 flex-col px-5 pb-8 pt-2">
        <StepHeader stepNumber={1} onBack={() => setStep("intro")} />
        <h1 className="pt-4 text-[28px] font-bold leading-[1.3] text-neutral-900">
          이미 있거나 필요 없는 것을 골라주세요
        </h1>
        <p className="pt-2 text-sm text-neutral-600">선물이 겹치는 걸 막아줍니다.</p>
        <div className="flex flex-wrap items-center gap-2 pt-6">
          {visibleCategories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              isSelected={selectedIds.includes(category.id)}
              onClick={() => toggleCategory(category.id)}
            />
          ))}
          {!isShowingAll && categories.length > INITIAL_VISIBLE_CATEGORIES && (
            <button
              type="button"
              onClick={() => setIsShowingAll(true)}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-neutral-200 px-2.5 text-xs font-semibold text-neutral-500 active:bg-neutral-100"
            >
              <Plus size={14} aria-hidden />
              더보기
            </button>
          )}
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <p className="text-sm text-neutral-600" aria-live="polite">
            {selectedIds.length}개 선택됨
          </p>
          <Button size="lg" disabled={selectedIds.length === 0} onClick={goToKinds}>
            다음
          </Button>
        </div>
      </main>
    );
  }

  if (step === "kinds") {
    return (
      <main className="flex flex-1 flex-col px-5 pb-8 pt-2">
        <StepHeader stepNumber={2} onBack={() => setStep("categories")} />
        <h1 className="pt-4 text-[28px] font-bold leading-[1.3] text-neutral-900">
          고른 것들, 어느 쪽인가요?
        </h1>
        <div className="flex flex-col gap-3 pt-5">
          {selectedCategories.map((category) => (
            <section
              key={category.id}
              aria-label={category.name}
              className="flex flex-col gap-3 rounded-[20px] bg-surface p-4"
            >
              <h2 className="text-base font-bold text-neutral-900">{category.name}</h2>
              <div className="flex items-center gap-6">
                <RadioOption
                  name={`kind-${category.id}`}
                  label="이미 있어요"
                  checked={kindById[category.id] !== "UNWANTED"}
                  onChange={() =>
                    setKindById((prev) => ({ ...prev, [category.id]: "HAVE" }))
                  }
                />
                <RadioOption
                  name={`kind-${category.id}`}
                  label="관심 없어요"
                  checked={kindById[category.id] === "UNWANTED"}
                  onChange={() =>
                    setKindById((prev) => ({ ...prev, [category.id]: "UNWANTED" }))
                  }
                />
              </div>
              <TextField
                id={`detail-${category.id}`}
                label="상세 (선택)"
                placeholder="예) 스타벅스 텀블러"
                value={detailById[category.id] ?? ""}
                onChange={(event) =>
                  setDetailById((prev) => ({ ...prev, [category.id]: event.target.value }))
                }
              />
            </section>
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-8">
          {saveError && (
            <p className="text-sm text-error-700" role="alert">
              {saveError}
            </p>
          )}
          <Button size="lg" disabled={isSaving} onClick={submitTasteItems}>
            {isSaving ? "저장 중…" : "다음"}
          </Button>
        </div>
      </main>
    );
  }

  if (step === "description") {
    return (
      <main className="flex flex-1 flex-col px-5 pb-8 pt-2">
        <StepHeader stepNumber={3} onBack={() => setStep("kinds")} />
        <h1 className="pt-4 text-[28px] font-bold leading-[1.3] text-neutral-900">
          어떤 걸 좋아하는지 한 줄만 적어주세요
        </h1>
        <p className="pt-2 text-sm text-neutral-600">
          왜 좋아하는지까지 적으면 선물이 훨씬 정확해집니다.
        </p>
        <div className="pt-5">
          <TextareaField
            id="taste-description"
            rows={5}
            placeholder="아침에 혼자 커피 내리는 15분이 좋아요. 산미 있는 원두를 주로 마셔요."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="mt-auto flex flex-col items-center gap-3">
          {saveError && (
            <p className="text-sm text-error-700" role="alert">
              {saveError}
            </p>
          )}
          <Button size="lg" disabled={isSaving} onClick={() => finishOnboarding(true)}>
            {isSaving ? "저장 중…" : "저장하고 시작하기"}
          </Button>
          <Button variant="tertiary" disabled={isSaving} onClick={() => finishOnboarding(false)}>
            나중에 할게요
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-8">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-10 text-center">
        <span className="grid size-[72px] place-items-center rounded-full bg-mint-100">
          <CheckCircle2 size={32} className="text-mint-700" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold text-neutral-900">준비됐습니다</h1>
        <p className="text-base text-neutral-600">이제 친구에게 넌지시 알릴 차례입니다.</p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Button size="lg" onClick={() => router.push("/my")}>
          친구에게 링크 보내기
        </Button>
        <Button variant="tertiary" onClick={() => router.push("/taste")}>
          둘러볼게요
        </Button>
      </div>
    </main>
  );
}
