/**
 * Optional AI explanation layer (OpenAI-compatible chat completions).
 *
 * It only rewrites facts LANDED already computed into plain language. It never
 * computes, ranks, confirms outcomes or writes memory. Any reply that contains
 * a number not present in the facts is discarded, so a model cannot invent or
 * "correct" an amount. Without configuration, nothing is called.
 */

export interface ExplanationFacts {
  question: string;
  advice: string;
  baselineAdvice: string | null;
  reasons: string[];
  memoriesUsed: string[];
}

export interface Explanation {
  text: string;
  source: "ai";
  model: string;
}

export interface ExplanationResult {
  explanation: Explanation | null;
  /** Why no AI explanation is shown, when one was attempted. */
  note: string | null;
}

export function aiConfig() {
  const baseUrl = process.env.AI_BASE_URL?.trim() ?? "";
  const apiKey = process.env.AI_API_KEY?.trim() ?? "";
  const model = process.env.AI_MODEL?.trim() ?? "";
  return { configured: Boolean(baseUrl && apiKey && model), baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

/** Canonical numbers in text: "$1,680.00" → "1680", "0.50" → "0.5", "50%" → "50". */
export function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = match[0].replace(/,/g, "");
    const n = Number(raw);
    if (Number.isFinite(n)) found.add(String(n));
  }
  return found;
}

/** Numbers the explanation uses that the computed facts do not contain. */
export function inventedNumbers(explanation: string, facts: ExplanationFacts): string[] {
  const allowed = numbersIn(JSON.stringify(facts));
  return [...numbersIn(explanation)].filter((n) => !allowed.has(n));
}

const SYSTEM_PROMPT = [
  "You explain a personal-finance recommendation in plain language to someone with no finance or crypto background.",
  "Use only the facts provided. Never add, compute, round, convert or change any number; repeat numbers exactly as given or leave them out.",
  "Do not give new advice, do not mention blockchains, models or yourself.",
  "Write two or three short sentences. No lists, no headings.",
].join(" ");

export async function explainDecision(facts: ExplanationFacts): Promise<ExplanationResult> {
  const config = aiConfig();
  if (!config.configured) return { explanation: null, note: null };
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(facts) },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return { explanation: null, note: `AI explanation unavailable (HTTP ${response.status}); the computed answer above stands.` };
    const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text || text.length > 800) return { explanation: null, note: "AI explanation discarded: empty or too long." };
    const invented = inventedNumbers(text, facts);
    if (invented.length > 0) {
      return { explanation: null, note: `AI explanation discarded: it used a number LANDED did not compute (${invented.slice(0, 3).join(", ")}).` };
    }
    return { explanation: { text, source: "ai", model: config.model }, note: null };
  } catch (error) {
    return { explanation: null, note: `AI explanation unavailable (${error instanceof Error ? error.name : "error"}); the computed answer above stands.` };
  }
}
