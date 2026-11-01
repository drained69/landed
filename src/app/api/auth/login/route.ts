import { prisma } from "@/server/db";
import { api, ApiError, parseBody, rateLimit } from "@/server/api";
import { createSession, verifyPassword } from "@/server/auth";
import { loginSchema } from "@/lib/types";

export const POST = api(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  rateLimit(`login:${ip}`, 15, 60_000);
  const body = await parseBody(req, loginSchema.extend({ password: loginSchema.shape.password.max(200) }));
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }
  if (user.isDemo && process.env.LANDED_DEMO_ENABLED === "false") {
    throw new ApiError(403, "DEMO_DISABLED", "The demo account is disabled on this deployment.");
  }
  await createSession(user.id);
  await prisma.auditEvent.create({
    data: { userId: user.id, type: "auth.login", entity: "User", entityId: user.id },
  });
  return { user: { id: user.id, name: user.name }, next: user.onboardingComplete ? "/app" : "/onboarding" };
});
