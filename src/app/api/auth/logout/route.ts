import { api } from "@/server/api";
import { destroySession, getSessionUser } from "@/server/auth";

export const POST = api(async () => {
  await destroySession();
  return { ok: true };
});

export const GET = api(async () => {
  const user = await getSessionUser();
  return { user };
});
