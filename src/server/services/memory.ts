import { createHash } from "node:crypto";
import { MemWal } from "@mysten-incubation/memwal";
import { prisma, parseJson } from "@/server/db";
import type { MemoryRule, ValidatedMemory } from "@/lib/types";
import {
  formatLessonUpdate, formatMemoryText, latestLessonState, parseJournalText, parseLessonUpdate,
  parsePortableLesson, parseRuleFromMemoryText, type LessonUpdate,
} from "@/server/engine/outcomes";

export interface MemoryConfigStatus {
  configured: boolean;
  accountId: string | null;
  serverUrl: string;
  appPrefix: string;
  missing: string[];
}

export interface MemoryHealth {
  configured: boolean;
  reachable: boolean;
  status: string;
  version: string | null;
  writeReady: boolean | null;
  serverUrl: string;
  error: string | null;
}

export interface MemoryWriteResult {
  memoryId: string;
  writeStatus: string;
  blobId: string | null;
  jobId: string | null;
  error: string | null;
  confirmedAt: string | null;
}

export interface MemoryRetrieval {
  mode: "walrus" | "local_rehearsal" | "mixed";
  query: string;
  memories: ValidatedMemory[];
  recalledCount: number;
  error: string | null;
  health: MemoryHealth | null;
}

let cachedClient: MemWal | null = null;
let cachedKey = "";

export function memoryConfig(): MemoryConfigStatus {
  const key = process.env.MEMWAL_PRIVATE_KEY?.trim() ?? "";
  const accountId = process.env.MEMWAL_ACCOUNT_ID?.trim() ?? "";
  const serverUrl = process.env.MEMWAL_SERVER_URL?.trim() || "https://relayer.memory.walrus.xyz";
  const missing: string[] = [];
  if (!key) missing.push("MEMWAL_PRIVATE_KEY");
  if (!accountId) missing.push("MEMWAL_ACCOUNT_ID");
  return {
    configured: missing.length === 0,
    accountId: accountId || null,
    serverUrl,
    appPrefix: process.env.MEMWAL_APP_PREFIX?.trim() || "landed",
    missing,
  };
}

function getClient(): MemWal {
  const config = memoryConfig();
  if (!config.configured) throw new Error(`Walrus Memory is not configured (${config.missing.join(", ")} missing).`);
  const key = process.env.MEMWAL_PRIVATE_KEY!.trim();
  const cacheKey = `${key.slice(0, 8)}:${config.accountId}:${config.serverUrl}`;
  if (!cachedClient || cachedKey !== cacheKey) {
    cachedClient?.destroy();
    cachedClient = MemWal.create({
      key,
      accountId: config.accountId!,
      serverUrl: config.serverUrl,
      requestTimeoutMs: 30_000,
      recallTimeoutMs: 20_000,
    });
    cachedKey = cacheKey;
  }
  return cachedClient;
}

/**
 * Namespace is derived server-side from the account's sign-in email (normalized
 * and hashed), never from a request. Using the email rather than the database
 * row id keeps memory portable: a fresh install or a new device recalls the
 * same Walrus memories for the same person. It is an organization boundary;
 * LANDED's database ownership checks remain the authorization boundary (a
 * delegate key can read every namespace).
 */
export function userNamespace(accountEmail: string): string {
  const prefix = memoryConfig().appPrefix.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "landed";
  const opaque = createHash("sha256").update(`landed:email:${accountEmail.trim().toLowerCase()}`).digest("hex").slice(0, 24);
  return `${prefix}-${opaque}`;
}

/** Decision journal entries live beside lessons, never mixed into rule recall. */
export function journalNamespace(accountEmail: string): string {
  return `${userNamespace(accountEmail)}-journal`;
}

/** Append-only lesson state changes (confidence, superseded, excluded). */
export function updatesNamespace(accountEmail: string): string {
  return `${userNamespace(accountEmail)}-updates`;
}

export async function namespaceForUser(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  return userNamespace(user.email);
}

export async function memoryHealth(): Promise<MemoryHealth> {
  const config = memoryConfig();
  if (!config.configured) {
    return {
      configured: false,
      reachable: false,
      status: "not_configured",
      version: null,
      writeReady: null,
      serverUrl: config.serverUrl,
      error: `Missing server credentials: ${config.missing.join(", ")}`,
    };
  }
  try {
    const client = getClient();
    const health = await client.health();
    return {
      configured: true,
      reachable: true,
      status: health.status ?? "unknown",
      version: health.version ?? null,
      writeReady: health.write_ready ?? null,
      serverUrl: config.serverUrl,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      status: "unreachable",
      version: null,
      writeReady: null,
      serverUrl: config.serverUrl,
      error: error instanceof Error ? error.message : "Unknown relayer error",
    };
  }
}

function toValidated(record: {
  id: string; walrusBlobId: string | null; category: string; summary: string; lesson: string;
  confidence: number; verificationStatus: string; writeStatus: string; source: string;
  createdAt: Date; structuredRule: string | null; excluded: boolean; supersededBy: string | null;
}, distance?: number, textRule?: MemoryRule | null): ValidatedMemory {
  const storedRule = parseJson<MemoryRule | null>(record.structuredRule, null);
  return {
    id: record.id,
    blobId: record.walrusBlobId,
    category: record.category,
    summary: record.summary,
    lesson: record.lesson,
    confidence: record.confidence,
    verificationStatus: record.verificationStatus,
    writeStatus: record.writeStatus,
    source: record.source,
    createdAt: record.createdAt.toISOString(),
    rule: storedRule ?? textRule ?? null,
    distance,
    excluded: record.excluded,
    supersededBy: record.supersededBy,
  };
}

/** Write a memory and wait for the relayer to confirm the Walrus blob. */
export async function writeMemoryToWalrus(userId: string, memoryId: string): Promise<MemoryWriteResult> {
  const record = await prisma.memoryRecord.findFirst({ where: { id: memoryId, userId } });
  if (!record) throw new Error("Memory not found");
  if (record.writeStatus === "confirmed" && record.walrusBlobId) {
    return {
      memoryId, writeStatus: "confirmed", blobId: record.walrusBlobId,
      jobId: record.jobId, error: null, confirmedAt: record.confirmedAt?.toISOString() ?? null,
    };
  }

  if (record.verificationStatus !== "user_confirmed" && record.verificationStatus !== "verified") {
    // Drafts and rejected lessons never leave the local ledger.
    return { memoryId, writeStatus: record.writeStatus, blobId: null, jobId: null, error: "Only confirmed lessons are written to Walrus.", confirmedAt: null };
  }

  const config = memoryConfig();
  if (!config.configured) {
    const message = `Walrus Memory not configured: ${config.missing.join(", ")} missing. The lesson stays in the local rehearsal store and is not claimed as a Mainnet write.`;
    await prisma.memoryRecord.update({
      where: { id: record.id },
      data: { writeStatus: "blocked", writeError: message, source: "local_rehearsal" },
    });
    return { memoryId, writeStatus: "blocked", blobId: null, jobId: null, error: message, confirmedAt: null };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  // Journal entries carry their own text and live in a separate namespace so
  // they can never be recalled as a rule.
  const isJournal = record.category === "reasoning";
  const namespace = isJournal ? journalNamespace(user.email) : userNamespace(user.email);
  await prisma.memoryRecord.update({
    where: { id: record.id },
    data: { writeStatus: "writing", writeError: null, namespace },
  });

  const text = isJournal
    ? record.lesson
    : formatMemoryText({
        memoryId: record.id,
        category: record.category,
        summary: record.summary,
        lesson: record.lesson,
        rule: parseJson(record.structuredRule, null),
        confidence: record.confidence,
        conditions: parseJson(record.conditions, null),
        decisionId: record.decisionId ?? "none",
        createdAt: record.createdAt.toISOString(),
        status: record.supersededBy ? "superseded" : record.excluded ? "excluded" : "active",
        supersededBy: record.supersededBy,
      });

  try {
    const client = getClient();
    const result = await client.rememberAndWait(text, namespace, {
      idempotencyKey: `landed-${record.id}`,
      timeoutMs: 120_000,
      pollIntervalMs: 1_500,
    });
    const updated = await prisma.memoryRecord.update({
      where: { id: record.id },
      data: {
        writeStatus: "confirmed",
        writeError: null,
        walrusBlobId: result.blob_id,
        jobId: result.job_id ?? result.id,
        walrusOwner: result.owner,
        namespace: result.namespace,
        source: "walrus",
        confirmedAt: new Date(),
      },
    });
    await prisma.auditEvent.create({
      data: {
        userId,
        type: "memory.walrus.confirmed",
        entity: "MemoryRecord",
        entityId: record.id,
        payload: JSON.stringify({ blobId: result.blob_id, jobId: result.job_id ?? result.id, owner: result.owner }),
      },
    });
    return {
      memoryId: updated.id,
      writeStatus: updated.writeStatus,
      blobId: updated.walrusBlobId,
      jobId: updated.jobId,
      error: null,
      confirmedAt: updated.confirmedAt?.toISOString() ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Walrus Memory write failure";
    await prisma.memoryRecord.update({
      where: { id: record.id },
      data: { writeStatus: "failed", writeError: message, source: "local_rehearsal" },
    });
    return { memoryId, writeStatus: "failed", blobId: null, jobId: null, error: message, confirmedAt: null };
  }
}

function parseTextMetadata(text: string): { memoryId: string | null; rule: MemoryRule | null } {
  const idMatch = text.match(/LANDED lesson \[([^\]]+)\]/);
  return {
    memoryId: idMatch?.[1] ?? null,
    rule: parseRuleFromMemoryText(text) as MemoryRule | null,
  };
}

/**
 * Walrus recall is primary. Typed rules are rehydrated from the sealed database
 * record (authoritative) or parsed from the portable Walrus text. If credentials
 * are missing, local rehearsal lessons are returned with an explicit mode.
 */
export async function recallApplicableMemories(
  userId: string,
  query: string,
  options: { limit?: number; cutoff?: Date; asOf?: Date } = {},
): Promise<MemoryRetrieval> {
  const limit = options.limit ?? 6;
  const cutoff = options.cutoff ?? options.asOf ?? new Date();
  const config = memoryConfig();
  const localRows = await prisma.memoryRecord.findMany({
    where: {
      userId,
      excluded: false,
      supersededBy: null,
      category: { not: "reasoning" },
      verificationStatus: { in: ["verified", "user_confirmed"] },
      createdAt: { lte: cutoff },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (!config.configured) {
    const selected = pickLocalMatches(localRows, query, limit);
    return {
      mode: "local_rehearsal",
      query,
      memories: selected.map((r) => toValidated(r)),
      recalledCount: selected.length,
      error: `Walrus Memory is not configured (${config.missing.join(", ")}). Lessons are coming from the local rehearsal ledger, not Mainnet.`,
      health: null,
    };
  }

  const health = await memoryHealth();
  if (!health.reachable) {
    const selected = pickLocalMatches(localRows, query, limit);
    return {
      mode: "local_rehearsal",
      query,
      memories: selected.map((r) => toValidated(r)),
      recalledCount: selected.length,
      error: `Walrus recall unavailable: ${health.error ?? "relayer unreachable"}. Using locally confirmed records only.`,
      health,
    };
  }

  try {
    const client = getClient();
    const result = await client.recall({
      query,
      namespace: await namespaceForUser(userId),
      limit: Math.max(limit * 3, 12),
      maxDistance: 1.2,
      timeoutMs: 20_000,
    });
    const byBlob = new Map(localRows.filter((r) => r.walrusBlobId).map((r) => [r.walrusBlobId!, r]));
    const memories: ValidatedMemory[] = [];
    let usedLocal = false;

    for (const hit of result.results) {
      const row = byBlob.get(hit.blob_id);
      if (row) {
        if (row.excluded || row.supersededBy) continue;
        if (row.createdAt > cutoff) continue;
        memories.push(toValidated(row, hit.distance));
      } else {
        const meta = parseTextMetadata(hit.text);
        if (meta.memoryId) {
          const dbRow = await prisma.memoryRecord.findFirst({ where: { id: meta.memoryId, userId } });
          if (dbRow) {
            if (dbRow.excluded || dbRow.supersededBy || dbRow.createdAt > cutoff) continue;
            memories.push(toValidated(dbRow, hit.distance, meta.rule));
            continue;
          }
        }
        // Data restored from Walrus but not present locally: still useful text, no trusted rule.
        memories.push({
          id: meta.memoryId ?? `walrus-${hit.blob_id.slice(0, 12)}`,
          blobId: hit.blob_id,
          category: "outcome",
          summary: hit.text.split("\n").find((l) => l.startsWith("summary:"))?.replace("summary:", "").trim() ?? "Recalled Walrus memory",
          lesson: hit.text,
          confidence: 0.5,
          verificationStatus: "hypothesis",
          writeStatus: "confirmed",
          source: "walrus",
          createdAt: hit.created_at ?? new Date().toISOString(),
          rule: meta.rule,
          distance: hit.distance,
        });
      }
      if (memories.length >= limit) break;
    }

    if (memories.length === 0) {
      usedLocal = true;
      const selected = pickLocalMatches(localRows, query, limit);
      return {
        mode: "mixed",
        query,
        memories: selected.map((r) => toValidated(r)),
        recalledCount: result.results.length,
        error: result.results.length === 0
          ? "Walrus returned no relevant memories; local confirmed lesson records are shown. This is a fallback, not a semantic recall hit."
          : "Walrus hits were excluded by supersession, ownership, or cutoff rules.",
        health,
      };
    }

    return {
      mode: usedLocal ? "mixed" : "walrus",
      query,
      memories,
      recalledCount: result.results.length,
      error: null,
      health,
    };
  } catch (error) {
    const selected = pickLocalMatches(localRows, query, limit);
    return {
      mode: "local_rehearsal",
      query,
      memories: selected.map((r) => toValidated(r)),
      recalledCount: 0,
      error: `Walrus recall failed: ${error instanceof Error ? error.message : "unknown error"}. Local records are shown; no Mainnet recall is claimed.`,
      health,
    };
  }
}

function pickLocalMatches<T extends {
  summary: string; lesson: string; category: string; confidence: number; structuredRule: string | null;
  createdAt: Date; excluded: boolean; supersededBy: string | null; verificationStatus: string;
}>(rows: T[], query: string, limit: number): T[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const scored = rows
    .filter((r) => !r.excluded && !r.supersededBy && r.verificationStatus !== "rejected")
    .map((r) => {
      const haystack = `${r.summary} ${r.lesson} ${r.category}`.toLowerCase();
      const overlap = tokens.reduce((n, t) => n + (haystack.includes(t) ? 1 : 0), 0);
      const rule = parseJson<MemoryRule | null>(r.structuredRule, null);
      const routeBonus = rule?.kind === "ROUTE_PENALTY" || rule?.kind === "PAYOUT_DEDUCTION" ? 1 : 0;
      return { row: r, score: overlap * 2 + routeBonus + r.confidence + (r.createdAt.getTime() / 1e13) };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.row);
}

export async function listMemories(userId: string) {
  return prisma.memoryRecord.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      decision: { select: { id: true, objective: true, decisionType: true, status: true } },
      evidence: {
        orderBy: { createdAt: "asc" },
        select: { id: true, verdict: true, reason: true, confidenceBefore: true, confidenceAfter: true, decisionId: true, createdAt: true },
      },
    },
  });
}

export async function verifyMemoryLedger(userId: string) {
  const [records, health, inventory] = await Promise.all([
    listMemories(userId),
    memoryHealth(),
    walrusInventory(userId),
  ]);
  const confirmed = records.filter((r) => r.writeStatus === "confirmed" && r.walrusBlobId);
  const blocked = records.filter((r) => r.writeStatus === "blocked");
  const failed = records.filter((r) => r.writeStatus === "failed");
  const pending = records.filter((r) => r.writeStatus === "pending" || r.writeStatus === "writing");
  return {
    health,
    inventory,
    namespace: await namespaceForUser(userId),
    counts: {
      total: records.length,
      confirmed: confirmed.length,
      blocked: blocked.length,
      failed: failed.length,
      pending: pending.length,
      localRehearsal: records.filter((r) => r.source === "local_rehearsal").length,
      journal: records.filter((r) => r.category === "reasoning").length,
    },
    records: records.map((r) => ({
      id: r.id,
      category: r.category,
      summary: r.summary,
      writeStatus: r.writeStatus,
      blobId: r.walrusBlobId,
      jobId: r.jobId,
      decisionId: r.decisionId,
      decisionObjective: r.decision?.objective ?? null,
      createdAt: r.createdAt,
      confirmedAt: r.confirmedAt,
      error: r.writeError,
      source: r.source,
      isSynthetic: r.isSynthetic,
      confidence: r.confidence,
      verificationStatus: r.verificationStatus,
    })),
    note: confirmed.length === 0
      ? "No Mainnet memories are confirmed yet. Local rehearsal lessons are never counted as Walrus writes."
      : `${confirmed.length} memory write${confirmed.length === 1 ? "" : "s"} confirmed with a returned Walrus blob ID.`,
  };
}

export async function excludeMemory(userId: string, memoryId: string, excluded: boolean, reason?: string) {
  const record = await prisma.memoryRecord.findFirst({ where: { id: memoryId, userId } });
  if (!record) throw new Error("Memory not found");
  const updated = await prisma.memoryRecord.update({
    where: { id: record.id },
    data: {
      excluded,
      exclusionReason: excluded ? reason ?? "Excluded by user from future decisions" : null,
    },
  });
  await recordLessonUpdate(userId, record.id, {
    kind: excluded ? "excluded" : "included",
    reason: excluded ? reason ?? "Excluded by user from future decisions" : "Included in decisions again",
  });
  return updated;
}

export async function supersedeMemory(userId: string, oldId: string, newId: string, reason: string) {
  const old = await prisma.memoryRecord.findFirst({ where: { id: oldId, userId } });
  if (!old) throw new Error("Memory not found");
  const updated = await prisma.memoryRecord.update({
    where: { id: old.id },
    data: {
      supersededBy: newId,
      writeStatus: old.writeStatus === "confirmed" ? "superseded" : old.writeStatus,
      exclusionReason: reason,
    },
  });
  await recordLessonUpdate(userId, old.id, { kind: "superseded", supersededBy: newId, reason });
  return updated;
}

/**
 * Record a change to a lesson's state as an append-only update. The current
 * row state (after the change) is captured, so replaying the newest update
 * reproduces it exactly. Written to Walrus by flushLessonUpdates.
 */
export async function recordLessonUpdate(
  userId: string,
  memoryId: string,
  change: {
    kind: LessonUpdate["kind"];
    reason: string;
    supersededBy?: string | null;
    verdict?: string | null;
    decisionId?: string | null;
    confidenceBefore?: number | null;
  },
) {
  const memory = await prisma.memoryRecord.findFirst({ where: { id: memoryId, userId } });
  if (!memory) throw new Error("Memory not found");
  return prisma.memoryUpdate.create({
    data: {
      userId,
      memoryId,
      kind: change.kind,
      confidence: memory.confidence,
      confidenceBefore: change.confidenceBefore ?? null,
      supersededBy: change.supersededBy ?? memory.supersededBy,
      excluded: memory.excluded,
      verdict: change.verdict ?? null,
      decisionId: change.decisionId ?? null,
      reason: change.reason.slice(0, 500),
    },
  });
}

export interface FlushReport {
  written: number;
  /** Updates whose lesson is not on Walrus yet; they are written once it is. */
  waiting: number;
  blocked: number;
  failed: number;
}

/**
 * Write pending lesson updates to `<namespace>-updates`, oldest first, so the
 * lesson's track record survives a restore. Updates to a lesson that is not on
 * Walrus yet wait for it. Safe to call from after() or a script.
 */
export async function flushLessonUpdates(userId: string, limit = 25): Promise<FlushReport> {
  const report: FlushReport = { written: 0, waiting: 0, blocked: 0, failed: 0 };
  const pending = await prisma.memoryUpdate.findMany({
    where: { userId, writeStatus: { in: ["pending", "blocked", "failed"] } },
    include: { memory: { select: { writeStatus: true, walrusBlobId: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return report;

  const config = memoryConfig();
  const onWalrus = (u: (typeof pending)[number]) =>
    Boolean(u.memory.walrusBlobId) && (u.memory.writeStatus === "confirmed" || u.memory.writeStatus === "superseded");
  report.waiting = pending.filter((u) => !onWalrus(u)).length;
  const toWrite = pending.filter(onWalrus).slice(0, limit);
  if (toWrite.length === 0) return report;

  if (!config.configured) {
    await prisma.memoryUpdate.updateMany({
      where: { id: { in: toWrite.map((u) => u.id) } },
      data: { writeStatus: "blocked", writeError: `Walrus Memory not configured: ${config.missing.join(", ")} missing.` },
    });
    report.blocked = toWrite.length;
    return report;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const namespace = updatesNamespace(user.email);
  const client = getClient();
  for (const u of toWrite) {
    try {
      await prisma.memoryUpdate.update({ where: { id: u.id }, data: { writeStatus: "writing", writeError: null } });
      const result = await client.rememberAndWait(
        formatLessonUpdate({
          memoryId: u.memoryId,
          updateId: u.id,
          createdAt: u.createdAt.toISOString(),
          kind: u.kind as LessonUpdate["kind"],
          confidence: u.confidence,
          confidenceBefore: u.confidenceBefore,
          supersededBy: u.supersededBy,
          excluded: u.excluded,
          verdict: u.verdict,
          decisionId: u.decisionId,
          reason: u.reason,
        }),
        namespace,
        { idempotencyKey: `landed-update-${u.id}`, timeoutMs: 120_000, pollIntervalMs: 1_500 },
      );
      await prisma.memoryUpdate.update({
        where: { id: u.id },
        data: { writeStatus: "confirmed", walrusBlobId: result.blob_id, confirmedAt: new Date() },
      });
      report.written += 1;
    } catch (error) {
      await prisma.memoryUpdate.update({
        where: { id: u.id },
        data: { writeStatus: "failed", writeError: error instanceof Error ? error.message : "Walrus write failed" },
      });
      report.failed += 1;
    }
  }
  return report;
}

/**
 * Confirmed typed rules of the given kinds, straight from the authoritative
 * database rows. Used by features (Spend Watch) that need every active rule of
 * a kind rather than the top semantic matches for a query.
 */
export async function listActiveRuleMemories(
  userId: string,
  kinds: MemoryRule["kind"][],
  cutoff: Date = new Date(),
): Promise<ValidatedMemory[]> {
  const rows = await prisma.memoryRecord.findMany({
    where: {
      userId,
      excluded: false,
      supersededBy: null,
      verificationStatus: { in: ["verified", "user_confirmed"] },
      structuredRule: { not: null },
      category: { not: "reasoning" },
      createdAt: { lte: cutoff },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows
    .map((r) => toValidated(r))
    .filter((m) => m.rule && kinds.includes(m.rule.kind));
}

export interface RuleRecall {
  memories: ValidatedMemory[];
  mode: "walrus" | "mixed" | "local_rehearsal";
  /** Active rules of the requested kinds. */
  total: number;
  /** How many of them this request actually recalled from Walrus. */
  recalled: number;
  error: string | null;
}

/**
 * Every active rule of the given kinds, each labelled by whether this request
 * recalled it from Walrus. Walrus recall is attempted first; the database row
 * stays authoritative for the typed rule. A rule Walrus did not return (not
 * written yet, or missed by recall) is still applied, but labelled "local" and
 * counted, so recall coverage is visible instead of assumed.
 */
export async function recallRuleMemories(
  userId: string,
  kinds: MemoryRule["kind"][],
  query: string,
  cutoff: Date = new Date(),
): Promise<RuleRecall> {
  const active = await listActiveRuleMemories(userId, kinds, cutoff);
  const local = (error: string | null): RuleRecall => ({
    memories: active.map((m) => ({ ...m, recalledFrom: "local" })),
    mode: "local_rehearsal",
    total: active.length,
    recalled: 0,
    error,
  });
  const config = memoryConfig();
  if (!config.configured) return local(`Walrus Memory is not configured (${config.missing.join(", ")}). Rules come from the local ledger.`);
  if (active.length === 0) return { memories: [], mode: "walrus", total: 0, recalled: 0, error: null };
  try {
    const result = await getClient().recall({
      query,
      namespace: await namespaceForUser(userId),
      limit: Math.max(20, active.length * 3),
      maxDistance: 1.5,
      timeoutMs: 20_000,
    });
    const hits = new Map(result.results.map((hit) => [hit.blob_id, hit.distance]));
    const memories = active.map((m): ValidatedMemory => (
      m.blobId && hits.has(m.blobId)
        ? { ...m, recalledFrom: "walrus", distance: hits.get(m.blobId) }
        : { ...m, recalledFrom: "local" }
    ));
    const recalled = memories.filter((m) => m.recalledFrom === "walrus").length;
    return {
      memories,
      mode: recalled === active.length ? "walrus" : recalled > 0 ? "mixed" : "local_rehearsal",
      total: active.length,
      recalled,
      error: recalled < active.length ? `${active.length - recalled} rule(s) were not returned by Walrus recall and come from the local ledger.` : null,
    };
  } catch (error) {
    return local(`Walrus recall failed: ${error instanceof Error ? error.message : "unknown error"}. Rules come from the local ledger.`);
  }
}

// ── Total Recall: inventory and restore from Walrus alone ──────────────────

export interface WalrusInventory {
  configured: boolean;
  namespace: string;
  journalNamespace: string;
  updatesNamespace: string;
  lessonBlobs: number;
  journalBlobs: number;
  updateBlobs: number;
  /** Confirmed local rows whose blob the relayer also lists. */
  matched: number;
  /** Blobs on Walrus with no local row: recoverable with restoreFromWalrus. */
  onlyOnWalrus: number;
  /** Rows marked confirmed locally that the relayer does not list. */
  onlyLocal: number;
  truncated: boolean;
  error: string | null;
}

/**
 * Count what is actually stored for this user, straight from the relayer's
 * inventory (`listMemories`) rather than from LANDED's own database. This is
 * the independent check that a "confirmed" count is real.
 */
export async function walrusInventory(userId: string): Promise<WalrusInventory> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const ns = userNamespace(user.email);
  const jns = journalNamespace(user.email);
  const uns = updatesNamespace(user.email);
  const base = {
    namespace: ns, journalNamespace: jns, updatesNamespace: uns,
    lessonBlobs: 0, journalBlobs: 0, updateBlobs: 0, matched: 0, onlyOnWalrus: 0, onlyLocal: 0, truncated: false,
  };
  const config = memoryConfig();
  if (!config.configured) {
    return { ...base, configured: false, error: `Walrus Memory is not configured (${config.missing.join(", ")}).` };
  }
  try {
    const client = getClient();
    const blobs = new Set<string>();
    let lessonBlobs = 0;
    let journalBlobs = 0;
    let updateBlobs = 0;
    let cursor: string | undefined;
    let pages = 0;
    let more = true;
    while (more && pages < 20) {
      const page = await client.listMemories({ cursor, limit: 500 });
      for (const m of page.memories) {
        if (m.namespace_id === ns) { lessonBlobs += 1; blobs.add(m.blob_id); }
        else if (m.namespace_id === jns) { journalBlobs += 1; blobs.add(m.blob_id); }
        else if (m.namespace_id === uns) { updateBlobs += 1; blobs.add(m.blob_id); }
      }
      cursor = page.next_cursor ?? undefined;
      more = page.has_more;
      pages += 1;
    }
    const [confirmed, confirmedUpdates] = await Promise.all([
      prisma.memoryRecord.findMany({
        where: { userId, writeStatus: { in: ["confirmed", "superseded"] }, walrusBlobId: { not: null } },
        select: { walrusBlobId: true },
      }),
      prisma.memoryUpdate.findMany({ where: { userId, writeStatus: "confirmed", walrusBlobId: { not: null } }, select: { walrusBlobId: true } }),
    ]);
    const local = new Set([...confirmed, ...confirmedUpdates].map((r) => r.walrusBlobId!));
    const matched = [...local].filter((b) => blobs.has(b)).length;
    return {
      ...base,
      configured: true,
      lessonBlobs,
      journalBlobs,
      updateBlobs,
      matched,
      onlyOnWalrus: [...blobs].filter((b) => !local.has(b)).length,
      onlyLocal: local.size - matched,
      truncated: more,
      error: null,
    };
  } catch (error) {
    return { ...base, configured: true, error: error instanceof Error ? error.message : "Walrus inventory failed" };
  }
}

export interface RestoreReport {
  status: "restored" | "blocked" | "failed";
  relayer: { restored: number; skipped: number; failed: number; total: number } | null;
  recalled: number;
  created: number;
  relinked: number;
  alreadyLocal: number;
  /** Lesson state changes replayed from <namespace>-updates. */
  updatesApplied: number;
  /** Track-record verdicts rebuilt from updates. */
  evidenceRestored: number;
  error: string | null;
}

const RESTORE_QUERIES = [
  "LANDED lesson rule",
  "spending limit approved subscription price",
  "route fee delivery recipient amount",
  "rent buffer salary income transfer shortfall",
  "preference savings goal",
];

/**
 * Rebuild this user's lesson ledger from Walrus alone. The relayer first
 * re-indexes any blobs it is missing (`restore`), then LANDED recalls its own
 * portable lesson texts and recreates the rows it does not have. Rules are
 * re-parsed from the text, so a recovered lesson changes advice again.
 */
export async function restoreFromWalrus(userId: string): Promise<RestoreReport> {
  const empty = { relayer: null, recalled: 0, created: 0, relinked: 0, alreadyLocal: 0, updatesApplied: 0, evidenceRestored: 0 };
  const config = memoryConfig();
  if (!config.configured) {
    return { ...empty, status: "blocked", error: `Walrus Memory is not configured (${config.missing.join(", ")}). Nothing can be restored.` };
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const ns = userNamespace(user.email);
  try {
    const client = getClient();
    const relayer = await client.restore(ns, 50);
    const hits = new Map<string, { text: string; createdAt?: string }>();
    for (const query of RESTORE_QUERIES) {
      const result = await client.recall({ query, namespace: ns, limit: 50, maxDistance: 2, timeoutMs: 20_000 });
      for (const hit of result.results) hits.set(hit.blob_id, { text: hit.text, createdAt: hit.created_at });
    }

    let created = 0;
    let relinked = 0;
    let alreadyLocal = 0;
    // If an original id was taken, restored rows get new ids; updates still name the original.
    const idMap = new Map<string, string>();
    for (const [blobId, hit] of hits) {
      const parsed = parsePortableLesson(hit.text);
      if (!parsed) continue;
      const byBlob = await prisma.memoryRecord.findFirst({ where: { userId, walrusBlobId: blobId } });
      if (byBlob) { alreadyLocal += 1; continue; }
      const byId = await prisma.memoryRecord.findFirst({ where: { userId, id: parsed.memoryId } });
      if (byId) {
        await prisma.memoryRecord.update({
          where: { id: byId.id },
          data: { walrusBlobId: blobId, writeStatus: byId.supersededBy ? "superseded" : "confirmed", source: "walrus", writeError: null, namespace: ns },
        });
        relinked += 1;
        continue;
      }
      const idTaken = await prisma.memoryRecord.findUnique({ where: { id: parsed.memoryId }, select: { id: true } });
      const decision = parsed.decisionId
        ? await prisma.financialDecision.findFirst({ where: { id: parsed.decisionId, userId }, select: { id: true } })
        : null;
      const createdAt = parsed.createdAt ? new Date(parsed.createdAt) : hit.createdAt ? new Date(hit.createdAt) : new Date();
      const restored = await prisma.memoryRecord.create({
        data: {
          ...(idTaken ? {} : { id: parsed.memoryId }),
          userId,
          decisionId: decision?.id ?? null,
          category: parsed.category,
          summary: parsed.summary || "Recovered Walrus lesson",
          lesson: parsed.lesson,
          structuredRule: parsed.rule ? JSON.stringify(parsed.rule) : null,
          conditions: parsed.conditions ? JSON.stringify(parsed.conditions) : null,
          evidenceRefs: JSON.stringify({ restoredFrom: blobId }),
          confidence: parsed.confidence ?? 0.5,
          evidenceQuality: "user_confirmed",
          // LANDED only ever writes lessons the user confirmed.
          verificationStatus: "user_confirmed",
          namespace: ns,
          walrusBlobId: blobId,
          writeStatus: parsed.status === "superseded" ? "superseded" : "confirmed",
          supersededBy: parsed.supersededBy,
          excluded: parsed.status === "excluded",
          source: "walrus",
          isSynthetic: user.isDemo,
          createdAt,
          confirmedAt: createdAt,
        },
      });
      if (restored.id !== parsed.memoryId) idMap.set(parsed.memoryId, restored.id);
      created += 1;
    }

    const { updatesApplied, evidenceRestored } = await replayLessonUpdates(userId, user.email, idMap);

    await prisma.auditEvent.create({
      data: {
        userId,
        type: "memory.walrus.restored",
        entity: "User",
        entityId: userId,
        payload: JSON.stringify({ relayer, recalled: hits.size, created, relinked, alreadyLocal, updatesApplied, evidenceRestored }),
      },
    });
    return {
      status: "restored",
      relayer: { restored: relayer.restored, skipped: relayer.skipped, failed: relayer.failed, total: relayer.total },
      recalled: hits.size,
      created,
      relinked,
      alreadyLocal,
      updatesApplied,
      evidenceRestored,
      error: null,
    };
  } catch (error) {
    return { ...empty, status: "failed", error: error instanceof Error ? error.message : "Walrus restore failed" };
  }
}

/**
 * Replay `<namespace>-updates` onto the local ledger: the newest update per
 * lesson sets its confidence, supersession and exclusion, and every decisive
 * verdict becomes a MemoryEvidence row again, so the track record survives.
 */
async function replayLessonUpdates(userId: string, email: string, idMap: Map<string, string>) {
  const client = getClient();
  const namespace = updatesNamespace(email);
  await client.restore(namespace, 50);
  const result = await client.recall({
    query: "LANDED lesson update confidence superseded excluded verdict",
    namespace,
    limit: 200,
    maxDistance: 2,
    timeoutMs: 20_000,
  });

  const byLesson = new Map<string, { update: LessonUpdate; blobId: string }[]>();
  for (const hit of result.results) {
    const update = parseLessonUpdate(hit.text);
    if (!update) continue;
    const localId = idMap.get(update.memoryId) ?? update.memoryId;
    byLesson.set(localId, [...(byLesson.get(localId) ?? []), { update, blobId: hit.blob_id }]);
  }

  let updatesApplied = 0;
  let evidenceRestored = 0;
  for (const [memoryId, entries] of byLesson) {
    const memory = await prisma.memoryRecord.findFirst({ where: { id: memoryId, userId } });
    if (!memory) continue;
    const state = latestLessonState(entries.map((e) => e.update));
    if (state) {
      const supersededBy = state.supersededBy ? idMap.get(state.supersededBy) ?? state.supersededBy : null;
      await prisma.memoryRecord.update({
        where: { id: memory.id },
        data: {
          confidence: state.confidence,
          supersededBy,
          excluded: state.excluded,
          writeStatus: supersededBy && memory.writeStatus === "confirmed" ? "superseded" : memory.writeStatus,
        },
      });
      updatesApplied += 1;
    }
    for (const { update, blobId } of entries) {
      const known = await prisma.memoryUpdate.findFirst({ where: { userId, walrusBlobId: blobId } });
      if (!known) {
        await prisma.memoryUpdate.create({
          data: {
            userId, memoryId: memory.id, kind: update.kind, confidence: update.confidence,
            confidenceBefore: update.confidenceBefore, supersededBy: update.supersededBy, excluded: update.excluded,
            verdict: update.verdict, decisionId: update.decisionId, reason: update.reason,
            walrusBlobId: blobId, writeStatus: "confirmed", createdAt: new Date(update.createdAt), confirmedAt: new Date(update.createdAt),
          },
        });
      }
      if (update.kind !== "confidence" || !update.decisionId || (update.verdict !== "held" && update.verdict !== "contradicted")) continue;
      const exists = await prisma.memoryEvidence.findUnique({
        where: { memoryId_decisionId: { memoryId: memory.id, decisionId: update.decisionId } },
      });
      if (exists) continue;
      await prisma.memoryEvidence.create({
        data: {
          userId, memoryId: memory.id, decisionId: update.decisionId, verdict: update.verdict, reason: update.reason,
          confidenceBefore: update.confidenceBefore ?? update.confidence, confidenceAfter: update.confidence,
          createdAt: new Date(update.createdAt),
        },
      });
      evidenceRestored += 1;
    }
  }
  return { updatesApplied, evidenceRestored };
}

// ── Decision journal: the reasoning behind each piece of advice ────────────

export interface JournalHit {
  decisionId: string;
  createdAt: string | null;
  question: string;
  advice: string;
  because: string;
  blobId: string | null;
  source: "walrus" | "local_rehearsal";
}

/** Recall past advice by meaning from the journal namespace, or locally without credentials. */
export async function recallJournal(userId: string, query: string, limit = 4): Promise<{ hits: JournalHit[]; mode: "walrus" | "local_rehearsal"; error: string | null }> {
  const config = memoryConfig();
  const local = async (error: string | null) => {
    const rows = await prisma.memoryRecord.findMany({
      where: { userId, category: "reasoning", excluded: false },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return {
      mode: "local_rehearsal" as const,
      error,
      hits: rows.flatMap((r) => {
        const parsed = parseJournalText(r.lesson);
        return parsed ? [{ ...parsed, blobId: r.walrusBlobId, source: "local_rehearsal" as const }] : [];
      }),
    };
  };
  if (!config.configured) return local("Walrus Memory is not configured; showing the local journal.");
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const result = await getClient().recall({ query, namespace: journalNamespace(user.email), limit, timeoutMs: 20_000 });
    const hits = result.results.flatMap((hit) => {
      const parsed = parseJournalText(hit.text);
      return parsed ? [{ ...parsed, blobId: hit.blob_id, source: "walrus" as const }] : [];
    });
    if (hits.length === 0) return local("Walrus returned no journal entries for that question; showing the local journal.");
    return { hits, mode: "walrus", error: null };
  } catch (error) {
    return local(`Walrus journal recall failed: ${error instanceof Error ? error.message : "unknown error"}.`);
  }
}
