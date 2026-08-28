type ProgressBarProps = {
  /** 0~1 사이 진행률 */
  value: number;
  label?: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-soft"
    >
      <div
        className="h-full rounded-full bg-rose-500 transition-[width] duration-300"
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
