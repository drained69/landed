import { describe, expect, it } from "vitest";
import { rowDirection } from "@/server/csv";

describe("CSV row direction", () => {
  it("treats negative amounts as spending and positive as income, like bank exports", () => {
    expect(rowDirection("-42.10", undefined)).toBe("out");
    expect(rowDirection("$-1,200.00", undefined)).toBe("out");
    expect(rowDirection("(18.00)", undefined)).toBe("out");
    expect(rowDirection("3200.00", undefined)).toBe("in");
  });

  it("lets an explicit direction column win", () => {
    expect(rowDirection("42.10", "OUT")).toBe("out");
    expect(rowDirection("42.10", "debit")).toBe("out");
    expect(rowDirection("-42.10", "credit")).toBe("in");
  });
});
