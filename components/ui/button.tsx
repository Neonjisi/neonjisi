import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "md" | "lg";

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded-[14px] font-semibold transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border-[1.5px] border-rose-700 bg-rose-500 text-white shadow-brutal " +
    "active:translate-x-[2px] active:translate-y-[2px] active:bg-rose-700 active:shadow-none " +
    "disabled:border-transparent disabled:bg-neutral-200 disabled:text-neutral-500 disabled:shadow-none",
  secondary:
    "border border-rose-200 bg-rose-50 text-rose-700 active:bg-rose-100 " +
    "disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400",
  tertiary: "text-neutral-600 active:bg-neutral-100 disabled:text-neutral-400",
  destructive:
    "bg-error-500 text-white active:bg-error-600 disabled:bg-neutral-200 disabled:text-neutral-500",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "h-12 px-5 text-sm",
  lg: "h-12 w-full px-5 text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
): string {
  return [BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: LinkButtonProps) {
  return <Link href={href} className={buttonClasses(variant, size, className)} {...rest} />;
}
