import { prisma } from "@/server/db";
import { api, ApiError, parseBody, rateLimit } from "@/server/api";
import { createSession, hashPassword } from "@/server/auth";
import { signupSchema } from "@/lib/types";

export const POST = api(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  rateLimit(`signup:${ip}`, 10, 60_000);
  const body = await parseBody(req, signupSchema);
  const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) throw new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists");
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name.trim(),
      passwordHash: hashPassword(body.password),
      preferredCurrency: body.currency,
      onboardingComplete: false,
      consents: {
        create: [
          { consentType: "community_route_intelligence", granted: false },
          { consentType: "anonymous_research", granted: false },
          { consentType: "product_updates", granted: false },
        ],
      },
    },
  });
  await createSession(user.id);
  await prisma.auditEvent.create({
    data: { userId: user.id, type: "auth.signup", entity: "User", entityId: user.id },
  });
  return { user: { id: user.id, name: user.name, email: user.email }, next: "/onboarding" };
});

export const GET = api(async () => {
  throw new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST");
});
