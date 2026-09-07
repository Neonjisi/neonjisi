import Image from "next/image";
import Link from "next/link";

const BRAND = {
  icon: "/brand/trans_neonjisi_logo_icon.png",
  korean: "/brand/trans_neonjisi_logo_kor.png",
  typo: "/brand/trans_neonjisi_logo_typo.png",
} as const;

type BrandLogoProps = {
  variant?: keyof typeof BRAND;
  size?: "sm" | "md" | "lg";
  href?: string;
  priority?: boolean;
  className?: string;
};

const SIZE = {
  sm: "size-10",
  md: "size-16",
  lg: "size-56",
} as const;

export function BrandLogo({
  variant = "icon",
  size = "sm",
  href,
  priority = false,
  className = "",
}: BrandLogoProps) {
  const frameClass = variant === "typo" ? "h-10 w-24" : SIZE[size];
  const logo = (
    <span className={`relative block shrink-0 overflow-hidden ${frameClass} ${className}`}>
      <Image
        src={BRAND[variant]}
        alt={href ? "넌지시 홈" : "넌지시"}
        fill
        priority={priority}
        sizes={variant === "typo" ? "96px" : size === "lg" ? "224px" : size === "md" ? "64px" : "40px"}
        className={
          variant === "icon"
            ? "scale-[1.55] object-contain"
            : variant === "typo"
              ? "object-cover object-[center_48%]"
              : "object-contain"
        }
      />
    </span>
  );

  return href ? (
    <Link href={href} aria-label="넌지시 홈" className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500">
      {logo}
    </Link>
  ) : logo;
}
