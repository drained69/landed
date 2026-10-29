import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, parseBody, rateLimit } from "@/server/api";
import { createSession, hashPassword, requireApiUser, verifyPassword } from "@/server/auth";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

/** Change password and sign out every other session. */
export const POST = api(async (req) => {
  const user = await requireApiUser();
  rateLimit(`password:${user.id}`, 5, 60_000);
  if (user.isDemo) throw new ApiError(403, "DEMO_ACCOUNT", "The shared demo account's password cannot be changed.");
  const body = await parseBody(req, schema);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!verifyPassword(body.currentPassword, row.passwordHash)) {
    throw new ApiError(400, "WRONG_PASSWORD", "Your current password is not correct.");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(body.newPassword) } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.auditEvent.create({ data: { userId: user.id, type: "auth.password_changed", entity: "User", entityId: user.id } }),
  ]);
  await createSession(user.id);
  return { ok: true, note: "Password changed. Every other device has been signed out." };
});
