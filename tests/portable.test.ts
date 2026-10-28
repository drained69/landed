import { describe, expect, it } from "vitest";
import {
  formatJournalText, formatLessonUpdate, formatMemoryText, latestLessonState, parseJournalText, parseLessonUpdate,
  parsePortableLesson, parseRuleFromMemoryText,
} from "@/server/engine/outcomes";

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
      status: "active",
      supersededBy: null,
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

describe("lesson update text", () => {
  const base = {
    memoryId: "m1", updateId: "u1", createdAt: "2026-10-20T10:00:00.000Z", kind: "confidence" as const,
    confidence: 0.775, confidenceBefore: 0.7, supersededBy: null, excluded: false,
    verdict: "held", decisionId: "d1", reason: "The approved price held.",
  };

  it("round-trips and is never mistaken for a lesson or a rule", () => {
    const text = formatLessonUpdate(base);
    expect(parseLessonUpdate(text)).toEqual(base);
    expect(parsePortableLesson(text)).toBeNull();
    expect(parseRuleFromMemoryText(text)).toBeNull();
  });

  it("folds updates newest-wins regardless of recall order", () => {
    const later = { ...base, updateId: "u2", createdAt: "2026-10-25T10:00:00.000Z", kind: "superseded" as const, supersededBy: "m2", confidence: 0.6 };
    expect(latestLessonState([later, base])).toEqual({ confidence: 0.6, supersededBy: "m2", excluded: false, at: later.createdAt });
    expect(latestLessonState([])).toBeNull();
  });

  it("rejects malformed updates", () => {
    expect(parseLessonUpdate(formatLessonUpdate(base).replace("kind=confidence", "kind=delete"))).toBeNull();
    expect(parseLessonUpdate(formatLessonUpdate(base).replace(/created=.*/, "created=yesterday"))).toBeNull();
  });
});

describe("lesson status in portable text", () => {
  it("carries supersession so a restore never revives a replaced rule", () => {
    const text = formatMemoryText({
      memoryId: "m1", category: "preference", summary: "s", lesson: "l", rule: null, confidence: 0.5,
      conditions: null, decisionId: "none", createdAt: "2026-10-01T00:00:00.000Z", status: "superseded", supersededBy: "m2",
    });
    expect(parsePortableLesson(text)).toMatchObject({ status: "superseded", supersededBy: "m2" });
  });
});
