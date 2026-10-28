import { requireUser } from "@/server/auth";
import { getDashboard } from "@/server/services/financial";
import { getLearningCurve } from "@/server/services/metrics";
import { getSpendWatch } from "@/server/services/spending";
import { DashboardView } from "@/components/DashboardView";

export default async function OverviewPage() {
  const user = await requireUser();
  const [data, curve, watch] = await Promise.all([
    getDashboard(user.id),
    getLearningCurve(user.id),
    getSpendWatch(user.id),
  ]);
  return (
    <DashboardView
      data={data}
      curve={curve}
      spend={{ alerts: watch.alerts.map((a) => ({ key: a.key, title: a.title, memorySummary: a.memory.summary })), recurringMonthlyMinor: watch.recurringMonthlyMinor }}
    />
  );
}
