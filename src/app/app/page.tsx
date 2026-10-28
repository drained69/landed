import { requireUser } from "@/server/auth";
import { getDashboard } from "@/server/services/financial";
import { DashboardView } from "@/components/DashboardView";

export default async function OverviewPage() {
  const user = await requireUser();
  const data = await getDashboard(user.id);
  return <DashboardView data={data} />;
}
