import { api, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { askLanded } from "@/server/services/ask";
import { z } from "zod";

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, z.object({ message: z.string().min(1).max(1000) }));
  const response = await askLanded(user.id, body.message);
  return response;
});
