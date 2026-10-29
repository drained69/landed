import { cn } from "@/lib/client";

/**
 * The LANDED mark: an "L" whose corner is a landing curve — a path that comes
 * down and settles onto the ground — with a green dot where the money lands.
 * Geometric on a 32-unit grid so it stays crisp from favicon to hero size.
 */
export function LogoMark({ size = 28, className, title = "LANDED" }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={title} className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="9" fill="#0A0B0C" />
      <path d="M9 7.5V15.5c0 4.4 3.6 8 8 8h1" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23.6" cy="23.5" r="2.6" fill="#46C67A" />
    </svg>
  );
}

export function Logo({ size = 28, className, wordmarkClassName }: { size?: number; className?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span
        className={cn("font-sans font-semibold lowercase tracking-[-0.03em] text-ink", wordmarkClassName)}
        style={{ fontSize: Math.round(size * 0.68) }}
      >
        landed
      </span>
    </span>
  );
}
