import { describe, expect, it } from "vitest";
import { resolveReplayCutoff } from "@/server/services/decisions";

const DECISION_TIME = new Date("2026-10-01T12:00:00.000Z");

describe("learning replay cutoff", () => {
  it("defaults to the moment the decision was recorded", () => {
    const resolved = resolveReplayCutoff(DECISION_TIME);
    expect(resolved.cutoff.toISOString()).toBe(DECISION_TIME.toISOString());
    expect(resolved.clamped).toBe(false);
    expect(resolved.reason).toBeNull();
  });

  it("allows an earlier cutoff for a strict counterfactual", () => {
    const resolved = resolveReplayCutoff(DECISION_TIME, "2026-09-20T00:00:00.000Z");
    expect(resolved.cutoff.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(resolved.clamped).toBe(false);
  });

  it("clamps a later cutoff so a lesson learned afterwards cannot leak into the replay", () => {
    const resolved = resolveReplayCutoff(DECISION_TIME, "2026-12-01T00:00:00.000Z");
    expect(resolved.cutoff.toISOString()).toBe(DECISION_TIME.toISOString());
    expect(resolved.clamped).toBe(true);
    expect(resolved.reason).toMatch(/future-information/i);
  });

  it("rejects an invalid cutoff instead of silently using now", () => {
    expect(() => resolveReplayCutoff(DECISION_TIME, "not-a-date")).toThrow(/valid date/i);
  });
});
