import { z } from "zod";
import { prisma } from "@/server/db";
import { api, ApiError, parseBody, rateLimit } from "@/server/api";
import { destroySession, requireApiUser, verifyPassword } from "@/server/auth";

const schema = z.object({
  confirmEmail: z.string().max(320),
  password: z.string().min(1).max(200),
});

/**
 * Permanently delete the account and every record LANDED holds for it.
 * Walrus blobs already written are encrypted, scoped to this account's
 * namespace, and cannot be deleted by any application; the response says so.
 */
export const DELETE = api(async (req) => {
  const user = await requireApiUser();
  rateLimit(`delete-account:${user.id}`, 3, 60_000);
  if (user.isDemo) throw new ApiError(403, "DEMO_ACCOUNT", "The shared demo account cannot be deleted.");
  const body = await parseBody(req, schema);
  if (body.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new ApiError(400, "CONFIRMATION_MISMATCH", "Type your account email exactly to confirm.");
  }
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!verifyPassword(body.password, row.passwordHash)) {
    throw new ApiError(400, "WRONG_PASSWORD", "Your password is not correct.");
  }
  const confirmedOnWalrus = await prisma.memoryRecord.count({ where: { userId: user.id, walrusBlobId: { not: null } } });
  // Cascades remove accounts, transactions, decisions, outcomes, memories, sessions and consents.
  await prisma.user.delete({ where: { id: user.id } });
  await destroySession();
  return {
    ok: true,
    walrusBlobs: confirmedOnWalrus,
    note: confirmedOnWalrus > 0
      ? `Your account and all of its records are deleted. ${confirmedOnWalrus} memory blob(s) already written to Walrus stay encrypted on Walrus; they are not readable without this deployment's delegate key and are no longer linked to any account here.`
      : "Your account and all of its records are deleted.",
  };
});
