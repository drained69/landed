import { z } from "zod";
import { api, parseBody, rateLimit } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { getTransactionEvidence } from "@/server/services/tatum";

const schema = z.object({ digest: z.string().trim().min(32).max(64) });

export const POST = api(async (req) => {
  const user = await requireApiUser();
  rateLimit(`tatum-tx:${user.id}`, 30, 60_000);
  const body = await parseBody(req, schema);
  return { evidence: await getTransactionEvidence(body.digest) };
});
