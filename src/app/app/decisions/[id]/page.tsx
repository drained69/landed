import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getDecision } from "@/server/services/decisions";
import { DecisionDetail } from "@/components/DecisionDetail";

export default async function DecisionPage({ params }: PageProps<"/app/decisions/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const decision = await getDecision(user.id, id);
  if (!decision) notFound();
  return <DecisionDetail decision={decision} />;
}
