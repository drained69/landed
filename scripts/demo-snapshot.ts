/** Print the demo account's headline numbers. Used to keep docs and seed in sync. */
import { prisma } from "../src/server/db";
import { getDashboard } from "../src/server/services/financial";
import { getSpendWatch } from "../src/server/services/spending";
import { getLearningCurve } from "../src/server/services/metrics";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "demo@landed.app" } });
  const d = await getDashboard(user.id);
  const cf = d.cashflow;
  const live = await prisma.financialDecision.findFirst({ where: { userId: user.id, status: "advised" }, orderBy: { createdAt: "desc" } });
  const watch = await getSpendWatch(user.id);
  const curve = await getLearningCurve(user.id);
  console.log(JSON.stringify({
    safeToMove: cf.safeToMoveMinor, cleared: cf.clearedLiquidMinor, protected: cf.essentialCommitmentsMinor,
    nearTerm: cf.variableSpendReserveMinor, buffer: cf.effectiveSafetyBufferMinor,
    transactions: await prisma.transaction.count({ where: { userId: user.id } }),
    memories: await prisma.memoryRecord.count({ where: { userId: user.id } }),
    live: live ? { rec: JSON.parse(live.recommendedAction).headline, base: JSON.parse(live.baselineAction).amountMinor } : null,
    curve: { weeks: curve.weeks.map((w) => `${w.label}: ${w.achieved}/${w.outcomes} rules=${w.rulesInForce} +${w.lessonsLearned}`), sinceMiss: curve.summary.sinceMiss },
    spend: { alerts: watch.alerts.map((a) => a.title), proposals: watch.proposals.map((p) => p.title), recurring: watch.recurring.map((r) => `${r.merchant}:${r.status}`), categories: watch.categories.map((c) => `${c.category}:${c.monthToDateMinor}/${c.limitMinor ?? c.usualMonthlyMinor}:${c.status}`) },
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
