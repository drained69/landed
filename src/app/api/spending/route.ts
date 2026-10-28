import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { getSpendWatch } from "@/server/services/spending";

export const GET = api(async () => {
  const user = await requireApiUser();
  const [watch, baseline] = await Promise.all([
    getSpendWatch(user.id),
    getSpendWatch(user.id, { withMemory: false }),
  ]);
  return { watch, baselineAlerts: baseline.alerts.length };
});
