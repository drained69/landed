import { after } from "next/server";
import { z } from "zod";
import { api, ApiError, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { confirmLesson } from "@/server/services/decisions";
import { excludeMemory, flushLessonUpdates } from "@/server/services/memory";
import { prisma } from "@/server/db";

const feedbackSchema = z.object({
  action: z.enum(["confirm", "reject", "correct"]),
  correction: z.string().max(1000).optional(),
});

export const POST = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const body = await parseBody(req, feedbackSchema);
  return confirmLesson({ userId: user.id, memoryId: id, action: body.action, correction: body.correction });
});

const patchSchema = z.object({
  excluded: z.boolean(),
  reason: z.string().max(300).optional(),
});

export const PATCH = api(async (req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.excluded) {
    const record = await prisma.memoryRecord.findFirst({ where: { id, userId: user.id } });
    if (!record) throw new ApiError(404, "NOT_FOUND", "Memory not found");
  }
  const memory = await excludeMemory(user.id, id, body.excluded, body.reason);
  after(() => flushLessonUpdates(user.id).catch(() => undefined));
  return {
    memory,
    note: body.excluded
      ? "Excluded from future LANDED decisions. This does not delete or revoke the decentralized Walrus blob."
      : "Included in future decisions again.",
  };
});
