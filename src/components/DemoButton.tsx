"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { post, errorMessage } from "@/lib/client";
import { ErrorNote } from "@/components/ui";

export function DemoButton({ className = "", label = "Open the live demo", variant = "primary" }: { className?: string; label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDemo() {
    setLoading(true);
    setError(null);
    try {
      const result = await post<{ next: string }>("/api/auth/demo");
      router.push(result.next ?? "/app");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={openDemo}
        disabled={loading}
        className={
          variant === "primary"
            ? "group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-white shadow-[0_10px_40px_-12px_rgba(10,11,12,0.35)] transition hover:bg-black/80 disabled:opacity-50"
            : "group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-black/[0.12] px-5 text-[13.5px] text-cream transition hover:border-lime/40 hover:text-lime disabled:opacity-50"
        }
      >
        {loading ? "Opening…" : label}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
      {error ? <ErrorNote className="mt-3 max-w-sm">{error}</ErrorNote> : null}
    </div>
  );
}
