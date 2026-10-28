"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeftRight, Brain, CircleDollarSign, LayoutGrid, LogOut, Menu, Receipt, Settings, X,
} from "lucide-react";
import { cn, post } from "@/lib/client";
import { AskLanded } from "@/components/AskLanded";

const nav = [
  { href: "/app", label: "Overview", icon: LayoutGrid },
  { href: "/app/plan", label: "Plan a move", icon: ArrowLeftRight },
  { href: "/app/spending", label: "Spend Watch", icon: Receipt },
  { href: "/app/activity", label: "Activity", icon: CircleDollarSign },
  { href: "/app/learning", label: "Memory", icon: Brain },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

const titles: Record<string, { title: string; eyebrow: string }> = {
  "/app": { title: "Overview", eyebrow: "Today" },
  "/app/plan": { title: "Plan a move", eyebrow: "Decision engine" },
  "/app/spending": { title: "Spend Watch", eyebrow: "Learned limits" },
  "/app/activity": { title: "Activity", eyebrow: "Outcomes" },
  "/app/learning": { title: "Memory", eyebrow: "Learning ledger" },
  "/app/settings": { title: "Settings", eyebrow: "Your controls" },
};

export function AppShell({ user, children }: { user: { name: string; email: string; isDemo: boolean }; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const rootKey = pathname.startsWith("/app/decisions") ? "/app/activity" : pathname;
  const header = titles[rootKey] ?? { title: "LANDED", eyebrow: "Workspace" };
  const initial = user.name.trim().charAt(0).toUpperCase() || "L";

  async function signOut() {
    setSigningOut(true);
    try {
      await post("/api/auth/logout");
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  const navItems = (
    <nav className="space-y-1">
      {nav.map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12.5px] transition",
              active ? "bg-[#242c20] text-cream" : "text-muted hover:bg-white/[0.035] hover:text-cream",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-lime" : "text-muted/70 group-hover:text-cream")} />
            {item.label}
            {active ? <span className="ml-auto h-1 w-1 rounded-full bg-lime" /> : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <div className="pointer-events-none fixed inset-0 grid-noise opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[238px] flex-col border-r border-white/[0.07] bg-[#0a0d09]/90 px-3.5 py-5 backdrop-blur-xl lg:flex">
        <Link href="/app" className="flex items-center gap-2.5 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime text-[13px] font-bold text-[#0b1007]">L</span>
          <span className="text-[14px] font-semibold tracking-[0.16em] text-cream">LANDED</span>
        </Link>

        <div className="mt-7">{navItems}</div>

        <div className="mt-auto space-y-2">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] text-muted">
              <span className={cn("h-1.5 w-1.5 rounded-full", user.isDemo ? "bg-amber" : "bg-lime")} />
              {user.isDemo ? "Demo dataset" : "Your account"}
            </p>
            <p className="mt-2 text-[11.5px] text-cream/80">{user.name}</p>
            <p className="text-[10px] text-muted">{user.email}</p>
            {user.isDemo ? <p className="mt-2 text-[9.5px] leading-relaxed text-muted/70">Balances and outcomes are synthetic and labelled.</p> : null}
          </div>
          <button type="button" onClick={signOut} disabled={signingOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[11.5px] text-muted transition hover:bg-white/[0.04] hover:text-cream">
            <LogOut className="h-3.5 w-3.5" /> {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <div className="relative lg:pl-[238px]">
        <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#080a08]/82 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-muted hover:bg-white/[0.05] hover:text-cream lg:hidden" aria-label="Open navigation">
              <Menu className="h-4.5 w-4.5" />
            </button>
            <div className="min-w-0">
              <p className="text-[9.5px] uppercase tracking-[0.15em] text-muted/70">{header.eyebrow}</p>
              <p className="truncate text-[13px] font-medium text-cream">{header.title}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <AskLanded />
              <span className="hidden h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#1b2119] text-[11px] text-cream sm:flex">{initial}</span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-14">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#0a0d09]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-around">
          {nav.map((item) => {
            const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn("flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[9px]", active ? "text-lime" : "text-muted")}>
                <Icon className="h-4 w-4" />
                {item.label === "Plan a move" ? "Plan" : item.label === "Learning" ? "Memory" : item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setMobileOpen(false); }}>
          <aside className="flex h-full w-[270px] flex-col border-r border-white/10 bg-[#0b0e0a] p-4 animate-rise">
            <div className="flex items-center justify-between px-1">
              <Link href="/app" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime text-[13px] font-bold text-[#0b1007]">L</span>
                <span className="text-[14px] font-semibold tracking-[0.16em] text-cream">LANDED</span>
              </Link>
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-muted" aria-label="Close navigation"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-7">{navItems}</div>
            <div className="mt-auto rounded-xl border border-white/[0.07] p-3 text-[11px] text-muted">
              <p className="text-cream/80">{user.name}</p>
              <p className="mt-0.5 text-[10px]">{user.email}</p>
              <button type="button" onClick={signOut} className="mt-3 flex items-center gap-2 text-[10.5px] text-muted hover:text-cream"><LogOut className="h-3 w-3" /> Sign out</button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
