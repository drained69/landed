import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireApiUser: vi.fn(), createSession: vi.fn(), destroySession: vi.fn() }));
vi.mock("@/server/auth", async (original) => ({
  ...await original<typeof import("@/server/auth")>(),
  ...auth,
}));

const DB_NAME = `test-api-security-${process.pid}.db`;
const DB_PATH = join(process.cwd(), "prisma", DB_NAME);
let prisma: typeof import("@/server/db").prisma;
let accountRoute: typeof import("@/app/api/accounts/[id]/route");
let settingsRoute: typeof import("@/app/api/settings/route");
let goalRoute: typeof import("@/app/api/savings-goals/[id]/route");
let billRoute: typeof import("@/app/api/commitments/[id]/route");
let quoteRoute: typeof import("@/app/api/routes/[id]/quotes/route");
let transactionRoute: typeof import("@/app/api/transactions/route");
let demoRoute: typeof import("@/app/api/auth/demo/route");
let signupRoute: typeof import("@/app/api/auth/signup/route");
let deleteRoute: typeof import("@/app/api/account/route");
let user: Awaited<ReturnType<typeof prisma.user.create>>;
let accountId: string;
let goalId: string;
let billId: string;
let routeId: string;

const context = (id = "") => ({ params: Promise.resolve({ id }) });
function request(method: string, body?: unknown, suffix = "") {
  return new NextRequest(`https://landed.test/api/test${suffix}`, {
    method,
    headers: { "content-type": "application/json", origin: "https://landed.test" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:./${DB_NAME}`;
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"], {
    cwd: process.cwd(), env: { ...process.env }, stdio: "pipe",
  });
  ({ prisma } = await import("@/server/db"));
  const { hashPassword } = await import("@/server/auth");
  user = await prisma.user.create({ data: { email: "api-security@test.landed", name: "Test", passwordHash: hashPassword("correct password") } });
  auth.requireApiUser.mockResolvedValue(user);
  accountId = (await prisma.financialAccount.create({ data: { userId: user.id, name: "Account", accountType: "bank", currency: "USD", balanceMinor: 50000, verificationStatus: "verified_onchain", balanceSource: "onchain", lastSyncedAt: new Date() } })).id;
  goalId = (await prisma.savingsGoal.create({ data: { userId: user.id, name: "Savings", currency: "USD", targetMinor: 10000 } })).id;
  billId = (await prisma.commitment.create({ data: { userId: user.id, name: "Rent", currency: "USD", amountMinor: 1000, dueDate: new Date("2026-10-01"), recurrence: "monthly" } })).id;
  routeId = (await prisma.paymentRoute.create({ data: { userId: user.id, name: "JPY route", providerOrMethod: "Manual", originCurrency: "USD", destinationCurrency: "JPY", payoutMethod: "bank_deposit", routeType: "bank" } })).id;
  [accountRoute, settingsRoute, goalRoute, billRoute, quoteRoute, transactionRoute, demoRoute, signupRoute, deleteRoute] = await Promise.all([
    import("@/app/api/accounts/[id]/route"), import("@/app/api/settings/route"),
    import("@/app/api/savings-goals/[id]/route"), import("@/app/api/commitments/[id]/route"),
    import("@/app/api/routes/[id]/quotes/route"), import("@/app/api/transactions/route"),
    import("@/app/api/auth/demo/route"), import("@/app/api/auth/signup/route"), import("@/app/api/account/route"),
  ]);
});

afterAll(async () => {
  await prisma?.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) if (existsSync(`${DB_PATH}${suffix}`)) unlinkSync(`${DB_PATH}${suffix}`);
});

describe("API financial integrity and access boundaries", () => {
  it("rejects forged onchain account verification", async () => {
    const response = await accountRoute.PATCH(request("PATCH", { verificationStatus: "verified_onchain" }), context(accountId));
    expect(response.status).toBe(400);
  });

  it("clears onchain provenance when a balance is manually edited", async () => {
    const response = await accountRoute.PATCH(request("PATCH", { balance: "400" }), context(accountId));
    expect(response.status).toBe(200);
    const account = await prisma.financialAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account).toMatchObject({ balanceMinor: 40000, verificationStatus: "user_confirmed", balanceSource: "manual", lastSyncedAt: null });
  });

  it("rejects negative buffer, account balance, goal contribution, and bill amount", async () => {
    expect((await settingsRoute.PATCH(request("PATCH", { safetyBuffer: "-1" }), context())).status).toBe(400);
    expect((await accountRoute.PATCH(request("PATCH", { balance: "-1" }), context(accountId))).status).toBe(400);
    expect((await goalRoute.PATCH(request("PATCH", { monthlyContribution: "-1" }), context(goalId))).status).toBe(400);
    expect((await billRoute.PATCH(request("PATCH", { amount: "-1" }), context(billId))).status).toBe(400);
  });

  it("rejects impossible dates and amounts that exceed database storage", async () => {
    expect((await billRoute.PATCH(request("PATCH", { dueDate: "2026-02-30" }), context(billId))).status).toBe(400);
    expect((await accountRoute.PATCH(request("PATCH", { balance: "21474836.48" }), context(accountId))).status).toBe(400);
  });

  it("rejects malformed or overprecise amounts instead of silently changing them", async () => {
    for (const amount of ["12,3", "1.2.3", "10abc", "12.345"]) {
      expect((await accountRoute.PATCH(request("PATCH", { balance: amount }), context(accountId))).status).toBe(400);
    }
  });

  it("validates pagination without allowing Prisma errors or negative take", async () => {
    for (const limit of ["NaN", "-1", "1.5", "0"]) {
      expect((await transactionRoute.GET(request("GET", undefined, `?limit=${limit}`), context())).status).toBe(400);
    }
  });

  it("rejects cross-origin writes even when a host header is absent", async () => {
    const req = new NextRequest("https://landed.test/api/settings", { method: "PATCH", headers: { origin: "https://attacker.test" }, body: JSON.stringify({ name: "Changed" }) });
    expect((await settingsRoute.PATCH(req, context())).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("Test");
  });

  it("prevents caching of financial responses", async () => {
    expect((await settingsRoute.GET(request("GET"), context())).headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects oversized JSON before parsing", async () => {
    const req = new NextRequest("https://landed.test/api/settings", { method: "PATCH", body: JSON.stringify({ name: "a".repeat(2_000_001) }) });
    expect((await settingsRoute.PATCH(req, context())).status).toBe(413);
  });

  it("does not accept a manually entered quote as a provider-verified result", async () => {
    const body = { sendAmount: "100", exchangeRate: "150", estimatedDeliveryHours: 2 };
    expect((await quoteRoute.POST(request("POST", { ...body, source: "provider_api" }), context(routeId))).status).toBe(400);
    expect((await quoteRoute.POST(request("POST", { ...body, evidenceQuality: "verified_outcome" }), context(routeId))).status).toBe(400);
    expect((await prisma.routeQuote.count({ where: { routeId } }))).toBe(0);
  });

  it("calculates a cross-currency quote using the destination currency's units", async () => {
    const response = await quoteRoute.POST(request("POST", { sendAmount: "100", exchangeRate: "150", estimatedDeliveryHours: 2 }), context(routeId));
    expect(response.status).toBe(200);
    expect((await response.json()).quote).toMatchObject({ sendAmountMinor: 10000, expectedReceivedMinor: 15000, source: "user_entered", evidenceQuality: "user_reported" });
  });

  it("rejects negative fees and invalid exchange rates", async () => {
    for (const extra of [{ fee: "-2" }, { exchangeRate: "0" }, { exchangeRate: "Infinity" }, { exchangeRate: "-1" }]) {
      expect((await quoteRoute.POST(request("POST", { sendAmount: "100", estimatedDeliveryHours: 2, ...extra }), context(routeId))).status).toBe(400);
    }
  });

  it("rolls back savings progress if its transaction cannot be recorded", async () => {
    await prisma.$executeRawUnsafe("CREATE TRIGGER fail_savings BEFORE INSERT ON \"Transaction\" WHEN NEW.category = 'savings' BEGIN SELECT RAISE(ABORT, 'test storage failure'); END");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await goalRoute.POST(request("POST", { amount: "10" }), context(goalId))).status).toBe(500);
      expect((await prisma.savingsGoal.findUniqueOrThrow({ where: { id: goalId } })).currentMinor).toBe(0);
    } finally {
      log.mockRestore();
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_savings");
    }
  });

  it("records savings progress and its transaction together", async () => {
    expect((await goalRoute.POST(request("POST", { amount: "10" }), context(goalId))).status).toBe(200);
    expect((await goalRoute.POST(request("POST", { amount: "20" }), context(goalId))).status).toBe(200);
    expect((await prisma.savingsGoal.findUniqueOrThrow({ where: { id: goalId } })).currentMinor).toBe(3000);
    expect(await prisma.transaction.count({ where: { userId: user.id, category: "savings" } })).toBe(2);
  });

  it("rolls back a bill payment when creating the next recurrence fails", async () => {
    await prisma.$executeRawUnsafe("CREATE TRIGGER fail_recurrence BEFORE INSERT ON \"Commitment\" BEGIN SELECT RAISE(ABORT, 'test storage failure'); END");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await billRoute.POST(request("POST", {}), context(billId))).status).toBe(500);
      expect((await prisma.commitment.findUniqueOrThrow({ where: { id: billId } })).status).toBe("upcoming");
      expect(await prisma.transaction.count({ where: { userId: user.id, dedupeKey: `bill:${billId}` } })).toBe(0);
    } finally {
      log.mockRestore();
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_recurrence");
    }
  });

  it("does not let the public demo endpoint sign in to an ordinary account", async () => {
    const ordinary = await prisma.user.create({ data: { email: "demo@landed.app", name: "Ordinary", isDemo: false } });
    vi.stubEnv("LANDED_DEMO_ENABLED", "true");
    try {
      expect((await demoRoute.POST(request("POST", {}), context())).status).toBe(503);
      expect(auth.createSession).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      await prisma.user.delete({ where: { id: ordinary.id } });
    }
  });

  it("reserves the public demo email during signup", async () => {
    expect((await signupRoute.POST(request("POST", { name: "Attacker", email: "demo@landed.app", password: "test password", currency: "USD" }), context())).status).toBe(409);
    expect(await prisma.user.findUnique({ where: { email: "demo@landed.app" } })).toBeNull();
  });

  it("removes personal audit records when deleting an account", async () => {
    await prisma.auditEvent.create({ data: { userId: user.id, type: "private", payload: "private data" } });
    expect((await deleteRoute.DELETE(request("DELETE", { confirmEmail: user.email, password: "correct password" }), context())).status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.auditEvent.count({ where: { payload: "private data" } })).toBe(0);
  });
});
