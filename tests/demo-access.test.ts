import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/server/db", () => ({ prisma: { session: { findUnique: mocks.findUnique } } }));

import { getSessionUser } from "@/server/auth";

describe("disabled demo sessions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rejects an existing demo session when the demo is disabled while retaining normal sessions", async () => {
    vi.stubEnv("LANDED_DEMO_ENABLED", "false");
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "session-token" }) });
    const user = { id: "1", email: "demo@example.com", name: "Demo", isDemo: true, preferredCurrency: "USD", locale: "en-US", safetyBufferMinor: 0, mainObjective: null, riskPosture: "balanced", onboardingComplete: true };
    mocks.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), user });
    expect(await getSessionUser()).toBeNull();
    mocks.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000), user: { ...user, isDemo: false } });
    expect((await getSessionUser())?.id).toBe("1");
  });
});
