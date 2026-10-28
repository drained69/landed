import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { OnboardingForm } from "@/components/OnboardingForm";

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardingComplete) redirect("/app");
  return (
    <div className="min-h-dvh">
      <OnboardingForm defaultName={user.name} />
    </div>
  );
}
