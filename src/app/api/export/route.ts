import { prisma } from "@/server/db";
import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";

export const GET = api(async () => {
  const user = await requireApiUser();
  const [userRow, accounts, transactions, commitments, goals, routes, decisions, movements, outcomes, memories, consents, observations] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { id: true, email: true, name: true, preferredCurrency: true, safetyBufferMinor: true, riskPosture: true, mainObjective: true, createdAt: true } }),
    prisma.financialAccount.findMany({ where: { userId: user.id } }),
    prisma.transaction.findMany({ where: { userId: user.id } }),
    prisma.commitment.findMany({ where: { userId: user.id } }),
    prisma.savingsGoal.findMany({ where: { userId: user.id } }),
    prisma.paymentRoute.findMany({ where: { userId: user.id }, include: { quotes: true } }),
    prisma.financialDecision.findMany({ where: { userId: user.id } }),
    prisma.moneyMovement.findMany({ where: { userId: user.id } }),
    prisma.decisionOutcome.findMany({ where: { decision: { userId: user.id } } }),
    prisma.memoryRecord.findMany({ where: { userId: user.id } }),
    prisma.consent.findMany({ where: { userId: user.id } }),
    prisma.routeObservation.findMany({ where: { userId: user.id } }),
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    note: "This export contains user-entered and confirmed records. Walrus blobs already written cannot be deleted by this application.",
    user: userRow,
    accounts, transactions, commitments, goals, routes, decisions, movements, outcomes, memories, consents, observations,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="landed-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
