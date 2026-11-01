import { after } from "next/server";
import { api, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { askLanded } from "@/server/services/ask";
import { journalDecision } from "@/server/services/decisions";
import { z } from "zod";

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, z.object({ message: z.string().trim().min(1).max(1000) }));
  const response = await askLanded(user.id, body.message);
  const decisionId = response.decision?.decision.id;
  if (decisionId) after(() => journalDecision(user.id, decisionId));
  return response;
});
