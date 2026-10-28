import { describe, expect, it } from "vitest";
import { formatJournalText, formatMemoryText, parseJournalText, parsePortableLesson, parseRuleFromMemoryText } from "@/server/engine/outcomes";

describe("portable Walrus lesson text", () => {
  const rule = { kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 12000, currency: "USD" };
  const text = formatMemoryText({
    memoryId: "cm123",
    category: "preference",
    summary: "Keep dining at or under $120.00 per month.",
    lesson: "The user set a monthly dining limit.\nWarn before a purchase would exceed it.",
    rule,
    confidence: 0.85,
    conditions: { source: "spend_watch" },
    decisionId: "none",
    createdAt: "2026-09-24T10:00:00.000Z",
  });

  it("round-trips every field a fresh install needs to rebuild the lesson", () => {
    expect(parsePortableLesson(text)).toEqual({
      memoryId: "cm123",
      category: "preference",
      createdAt: "2026-09-24T10:00:00.000Z",
      decisionId: null,
      confidence: 0.85,
      summary: "Keep dining at or under $120.00 per month.",
      lesson: "The user set a monthly dining limit. Warn before a purchase would exceed it.",
      rule,
      conditions: { source: "spend_watch" },
    });
    expect(parseRuleFromMemoryText(text)).toEqual(rule);
  });

  it("rejects text that is not a LANDED lesson, including journal entries", () => {
    expect(parsePortableLesson("I love coffee and live in Tokyo")).toBeNull();
    const journal = formatJournalText({
      decisionId: "d1", createdAt: "2026-10-19T09:00:00.000Z", question: "Can I send $300?",
      advice: "Move $150.00 now, then $150.00", amountMinor: 15000, baselineAmountMinor: 30000,
      currency: "USD", rationale: "Rent is due.", memoryIds: ["m1", "m2"],
    });
    expect(parsePortableLesson(journal)).toBeNull();
  });

  it("tolerates a corrupted rule without inventing one", () => {
    const broken = text.replace(/^rule: .*$/m, "rule: {not json");
    expect(parsePortableLesson(broken)?.rule).toBeNull();
  });
});

describe("decision journal text", () => {
  it("round-trips the question, advice, and reason", () => {
    const journal = formatJournalText({
      decisionId: "d1", createdAt: "2026-10-19T09:00:00.000Z", question: "Can I send $300\nto my sister?",
      advice: "Move $150.00 now, then $150.00", amountMinor: 15000, baselineAmountMinor: 30000,
      currency: "USD", rationale: "Rent is due in 6 days.", memoryIds: [],
    });
    expect(parseJournalText(journal)).toEqual({
      decisionId: "d1",
      createdAt: "2026-10-19T09:00:00.000Z",
      question: "Can I send $300 to my sister?",
      advice: "Move $150.00 now, then $150.00",
      because: "Rent is due in 6 days.",
    });
    expect(journal).toContain("memories: none");
    expect(parseRuleFromMemoryText(journal)).toBeNull();
  });
});
