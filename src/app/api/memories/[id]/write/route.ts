import { api, ApiError } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { writeMemoryToWalrus } from "@/server/services/memory";
import { prisma } from "@/server/db";

export const POST = api(async (_req, ctx) => {
  const user = await requireApiUser();
  const { id } = await ctx.params;
  const memory = await prisma.memoryRecord.findFirst({ where: { id, userId: user.id } });
  if (!memory) throw new ApiError(404, "NOT_FOUND", "Memory not found");
  if (memory.verificationStatus === "hypothesis") {
    throw new ApiError(409, "UNCONFIRMED_LESSON", "Confirm or correct this lesson before writing it to Walrus");
  }
  const result = await writeMemoryToWalrus(user.id, id);
  return { result };
});
