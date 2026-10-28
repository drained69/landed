import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Authorization is enforced in the database query, not only in the UI.
 * This test uses a throwaway SQLite database so it never touches dev data.
 *
 * It is intentionally an integration test: cross-user isolation is a property
 * of the Prisma `where` clauses, and mocking those away would test nothing.
 */

const DB_NAME = `test-auth-${process.pid}.db`;
const DB_PATH = join(process.cwd(), "prisma", DB_NAME);

let prisma: typeof import("@/server/db").prisma;
let services: typeof import("@/server/services/decisions");
let memory: typeof import("@/server/services/memory");
let ownerId = "";
let strangerId = "";
let decisionId = "";
let memoryId = "";

beforeAll(async () => {
  process.env.DATABASE_URL = `file:./${DB_NAME}`;
  // The database name is unique per process, so a plain push creates it fresh.
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:./${DB_NAME}` },
    stdio: "pipe",
  });

  ({ prisma } = await import("@/server/db"));
  services = await import("@/server/services/decisions");
  memory = await import("@/server/services/memory");

  const owner = await prisma.user.create({ data: { email: "owner@test.landed", name: "Owner" } });
  const stranger = await prisma.user.create({ data: { email: "stranger@test.landed", name: "Stranger" } });
  ownerId = owner.id;
  strangerId = stranger.id;

  const decision = await prisma.financialDecision.create({
    data: {
      userId: ownerId,
      decisionType: "send",
      objective: "Owner's private decision",
      requestedAmountMinor: 30_000,
      currency: "USD",
      inputSnapshot: JSON.stringify({ asOf: "2026-10-01T12:00:00.000Z", currency: "USD" }),
      calculationVersion: "test",
      recommendedAction: "{}",
      baselineAction: "{}",
      assumptions: "[]",
      memoryReferences: "[]",
      predictedOutcome: "{}",
    },
  });
  decisionId = decision.id;

  const lesson = await prisma.memoryRecord.create({
    data: {
      userId: ownerId,
      category: "correction",
      summary: "Owner's private lesson",
      lesson: "Never leak this to another account.",
      verificationStatus: "user_confirmed",
      writeStatus: "confirmed",
      walrusBlobId: "test-blob-owner",
    },
  });
  memoryId = lesson.id;
});

afterAll(async () => {
  await prisma?.$disconnect();
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  if (existsSync(`${DB_PATH}-journal`)) unlinkSync(`${DB_PATH}-journal`);
});

describe("cross-user authorization", () => {
  it("returns null when a stranger requests another user's decision", async () => {
    expect(await services.getDecision(strangerId, decisionId)).toBeNull();
    expect((await services.getDecision(ownerId, decisionId))?.id).toBe(decisionId);
  });

  it("does not list another user's decisions", async () => {
    expect(await services.listDecisions(strangerId)).toHaveLength(0);
    expect(await services.listDecisions(ownerId)).toHaveLength(1);
  });

  it("refuses to follow, decline, replay, or evaluate a decision owned by someone else", async () => {
    await expect(services.markFollowed(strangerId, decisionId)).rejects.toThrow(/not found/i);
    await expect(services.declineDecision(strangerId, decisionId)).rejects.toThrow(/not found/i);
    await expect(services.replayDecision(strangerId, decisionId)).rejects.toThrow(/not found/i);
    await expect(
      services.recordOutcome({
        userId: strangerId,
        decisionId,
        amountSentMinor: 30_000,
        actualFeeMinor: 500,
        actualReceivedMinor: 29_500,
        deliveryHours: 4,
        bufferAfterMinor: 20_000,
        billsCovered: true,
        shortfallOccurred: false,
        notes: "stranger attempt",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("does not let a stranger read or suppress another user's lesson", async () => {
    expect(await memory.listMemories(strangerId)).toHaveLength(0);
    await expect(memory.excludeMemory(strangerId, memoryId, true, "attack")).rejects.toThrow(/not found/i);
    const ownerLesson = await memory.listMemories(ownerId);
    expect(ownerLesson).toHaveLength(1);
    expect(ownerLesson[0].excluded).toBe(false);
  });

  it("keeps Walrus namespaces disjoint per user and stable per account", async () => {
    expect(memory.userNamespace("owner@test.landed")).not.toBe(memory.userNamespace("stranger@test.landed"));
    expect(memory.userNamespace("Owner@Test.Landed ")).toBe(memory.userNamespace("owner@test.landed"));
    expect(memory.userNamespace("owner@test.landed")).toMatch(/^landed-[a-f0-9]{24}$/);
    expect(await memory.namespaceForUser(ownerId)).toBe(memory.userNamespace("owner@test.landed"));
  });
});
