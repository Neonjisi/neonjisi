import type { InputHTMLAttributes } from "react";

type RadioOptionProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function RadioOption({ label, className = "", ...rest }: RadioOptionProps) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 ${className}`}>
      <input
        type="radio"
        className="peer size-[22px] shrink-0 cursor-pointer accent-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        {...rest}
      />
      <span className="text-sm text-neutral-500 peer-checked:font-semibold peer-checked:text-neutral-900">
        {label}
      </span>
    </label>
  );
}
