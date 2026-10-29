import { afterEach, describe, expect, it, vi } from "vitest";
import { explainDecision, inventedNumbers, numbersIn, type ExplanationFacts } from "@/server/services/explain";

const facts: ExplanationFacts = {
  question: "Can I send $300 to my sister today?",
  advice: "Move $150.00 now, then $150.00.",
  baselineAdvice: "Move $300.00 today",
  reasons: ["After protecting $1,680.00 in scheduled commitments and a $100.00 buffer, $150.00 is safe to move."],
  memoriesUsed: ["Cap a single transfer at 50% of safe-to-move when rent is near."],
};

function reply(content: string, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function configure() {
  vi.stubEnv("AI_BASE_URL", "https://llm.example/v1/");
  vi.stubEnv("AI_API_KEY", "test-key");
  vi.stubEnv("AI_MODEL", "test-model");
}

describe("number guard", () => {
  it("normalizes currency, separators and trailing zeros", () => {
    expect([...numbersIn("$1,680.00 and 150 and 0.50 and 50%")]).toEqual(["1680", "150", "0.5", "50"]);
  });

  it("flags any number the facts do not contain", () => {
    expect(inventedNumbers("Send $150 now and $150 after payday.", facts)).toEqual([]);
    expect(inventedNumbers("Send $150 now; you'd still have $3,200 left.", facts)).toEqual(["3200"]);
  });
});

describe("explainDecision", () => {
  it("calls nothing without configuration", async () => {
    const fetchMock = reply("unused");
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AI_BASE_URL", "");
    expect(await explainDecision(facts)).toEqual({ explanation: null, note: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a plain-language rewrite that keeps LANDED's numbers", async () => {
    configure();
    const fetchMock = reply("Rent is coming up, so send $150 now and the other $150 after payday. That keeps a $100 cushion.");
    vi.stubGlobal("fetch", fetchMock);
    const result = await explainDecision(facts);
    expect(result.explanation).toMatchObject({ source: "ai", model: "test-model" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.example/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
  });

  it("discards a reply that invents a number", async () => {
    configure();
    vi.stubGlobal("fetch", reply("You can safely send $175 today."));
    const result = await explainDecision(facts);
    expect(result.explanation).toBeNull();
    expect(result.note).toMatch(/did not compute \(175\)/);
  });

  it("degrades to the computed answer on provider errors", async () => {
    configure();
    vi.stubGlobal("fetch", reply("", 500));
    expect((await explainDecision(facts)).note).toMatch(/HTTP 500/);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await explainDecision(facts)).explanation).toBeNull();
  });
});
