import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MemWalMock } from "@mysten-incubation/memwal";

/**
 * Walrus Memory flows against the SDK's own deterministic mock (MemWalMock):
 * same API, no network. The mock has no listMemories, so the wrapper below
 * records every write and lists it the way the relayer's inventory would.
 * A throwaway SQLite database holds LANDED's side.
 */

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@mysten-incubation/memwal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mysten-incubation/memwal")>();
  return { ...actual, MemWal: { create: () => holder.client } };
});

const DB_NAME = `test-walrus-${process.pid}.db`;
const DB_PATH = join(process.cwd(), "prisma", DB_NAME);
const EMAIL = "maya@test.landed";

type Listed = { memory_id: string; namespace_id: string; blob_id: string; created_at: string };

function relayer(inner: MemWalMock) {
  const listed: Listed[] = [];
  return {
    listed,
    health: () => inner.health(),
    destroy: () => undefined,
    recall: (params: Parameters<MemWalMock["recall"]>[0]) => inner.recall(params),
    restore: (namespace: string, limit?: number) => inner.restore(namespace, limit),
    async rememberAndWait(text: string, namespace: string, opts?: { idempotencyKey?: string }) {
      const result = await inner.rememberAndWait(text, namespace, opts);
      if (!listed.some((l) => l.blob_id === result.blob_id)) {
        listed.push({ memory_id: result.job_id ?? result.blob_id, namespace_id: namespace, blob_id: result.blob_id, created_at: new Date().toISOString() });
      }
      return result;
    },
    async listMemories() {
      return { memories: listed, next_cursor: null, has_more: false, snapshot_version: 1, deleted: [] };
    },
  };
}

let prisma: typeof import("@/server/db").prisma;
let memory: typeof import("@/server/services/memory");
let decisions: typeof import("@/server/services/decisions");
let client: ReturnType<typeof relayer>;
let userId = "";
const ids = { oldLimit: "", newLimit: "", watch: "", unwritten: "", draft: "", decision: "" };

async function makeLesson(rule: unknown, summary: string, extra: Record<string, unknown> = {}) {
  const row = await prisma.memoryRecord.create({
    data: {
      userId, category: "preference", summary, lesson: `${summary} (lesson)`,
      structuredRule: JSON.stringify(rule), confidence: 0.7,
      verificationStatus: "user_confirmed", writeStatus: "pending", ...extra,
    },
  });
  return row.id;
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:./${DB_NAME}`;
  process.env.MEMWAL_PRIVATE_KEY = "test-delegate-key";
  process.env.MEMWAL_ACCOUNT_ID = "test-account";
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:./${DB_NAME}` },
    stdio: "pipe",
  });
  const { MemWalMock: Mock } = await vi.importActual<typeof import("@mysten-incubation/memwal")>("@mysten-incubation/memwal");
  client = relayer(Mock.create());
  holder.client = client;

  ({ prisma } = await import("@/server/db"));
  memory = await import("@/server/services/memory");
  decisions = await import("@/server/services/decisions");

  const user = await prisma.user.create({ data: { email: EMAIL, name: "Maya" } });
  userId = user.id;
  ids.oldLimit = await makeLesson({ kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 12000, currency: "USD" }, "Keep dining at or under $120.00 per month.");
  ids.watch = await makeLesson({ kind: "SUBSCRIPTION_WATCH", merchant: "Streaming bundle", approvedAmountMinor: 1800, currency: "USD", tolerancePercent: 5 }, "Approved Streaming bundle at $18.00.");
  ids.unwritten = await makeLesson({ kind: "SPEND_LIMIT", category: "transport", monthlyLimitMinor: 9000, currency: "USD" }, "Keep transport at or under $90.00 per month.");
  ids.draft = await makeLesson({ kind: "AMOUNT_CAP", capPercentOfSafe: 0.5 }, "Draft lesson the user never confirmed.", { verificationStatus: "hypothesis" });
});

afterAll(async () => {
  await prisma?.$disconnect();
  for (const suffix of ["", "-journal"]) {
    const path = `${DB_PATH}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
});

describe("Walrus Memory writes and inventory", () => {
  it("writes confirmed lessons to the account namespace and the relayer inventory agrees", async () => {
    const a = await memory.writeMemoryToWalrus(userId, ids.oldLimit);
    const b = await memory.writeMemoryToWalrus(userId, ids.watch);
    expect(a.writeStatus).toBe("confirmed");
    expect(a.blobId).toBeTruthy();
    expect(b.writeStatus).toBe("confirmed");
    const row = await prisma.memoryRecord.findUniqueOrThrow({ where: { id: ids.oldLimit } });
    expect(row.namespace).toBe(memory.userNamespace(userId));

    const inventory = await memory.walrusInventory(userId);
    expect(inventory).toMatchObject({ configured: true, lessonBlobs: 2, matched: 2, onlyOnWalrus: 0, onlyLocal: 0, error: null });
  });

  it("never writes a draft lesson", async () => {
    const result = await memory.writeMemoryToWalrus(userId, ids.draft);
    expect(result.blobId).toBeNull();
    expect(client.listed).toHaveLength(2);
  });
});

describe("Spend Watch rules are recalled from Walrus", () => {
  it("labels each rule by whether this request recalled it", async () => {
    const recall = await memory.recallRuleMemories(userId, ["SPEND_LIMIT", "SUBSCRIPTION_WATCH"], "LANDED lesson spending limit per month approved subscription price");
    const from = Object.fromEntries(recall.memories.map((m) => [m.id, m.recalledFrom]));
    expect(from[ids.oldLimit]).toBe("walrus");
    expect(from[ids.watch]).toBe("walrus");
    // Not written yet: still applied, but honestly labelled local.
    expect(from[ids.unwritten]).toBe("local");
    expect(recall).toMatchObject({ mode: "mixed", total: 3, recalled: 2 });
  });
});

describe("lesson state changes are appended to Walrus", () => {
  it("writes supersession and confidence updates once their lesson is on Walrus", async () => {
    ids.newLimit = await makeLesson({ kind: "SPEND_LIMIT", category: "dining", monthlyLimitMinor: 15000, currency: "USD" }, "Updated: keep dining at or under $150.00 per month.");
    await memory.writeMemoryToWalrus(userId, ids.newLimit);
    await memory.supersedeMemory(userId, ids.oldLimit, ids.newLimit, "Replaced by a newer Spend Watch rule");

    await prisma.memoryRecord.update({ where: { id: ids.watch }, data: { confidence: 0.775 } });
    ids.decision = "decision-held-1";
    await memory.recordLessonUpdate(userId, ids.watch, {
      kind: "confidence", verdict: "held", decisionId: ids.decision, confidenceBefore: 0.7,
      reason: "The approved price held.",
    });
    // An update to a lesson that is not on Walrus waits for it.
    await memory.recordLessonUpdate(userId, ids.unwritten, { kind: "excluded", reason: "test" });

    const flush = await memory.flushLessonUpdates(userId);
    expect(flush).toMatchObject({ written: 2, waiting: 1, failed: 0 });
    const inventory = await memory.walrusInventory(userId);
    expect(inventory.updateBlobs).toBe(2);
    expect(inventory.onlyLocal).toBe(0);
  });
});

describe("decision journal", () => {
  it("writes reasoning to its own namespace and recalls it by meaning", async () => {
    const decision = await prisma.financialDecision.create({
      data: {
        userId, decisionType: "send", objective: "Can I send $300 to my sister today?", requestedAmountMinor: 30000,
        currency: "USD", inputSnapshot: "{}", calculationVersion: "test",
        recommendedAction: JSON.stringify({ headline: "Move $150.00 now, then $150.00", amountMinor: 15000, rationale: "Rent is due in 6 days." }),
        baselineAction: JSON.stringify({ amountMinor: 30000 }), assumptions: "[]", memoryReferences: "[]", predictedOutcome: "{}",
      },
    });
    await prisma.consent.create({ data: { userId, consentType: "decision_journal", granted: true } });
    const entry = await decisions.journalDecision(userId, decision.id);
    const row = await prisma.memoryRecord.findUniqueOrThrow({ where: { id: entry!.id } });
    expect(row.writeStatus).toBe("confirmed");
    expect(row.namespace).toBe(memory.journalNamespace(userId));

    const journal = await memory.recallJournal(userId, "what did you tell me about sending money to my sister");
    expect(journal.mode).toBe("walrus");
    expect(journal.hits[0]).toMatchObject({ question: "Can I send $300 to my sister today?", advice: "Move $150.00 now, then $150.00", source: "walrus" });

    // Journal entries never surface as rules.
    const rules = await memory.recallApplicableMemories(userId, "send money sister rent", { limit: 10 });
    expect(rules.memories.some((m) => m.category === "reasoning")).toBe(false);
  });
});

describe("Total Recall restores the same account from Walrus", () => {
  it("rebuilds lessons, their latest state, and the track record for the same account", async () => {
    // Simulate a lost lesson ledger while preserving the authenticated account identity.
    await prisma.memoryRecord.deleteMany({ where: { userId } });
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await memory.namespaceForUser(fresh.id)).toBe(memory.userNamespace(userId));

    const report = await memory.restoreFromWalrus(fresh.id);
    expect(report.status).toBe("restored");
    expect(report.created).toBe(3); // old limit, new limit, subscription watch — never the draft or the unwritten rule
    expect(report.updatesApplied).toBe(2);
    expect(report.evidenceRestored).toBe(1);

    const restored = await prisma.memoryRecord.findMany({ where: { userId: fresh.id } });
    const byId = new Map(restored.map((r) => [r.id, r]));
    expect(byId.get(ids.oldLimit)?.supersededBy).toBe(ids.newLimit);
    expect(byId.get(ids.watch)?.confidence).toBeCloseTo(0.775, 3);
    expect(byId.has(ids.draft)).toBe(false);
    expect(byId.has(ids.unwritten)).toBe(false);

    // Restored rules act again, and only the current dining limit is active.
    const active = await memory.listActiveRuleMemories(fresh.id, ["SPEND_LIMIT", "SUBSCRIPTION_WATCH"]);
    const dining = active.filter((m) => m.rule?.kind === "SPEND_LIMIT" && m.rule.category === "dining");
    expect(dining).toHaveLength(1);
    expect(dining[0].rule).toMatchObject({ monthlyLimitMinor: 15000 });

    const evidence = await prisma.memoryEvidence.findMany({ where: { userId: fresh.id } });
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ memoryId: ids.watch, verdict: "held", decisionId: ids.decision });

    // Restoring twice changes nothing.
    const again = await memory.restoreFromWalrus(fresh.id);
    expect(again).toMatchObject({ created: 0, evidenceRestored: 0 });
    expect(await prisma.memoryRecord.count({ where: { userId: fresh.id, category: { not: "reasoning" } } })).toBe(3);

    const inventory = await memory.walrusInventory(fresh.id);
    expect(inventory).toMatchObject({ lessonBlobs: 3, journalBlobs: 1, updateBlobs: 2, onlyLocal: 0 });
  });

  it("does not restore lessons into a newly created account with the same email", async () => {
    await prisma.user.delete({ where: { id: userId } });
    const replacement = await prisma.user.create({ data: { email: EMAIL, name: "Maya" } });
    expect(memory.userNamespace(replacement.id)).not.toBe(memory.userNamespace(userId));
    const result = await memory.restoreFromWalrus(replacement.id);
    expect(result).toMatchObject({ status: "restored", created: 0 });
    expect(await prisma.memoryRecord.count({ where: { userId: replacement.id } })).toBe(0);
  });

  it("republishes a confirmed lesson and its updates into the current account namespace", async () => {
    const owner = await prisma.user.findFirstOrThrow();
    const oldNamespace = "landed-legacy-email";
    const old = await client.rememberAndWait("legacy lesson", oldNamespace, { idempotencyKey: "legacy" });
    const row = await prisma.memoryRecord.create({ data: {
      userId: owner.id, category: "preference", summary: "Legacy lesson", lesson: "Legacy lesson",
      structuredRule: JSON.stringify({ kind: "AMOUNT_CAP", capPercentOfSafe: 0.5 }), confidence: 0.7,
      verificationStatus: "user_confirmed", writeStatus: "confirmed", namespace: oldNamespace, walrusBlobId: old.blob_id,
    } });
    await memory.recordLessonUpdate(owner.id, row.id, { kind: "confidence", verdict: "held", decisionId: "legacy-decision", confidenceBefore: 0.6, reason: "Held" });
    // A legacy lesson is not eligible for updates in the new namespace yet.
    expect((await memory.flushLessonUpdates(owner.id)).waiting).toBe(1);
    const result = await memory.writeMemoryToWalrus(owner.id, row.id);
    expect(result.writeStatus).toBe("confirmed");
    expect(result.blobId).not.toBe(old.blob_id);
    expect((await prisma.memoryRecord.findUniqueOrThrow({ where: { id: row.id } })).namespace).toBe(memory.userNamespace(owner.id));
    expect((await memory.flushLessonUpdates(owner.id)).written).toBe(1);
  });

  it("is blocked, not faked, without credentials", async () => {
    const saved = process.env.MEMWAL_PRIVATE_KEY;
    delete process.env.MEMWAL_PRIVATE_KEY;
    try {
      const anyUser = await prisma.user.findFirstOrThrow();
      const report = await memory.restoreFromWalrus(anyUser.id);
      expect(report).toMatchObject({ status: "blocked", created: 0 });
      expect(report.error).toMatch(/not configured/);
      const recall = await memory.recallRuleMemories(anyUser.id, ["SPEND_LIMIT"], "limit");
      expect(recall.recalled).toBe(0);
      expect(recall.memories.every((m) => m.recalledFrom === "local")).toBe(true);
    } finally {
      process.env.MEMWAL_PRIVATE_KEY = saved;
    }
  });
});
