import { prisma } from "@/server/db";

/**
 * Keep the synthetic demo current without reseeding it.
 *
 * The demo is seeded once so its lesson ids stay stable (a reseed would mint
 * new ids, and a later Walrus backfill would write undeletable duplicates).
 * But its story is relative to "now": rent due in eleven days, salary last
 * week. This shifts every demo date forward by the time since the anchor, so
 * the scenario reads the same on any day. Ids and Walrus blob ids are untouched.
 *
 * Decision input snapshots (JSON) keep their original asOf: they are an audit
 * record, and replay only compares them with themselves.
 */
const MIN_SHIFT_MS = 6 * 60 * 60 * 1000;

const later = (date: Date | null, ms: number) => (date ? new Date(date.getTime() + ms) : date);

export async function refreshDemoClock(userId: string, now = new Date()): Promise<{ shiftedMs: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isDemo: true, demoAnchorAt: true } });
  if (!user?.isDemo || !user.demoAnchorAt) return { shiftedMs: 0 };
  const ms = now.getTime() - user.demoAnchorAt.getTime();
  if (ms < MIN_SHIFT_MS) return { shiftedMs: 0 };

  await prisma.$transaction(async (tx) => {
    // Claim the shift first so two concurrent demo sign-ins cannot both apply it.
    const claimed = await tx.user.updateMany({
      where: { id: userId, demoAnchorAt: user.demoAnchorAt },
      data: { demoAnchorAt: now },
    });
    if (claimed.count === 0) return;

    for (const r of await tx.transaction.findMany({ where: { userId }, select: { id: true, timestamp: true, createdAt: true } })) {
      await tx.transaction.update({ where: { id: r.id }, data: { timestamp: later(r.timestamp, ms)!, createdAt: later(r.createdAt, ms)! } });
    }
    for (const r of await tx.commitment.findMany({ where: { userId }, select: { id: true, dueDate: true, createdAt: true } })) {
      await tx.commitment.update({ where: { id: r.id }, data: { dueDate: later(r.dueDate, ms)!, createdAt: later(r.createdAt, ms)! } });
    }
    for (const r of await tx.savingsGoal.findMany({ where: { userId }, select: { id: true, targetDate: true, createdAt: true } })) {
      await tx.savingsGoal.update({ where: { id: r.id }, data: { targetDate: later(r.targetDate, ms), createdAt: later(r.createdAt, ms)! } });
    }
    for (const r of await tx.routeQuote.findMany({ where: { route: { userId } }, select: { id: true, quotedAt: true, expiresAt: true, createdAt: true } })) {
      await tx.routeQuote.update({ where: { id: r.id }, data: { quotedAt: later(r.quotedAt, ms)!, expiresAt: later(r.expiresAt, ms), createdAt: later(r.createdAt, ms)! } });
    }
    for (const r of await tx.financialDecision.findMany({ where: { userId }, select: { id: true, asOf: true, followedAt: true, createdAt: true } })) {
      await tx.financialDecision.update({ where: { id: r.id }, data: { asOf: later(r.asOf, ms)!, followedAt: later(r.followedAt, ms), createdAt: later(r.createdAt, ms)! } });
    }
    for (const r of await tx.moneyMovement.findMany({ where: { userId }, select: { id: true, completedAt: true, createdAt: true } })) {
      await tx.moneyMovement.update({ where: { id: r.id }, data: { completedAt: later(r.completedAt, ms), createdAt: later(r.createdAt, ms)! } });
    }
    for (const r of await tx.decisionOutcome.findMany({ where: { decision: { userId } }, select: { id: true, evaluatedAt: true, createdAt: true } })) {
      await tx.decisionOutcome.update({ where: { id: r.id }, data: { evaluatedAt: later(r.evaluatedAt, ms)!, createdAt: later(r.createdAt, ms)! } });
    }
    for (const r of await tx.memoryRecord.findMany({ where: { userId }, select: { id: true, createdAt: true, confirmedAt: true } })) {
      await tx.memoryRecord.update({ where: { id: r.id }, data: { createdAt: later(r.createdAt, ms)!, confirmedAt: later(r.confirmedAt, ms) } });
    }
    for (const r of await tx.memoryEvidence.findMany({ where: { userId }, select: { id: true, createdAt: true } })) {
      await tx.memoryEvidence.update({ where: { id: r.id }, data: { createdAt: later(r.createdAt, ms)! } });
    }
    for (const r of await tx.memoryUpdate.findMany({ where: { userId }, select: { id: true, createdAt: true, confirmedAt: true } })) {
      await tx.memoryUpdate.update({ where: { id: r.id }, data: { createdAt: later(r.createdAt, ms)!, confirmedAt: later(r.confirmedAt, ms) } });
    }
    for (const r of await tx.routeObservation.findMany({ where: { userId }, select: { id: true, createdAt: true } })) {
      await tx.routeObservation.update({ where: { id: r.id }, data: { createdAt: later(r.createdAt, ms)! } });
    }
  }, { timeout: 30_000 });
  return { shiftedMs: ms };
}
