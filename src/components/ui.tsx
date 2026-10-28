import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/client";
import { formatMinor } from "@/lib/money";

export function Card({ children, className, as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <As className={cn("panel rounded-2xl", className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, right, className }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5 pb-4 sm:px-6", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium tracking-[-0.01em] text-cream">{title}</h2>
        {subtitle ? <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase = "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 focus-ring disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-lime text-[#0b1007] hover:bg-[#d8ff8e] active:scale-[0.985] shadow-[0_10px_36px_-14px_rgba(201,247,111,0.7)]",
  secondary: "bg-[#20261e] text-cream hover:bg-[#2a3227] border border-[#333d31]",
  ghost: "text-muted hover:text-cream hover:bg-white/[0.04]",
  danger: "bg-[#3a1c18] text-red border border-[#5e2d26] hover:bg-[#47211c]",
  outline: "border border-[#3a4437] text-cream hover:border-lime/50 hover:text-lime",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-10 px-4 text-[13px]",
  lg: "h-12 px-6 text-[14px]",
};

export function Button({
  children, variant = "primary", size = "md", className, loading, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href, children, variant = "primary", size = "md", className,
}: { href: string; children: ReactNode; variant?: ButtonVariant; size?: ButtonSize; className?: string }) {
  return (
    <Link href={href} className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}>
      {children}
    </Link>
  );
}

type Tone = "neutral" | "lime" | "red" | "amber" | "sky" | "muted";

const tones: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-cream",
  lime: "border-lime/25 bg-lime/[0.09] text-lime",
  red: "border-red/25 bg-red/[0.08] text-red",
  amber: "border-amber/25 bg-amber/[0.08] text-amber",
  sky: "border-sky/25 bg-sky/[0.08] text-sky",
  muted: "border-white/10 bg-white/[0.02] text-muted",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.08em]", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Dot({ tone = "lime" }: { tone?: Tone }) {
  const color = tone === "lime" ? "bg-lime" : tone === "red" ? "bg-red" : tone === "amber" ? "bg-amber" : tone === "sky" ? "bg-sky" : "bg-muted";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full pulse-dot", color)} />;
}

export function Stat({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "lime" | "red" | "amber"; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className={cn("mt-2 text-[26px] leading-none tracking-[-0.03em] tabular-nums", tone === "lime" && "text-lime", tone === "red" && "text-red", tone === "amber" && "text-amber")}>{value}</p>
      {sub ? <p className="mt-2 text-[12px] leading-relaxed text-muted">{sub}</p> : null}
    </div>
  );
}

export function Progress({ value, tone = "lime", className }: { value: number; tone?: "lime" | "amber" | "red" | "sky"; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const bg = tone === "lime" ? "bg-lime" : tone === "amber" ? "bg-amber" : tone === "red" ? "bg-red" : "bg-sky";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
      <div className={cn("h-full rounded-full transition-all duration-700", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon ? <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted">{icon}</div> : null}
      <p className="text-[14px] font-medium text-cream">{title}</p>
      <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Money({ minor, currency = "USD", className, sign = false }: { minor: number; currency?: string; className?: string; sign?: boolean }) {
  return <span className={cn("tabular-nums", className)}>{formatMinor(minor, currency, { sign })}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg bg-white/[0.04]", className)} />;
}

export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-red/25 bg-red/[0.07] px-3.5 py-2.5 text-[12px] leading-relaxed text-red", className)}>
      {children}
    </div>
  );
}

export function SuccessNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-lime/25 bg-lime/[0.07] px-3.5 py-2.5 text-[12px] leading-relaxed text-lime", className)}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11.5px] leading-relaxed text-muted/80">{hint}</span> : null}
    </label>
  );
}

export const inputClass = "h-10 w-full rounded-xl border border-[#333d31] bg-[#0c100c] px-3 text-[13px] text-cream placeholder:text-muted/50 focus-ring focus:border-lime/50";
export const selectClass = "h-10 w-full appearance-none rounded-xl border border-[#333d31] bg-[#0c100c] px-3 text-[13px] text-cream focus-ring focus:border-lime/50";

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-[13px] text-cream">{label}</p>
        {description ? <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors focus-ring disabled:opacity-40",
          checked ? "border-lime/40 bg-lime/80" : "border-white/10 bg-white/[0.08]",
        )}
      >
        <span className={cn("absolute top-0.5 h-4.5 w-4.5 rounded-full bg-[#0b0e09] transition-transform", checked ? "left-[22px]" : "left-0.5")} style={{ height: 18, width: 18 }} />
      </button>
    </div>
  );
}
