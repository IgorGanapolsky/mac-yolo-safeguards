/**
 * Canonical ThumbGate mark — same asset as thumbgate.ai
 * (`/assets/brand/thumbgate-mark-inline-v3.svg` TG gate monogram).
 */
export function BrandMark({
  className = "",
  size = 28,
  title = "ThumbGate",
}: {
  className?: string;
  size?: number;
  /** Empty when decorative next to a visible "ThumbGate" wordmark. */
  title?: string;
}) {
  return (
    <img
      src="/brand/thumbgate-mark-inline-v3.svg"
      alt={title}
      width={size}
      height={size}
      className={`brand-mark ${className}`.trim()}
      decoding="async"
      draggable={false}
    />
  );
}
