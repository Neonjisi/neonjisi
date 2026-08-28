import type { InputHTMLAttributes } from "react";

type RadioOptionProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function RadioOption({ label, className = "", ...rest }: RadioOptionProps) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 ${className}`}>
      <input type="radio" className="peer sr-only" {...rest} />
      <span
        aria-hidden
        className={
          "grid size-[22px] place-items-center rounded-full border-[1.5px] border-neutral-300 bg-surface " +
          "transition-colors after:size-2.5 after:rounded-full after:bg-rose-500 after:opacity-0 " +
          "after:transition-opacity peer-checked:border-rose-500 peer-checked:after:opacity-100 " +
          "peer-focus-visible:ring-2 peer-focus-visible:ring-rose-500 peer-focus-visible:ring-offset-2"
        }
      />
      <span className="text-sm text-neutral-500 peer-checked:font-semibold peer-checked:text-neutral-900">
        {label}
      </span>
    </label>
  );
}
