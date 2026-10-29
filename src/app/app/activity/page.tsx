import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { listDecisions } from "@/server/services/decisions";
import { ActivityView } from "@/components/ActivityView";

export default async function ActivityPage() {
  const user = await requireUser();
  const [decisions, transactions, movements, accounts] = await Promise.all([
    listDecisions(user.id, 100),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { timestamp: "desc" },
      take: 100,
      include: { account: { select: { name: true } } },
    }),
    prisma.moneyMovement.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { route: { select: { name: true } } },
    }),
    prisma.financialAccount.findMany({ where: { userId: user.id }, select: { id: true, name: true, currency: true }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <ActivityView
      decisions={decisions}
      transactions={transactions}
      movements={movements}
      currency={user.preferredCurrency}
      accounts={accounts}
    />
  );
}
