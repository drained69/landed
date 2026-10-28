import { api, rateLimit } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { restoreFromWalrus, walrusInventory } from "@/server/services/memory";

export const maxDuration = 120;

/** Total Recall: rebuild this account's lesson ledger from Walrus alone. */
export const POST = api(async () => {
  const user = await requireApiUser();
  rateLimit(`walrus-restore:${user.id}`, 3, 60_000);
  const report = await restoreFromWalrus(user.id);
  const inventory = await walrusInventory(user.id);
  return { report, inventory };
});
