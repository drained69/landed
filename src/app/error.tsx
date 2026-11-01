"use client";

import Link from "next/link";
import { Button } from "@/components/ui";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold">We couldn’t load this page</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Please try again. If the problem continues, return to your overview or sign in again.</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        <Button onClick={retry}>Try again</Button>
        <Link href="/app" className="text-sm underline underline-offset-4">Overview</Link>
        <Link href="/login" className="text-sm underline underline-offset-4">Sign in</Link>
      </div>
    </main>
  );
}
