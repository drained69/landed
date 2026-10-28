import { z } from "zod";
import { api, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { getConsents, setConsent } from "@/server/services/community";

const schema = z.object({
  consentType: z.enum(["community_route_intelligence", "anonymous_research", "product_updates", "decision_journal"]),
  granted: z.boolean(),
});

export const GET = api(async () => {
  const user = await requireApiUser();
  return { consents: await getConsents(user.id) };
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, schema);
  const consent = await setConsent(user.id, body.consentType, body.granted);
  return {
    consent,
    note: body.consentType === "community_route_intelligence"
      ? "Only consented, compatible route outcomes are aggregated. Your identity and individual transactions are never shared. Revoking stops future aggregation; it does not retract previously aggregated statistics."
      : body.consentType === "decision_journal"
        ? body.granted
          ? "Decision journal on. Each new piece of advice — the question, the answer and why — is written to its own Walrus namespace. It is recallable later but never acts as a rule."
          : "Decision journal off. No new entries are written; existing Walrus blobs are not deleted."
        : "Consent updated.",
  };
});
