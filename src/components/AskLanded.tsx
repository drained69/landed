"use client";

import { useRef, useState } from "react";
import { ArrowUp, Brain, Sparkles, X } from "lucide-react";
import { post, errorMessage } from "@/lib/client";
import { Badge, ErrorNote } from "@/components/ui";

type AskCard = { label: string; value: string; detail?: string; tone?: "default" | "success" | "warning" };
type AskMemory = { id: string; summary: string; blobId: string | null; confidence: number };
type AskResponse = {
  kind: string;
  message: string;
  cards?: AskCard[];
  memories?: AskMemory[];
  suggestions?: string[];
  warning?: string | null;
};

const starters = [
  "Can I send $300 to my sister today?",
  "How much can I safely save this week?",
  "What did you learn from my last transfer?",
  "What is my best way to send $150?",
];

export function AskLanded() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(value: string) {
    const text = value.trim();
    if (!text || loading) return;
    setMessage(text);
    setLoading(true);
    setError(null);
    try {
      const result = await post<AskResponse>("/api/ask", { message: text });
      setResponse(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 80); }}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-lime/25 bg-lime/[0.07] px-3.5 text-[12px] text-lime transition hover:bg-lime/[0.12]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Ask LANDED</span>
        <span className="sm:hidden">Ask</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <aside className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0c0f0b] shadow-2xl animate-rise">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime text-[12px] font-bold text-[#0b1007]">L</span>
                <div>
                  <p className="text-[13px] text-cream">Ask LANDED</p>
                  <p className="text-[10px] text-muted">Deterministic answers · memory included</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted transition hover:bg-white/[0.05] hover:text-cream" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {!response && !loading ? (
                <>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-[12px] leading-relaxed text-muted">
                    I can explain safe-to-move, compare routes, and show what changed after a confirmed outcome. I use
                    the same deterministic engine as the rest of LANDED — not freehand arithmetic.
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted/70">Try one</p>
                  <div className="space-y-2">
                    {starters.map((starter) => (
                      <button key={starter} type="button" onClick={() => ask(starter)} className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-left text-[12px] text-cream/80 transition hover:border-lime/25 hover:text-cream">
                        {starter}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {message ? (
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#232b1f] px-3.5 py-2.5 text-[12px] text-cream">{message}</div>
              ) : null}

              {loading ? (
                <div className="space-y-2">
                  <div className="shimmer h-3 w-2/3 rounded bg-white/[0.05]" />
                  <div className="shimmer h-3 w-1/2 rounded bg-white/[0.05]" />
                  <div className="shimmer h-16 w-full rounded-xl bg-white/[0.04]" />
                </div>
              ) : null}

              {error ? <ErrorNote>{error}</ErrorNote> : null}

              {response && !loading ? (
                <div className="space-y-3 animate-rise">
                  <Badge tone={response.kind === "decision" ? "lime" : "muted"}>{response.kind}</Badge>
                  <p className="text-[12.5px] leading-6 text-cream/90">{response.message}</p>
                  {response.cards?.length ? (
                    <div className="grid gap-2">
                      {response.cards.map((card) => (
                        <div key={card.label} className={`rounded-xl border p-3 ${card.tone === "success" ? "border-lime/25 bg-lime/[0.05]" : card.tone === "warning" ? "border-amber/25 bg-amber/[0.05]" : "border-white/[0.07] bg-white/[0.02]"}`}>
                          <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted">{card.label}</p>
                          <p className={`mt-1 text-[14px] tabular-nums ${card.tone === "success" ? "text-lime" : card.tone === "warning" ? "text-amber" : "text-cream"}`}>{card.value}</p>
                          {card.detail ? <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{card.detail}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {response.memories?.length ? (
                    <div className="rounded-xl border border-white/[0.07] p-3">
                      <p className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] text-muted"><Brain className="h-3 w-3" /> Memory used</p>
                      <div className="mt-2 space-y-1.5">
                        {response.memories.map((memory) => (
                          <p key={memory.id} className="text-[10.5px] leading-relaxed text-cream/75">· {memory.summary}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {response.warning ? <p className="rounded-lg bg-amber/[0.05] px-3 py-2 text-[10.5px] leading-relaxed text-amber/90">{response.warning}</p> : null}
                  {response.suggestions?.length ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {response.suggestions.slice(0, 3).map((suggestion) => (
                        <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-muted transition hover:border-lime/25 hover:text-lime">
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); ask(message); }}
              className="border-t border-white/[0.07] p-3"
            >
              <div className="flex items-center gap-2 rounded-xl border border-[#333d31] bg-[#080b07] px-3 py-2 focus-within:border-lime/40">
                <input
                  ref={inputRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask about a move, a bill, or a lesson…"
                  className="flex-1 bg-transparent text-[12.5px] text-cream outline-none placeholder:text-muted/50"
                  maxLength={1000}
                />
                <button type="submit" disabled={!message.trim() || loading} className="flex h-7 w-7 items-center justify-center rounded-full bg-lime text-[#0b1007] disabled:opacity-30" aria-label="Send">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 text-center text-[9.5px] text-muted/50">Answers are computed from your records. Not financial advice.</p>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
