import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  if (!user.onboardingComplete) redirect("/onboarding");
  return <AppShell user={{ name: user.name, email: user.email, isDemo: user.isDemo }}>{children}</AppShell>;
}
