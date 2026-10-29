import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <LogoMark size={40} />
      <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-lime">404</p>
      <h1 className="mt-2 font-display text-[36px] leading-tight text-cream">Nothing landed here.</h1>
      <p className="mt-3 max-w-sm text-[13px] leading-6 text-muted">That page doesn&apos;t exist, or the record belongs to another account.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/app" className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-medium text-white transition hover:bg-black/80">Open LANDED</Link>
        <Link href="/" className="rounded-full border border-black/[0.12] px-4 py-2 text-[12.5px] text-cream transition hover:border-lime/50">Home</Link>
      </div>
    </div>
  );
}
