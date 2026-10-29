import { api } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { tatumHealth } from "@/server/services/tatum";
import { memoryConfig, memoryHealth } from "@/server/services/memory";
import { ratesHealth } from "@/server/services/rates";
import { aiConfig } from "@/server/services/explain";

export const GET = api(async () => {
  await requireApiUser();
  const [tatum, walrus, rates] = await Promise.all([tatumHealth(), memoryHealth(), ratesHealth()]);
  return {
    tatum,
    rates,
    walrus: {
      ...walrus,
      accountId: memoryConfig().accountId,
      missing: memoryConfig().missing,
    },
    ai: {
      configured: aiConfig().configured,
      note: "Optional. LANDED's arithmetic, ranking, and memory rules never depend on the AI layer.",
    },
    checkedAt: new Date().toISOString(),
  };
});
