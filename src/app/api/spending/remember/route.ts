import { z } from "zod";
import { api, parseBody, rateLimit } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { rememberSpendRule } from "@/server/services/spending";

const schema = z.object({
  key: z.string().regex(/^(limit|sub):[a-z0-9 ]{1,80}$/),
  amountMinor: z.number().int().positive().max(100_000_000).nullable().optional(),
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  rateLimit(`spend-remember:${user.id}`, 30, 60_000);
  const body = await parseBody(req, schema);
  return rememberSpendRule(user.id, body.key, body.amountMinor);
});
