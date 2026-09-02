import type { ButtonHTMLAttributes } from "react";
import { Check } from "lucide-react";

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  isSelected?: boolean;
};

export function Chip({ label, isSelected = false, className = "", ...rest }: ChipProps) {
  const stateClasses = isSelected
    ? "border-rose-500 bg-rose-50 text-rose-700"
    : "border-neutral-200 bg-surface text-neutral-600";
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      className={
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold " +
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 " +
        `focus-visible:ring-offset-1 ${stateClasses} ${className}`
      }
      {...rest}
    >
      {/* 선택 전에도 같은 폭을 예약해 체크가 나타날 때 칩·줄바꿈 위치가 움직이지 않는다. */}
      <span
        className={`grid size-4 shrink-0 place-items-center rounded-full border transition-colors ${isSelected ? "border-rose-500 bg-rose-500 text-white" : "border-neutral-300 bg-surface text-transparent"}`}
        aria-hidden
      >
        <Check size={12} strokeWidth={3} />
      </span>
      {label}
    </button>
  );
}
