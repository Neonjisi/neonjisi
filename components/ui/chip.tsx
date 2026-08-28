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
      {isSelected && <Check size={16} strokeWidth={2.5} aria-hidden />}
      {label}
    </button>
  );
}
