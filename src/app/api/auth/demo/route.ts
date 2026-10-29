import { prisma } from "@/server/db";
import { api, ApiError, rateLimit } from "@/server/api";
import { createSession } from "@/server/auth";
import { refreshDemoClock } from "@/server/services/demo";

export const POST = api(async (req) => {
  if (process.env.LANDED_DEMO_ENABLED === "false") {
    throw new ApiError(403, "DEMO_DISABLED", "The demo account is disabled on this deployment.");
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  rateLimit(`demo:${ip}`, 20, 60_000);
  const demo = await prisma.user.findUnique({ where: { email: "demo@landed.app" } });
  if (!demo) {
    throw new ApiError(503, "DEMO_NOT_SEEDED", "The demo dataset is not seeded. Run `pnpm db:seed` first.");
  }
  // A long-running deployment keeps the demo's story current without reseeding.
  await refreshDemoClock(demo.id);
  await createSession(demo.id);
  await prisma.auditEvent.create({
    data: { userId: demo.id, type: "auth.demo", entity: "User", entityId: demo.id },
  });
  return { user: { id: demo.id, name: demo.name }, next: "/app" };
});
