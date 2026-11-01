import { currencySchema } from "@/server/validation";
import { z } from "zod";
import { api, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { parseApiAmount } from "@/server/validation";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  currency: currencySchema.optional(),
  safetyBuffer: z.union([z.string(), z.number()]).optional(),
  riskPosture: z.enum(["cautious", "balanced", "flexible"]).optional(),
  mainObjective: z.string().max(200).optional().nullable(),
});

export const PATCH = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, schema);
  const currency = body.currency ?? user.preferredCurrency;
  const safetyBufferMinor = body.safetyBuffer !== undefined
    ? parseApiAmount(body.safetyBuffer, currency)
    : undefined;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.currency !== undefined ? { preferredCurrency: body.currency } : {}),
      ...(safetyBufferMinor !== undefined ? { safetyBufferMinor } : {}),
      ...(body.riskPosture !== undefined ? { riskPosture: body.riskPosture } : {}),
      ...(body.mainObjective !== undefined ? { mainObjective: body.mainObjective } : {}),
    },
    select: {
      id: true, name: true, email: true, preferredCurrency: true, safetyBufferMinor: true,
      riskPosture: true, mainObjective: true, isDemo: true, locale: true,
    },
  });
  return { user: updated };
});

export const GET = api(async () => {
  const user = await requireApiUser();
  return { user };
});
