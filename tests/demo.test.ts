import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** The seeded demo is rolled forward in time instead of reseeded, so ids stay stable. */

const DB_NAME = `test-demo-${process.pid}.db`;
const DB_PATH = join(process.cwd(), "prisma", DB_NAME);
const DAY = 86_400_000;

let prisma: typeof import("@/server/db").prisma;
let refreshDemoClock: typeof import("@/server/services/demo").refreshDemoClock;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:./${DB_NAME}`;
  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:./${DB_NAME}` },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/server/db"));
  ({ refreshDemoClock } = await import("@/server/services/demo"));
});

afterAll(async () => {
  await prisma?.$disconnect();
  for (const suffix of ["", "-journal"]) if (existsSync(`${DB_PATH}${suffix}`)) unlinkSync(`${DB_PATH}${suffix}`);
});

describe("demo clock", () => {
  it("shifts every demo date by the time since the anchor and keeps ids", async () => {
    const seededAt = new Date("2026-11-01T09:00:00.000Z");
    const now = new Date(seededAt.getTime() + 3 * DAY);
    const user = await prisma.user.create({ data: { email: "demo@test.landed", name: "Demo", isDemo: true, demoAnchorAt: seededAt } });
    const rent = await prisma.commitment.create({
      data: { userId: user.id, name: "Rent", amountMinor: 145000, currency: "USD", dueDate: new Date(seededAt.getTime() + 11 * DAY) },
    });
    const tx = await prisma.transaction.create({
      data: { userId: user.id, amountMinor: 1800, currency: "USD", direction: "out", timestamp: new Date(seededAt.getTime() - 2 * DAY), createdAt: seededAt },
    });
    const lesson = await prisma.memoryRecord.create({
      data: { userId: user.id, category: "preference", summary: "s", lesson: "l", walrusBlobId: "blob-1", writeStatus: "confirmed", createdAt: new Date(seededAt.getTime() - 8 * DAY), confirmedAt: new Date(seededAt.getTime() - 8 * DAY) },
    });

    expect(await refreshDemoClock(user.id, now)).toEqual({ shiftedMs: 3 * DAY });

    const rentAfter = await prisma.commitment.findUniqueOrThrow({ where: { id: rent.id } });
    expect(rentAfter.dueDate.getTime() - now.getTime()).toBe(11 * DAY); // still "due in 11 days"
    const txAfter = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(now.getTime() - txAfter.timestamp.getTime()).toBe(2 * DAY);
    const lessonAfter = await prisma.memoryRecord.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(now.getTime() - lessonAfter.createdAt.getTime()).toBe(8 * DAY);
    expect(lessonAfter.walrusBlobId).toBe("blob-1");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).demoAnchorAt?.toISOString()).toBe(now.toISOString());

    // Within six hours nothing moves; a second call never double-shifts.
    expect(await refreshDemoClock(user.id, new Date(now.getTime() + 60_000))).toEqual({ shiftedMs: 0 });
  });

  it("never touches real accounts", async () => {
    const real = await prisma.user.create({ data: { email: "real@test.landed", name: "Real", demoAnchorAt: new Date("2026-01-01T00:00:00.000Z") } });
    const bill = await prisma.commitment.create({
      data: { userId: real.id, name: "Rent", amountMinor: 1, currency: "USD", dueDate: new Date("2026-02-01T00:00:00.000Z") },
    });
    expect(await refreshDemoClock(real.id, new Date("2026-06-01T00:00:00.000Z"))).toEqual({ shiftedMs: 0 });
    expect((await prisma.commitment.findUniqueOrThrow({ where: { id: bill.id } })).dueDate.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });
});
