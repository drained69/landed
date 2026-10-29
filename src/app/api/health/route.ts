import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { memoryConfig } from "@/server/services/memory";
import { aiConfig } from "@/server/services/explain";

/**
 * Liveness for the platform healthcheck: the database must answer. Reports
 * which integrations are configured (never their values, never reachability,
 * so it stays fast and safe to call unauthenticated).
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: "ok",
      integrations: {
        walrusMemory: memoryConfig().configured,
        tatum: Boolean(process.env.TATUM_API_KEY?.trim()),
        aiExplanations: aiConfig().configured,
      },
      checkedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
