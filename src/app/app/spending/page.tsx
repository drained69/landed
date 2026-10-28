import { requireUser } from "@/server/auth";
import { getSpendWatch } from "@/server/services/spending";
import { SpendWatchView } from "@/components/SpendWatchView";

export default async function SpendingPage() {
  const user = await requireUser();
  const [watch, baseline] = await Promise.all([
    getSpendWatch(user.id),
    getSpendWatch(user.id, { withMemory: false }),
  ]);
  return <SpendWatchView watch={watch} baselineAlerts={baseline.alerts.length} isDemo={user.isDemo} />;
}
