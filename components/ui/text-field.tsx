import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const INPUT_BOX_CLASSES =
  "w-full rounded-xl border bg-surface text-sm text-neutral-900 " +
  "placeholder:text-neutral-400 focus:outline-none focus:ring-2 " +
  "disabled:bg-neutral-100 disabled:text-neutral-400";

function boxStateClasses(hasError: boolean): string {
  return hasError
    ? "border-error-500 focus:border-error-500 focus:ring-error-50"
    : "border-neutral-200 focus:border-rose-500 focus:ring-rose-100";
}

type FieldWrapperProps = {
  id: string;
  label?: string;
  helper?: string;
  error?: string;
  children: React.ReactNode;
};

function FieldWrapper({ id, label, helper, error, children }: FieldWrapperProps) {
  const message = error ?? helper;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-neutral-600">
          {label}
        </label>
      )}
      {children}
      {message && (
        <p className={`text-xs ${error ? "text-error-700" : "text-neutral-500"}`}>{message}</p>
      )}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label?: string;
  helper?: string;
  error?: string;
};

export function TextField({ id, label, helper, error, className = "", ...rest }: TextFieldProps) {
  return (
    <FieldWrapper id={id} label={label} helper={helper} error={error}>
      <input
        id={id}
        className={`h-12 px-3.5 ${INPUT_BOX_CLASSES} ${boxStateClasses(Boolean(error))} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldWrapper>
  );
}

type TextareaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label?: string;
  helper?: string;
  error?: string;
};

export function TextareaField({
  id,
  label,
  helper,
  error,
  className = "",
  rows = 4,
  ...rest
}: TextareaFieldProps) {
  return (
    <FieldWrapper id={id} label={label} helper={helper} error={error}>
      <textarea
        id={id}
        rows={rows}
        className={`resize-none p-3.5 leading-relaxed ${INPUT_BOX_CLASSES} ${boxStateClasses(Boolean(error))} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldWrapper>
  );
}
