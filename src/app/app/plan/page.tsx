import { requireUser } from "@/server/auth";
import { getFinancialContext } from "@/server/services/financial";
import { PlanMove } from "@/components/PlanMove";

export default async function PlanPage() {
  const user = await requireUser();
  const context = await getFinancialContext(user.id);
  return <PlanMove currency={user.preferredCurrency} routeCount={context.routes.filter((route) => route.isActive).length} />;
}
