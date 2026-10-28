"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { post, errorMessage } from "@/lib/client";
import { ErrorNote } from "@/components/ui";

export function DemoButton({ className = "", label = "Open the live demo" }: { className?: string; label?: string }) {
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
        className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-lime px-6 text-[14px] font-medium text-[#0b1007] shadow-[0_10px_40px_-12px_rgba(201,247,111,0.7)] transition hover:bg-[#d8ff8e] disabled:opacity-50"
      >
        {loading ? "Opening…" : label}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </button>
      {error ? <ErrorNote className="mt-3 max-w-sm">{error}</ErrorNote> : null}
    </div>
  );
}
