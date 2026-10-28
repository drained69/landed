import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getSessionUser();
  if (user) redirect("/app");
  const params = await searchParams;
  const mode = params.mode === "signup" ? "signup" : "signin";
  return <AuthForm initialMode={mode} />;
}
