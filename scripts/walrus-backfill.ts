import { prisma } from "../src/server/db";
import { memoryConfig, memoryHealth, userNamespace, writeMemoryToWalrus } from "../src/server/services/memory";

/**
 * Re-attempt Walrus writes for lessons that never reached Mainnet.
 *
 * Confirmed records are always skipped. By default this retries pending,
 * failed, and blocked records, because a blocked record is exactly what you
 * get before credentials are configured.
 *
 * Synthetic demo lessons are NOT written by default: Walrus blobs are public
 * and permanent, so fabricating Mainnet history is opt-in. Pass
 * --include-synthetic only for a demo account you are willing to label publicly.
 *
 * Usage:
 *   pnpm walrus:backfill --dry-run
 *   pnpm walrus:backfill
 *   pnpm walrus:backfill --limit=5 --user=demo@landed.app
 *   pnpm walrus:backfill --include-synthetic
 */

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const includeSynthetic = hasFlag("include-synthetic");
  const email = argValue("user");
  const limit = Math.max(1, Number(argValue("limit") ?? 50));
  const config = memoryConfig();

  console.log("\nLANDED · Walrus Memory backfill\n");
  console.log(`  Mode                 ${dryRun ? "dry run (no writes)" : "write"}`);
  console.log(`  Credentials          ${config.configured ? "configured" : `missing (${config.missing.join(", ")})`}`);
  console.log(`  Synthetic lessons    ${includeSynthetic ? "included (explicit)" : "skipped (opt in with --include-synthetic)"}`);

  if (!dryRun) {
    const health = await memoryHealth();
    if (!config.configured || !health.reachable) {
      console.error(
        `\nCannot write: ${config.configured ? health.error ?? "relayer unreachable" : `missing ${config.missing.join(", ")}`}.`,
      );
      console.error("No record was marked confirmed. Fix credentials, then run this command again.");
      process.exitCode = 1;
      return;
    }
  }

  const users = await prisma.user.findMany({
    where: email ? { email: email.toLowerCase() } : undefined,
    select: { id: true, email: true, isDemo: true },
    orderBy: { createdAt: "asc" },
  });
  if (users.length === 0) {
    console.error(`\nNo user matched${email ? ` ${email}` : ""}.`);
    process.exitCode = 1;
    return;
  }

  let attempted = 0;
  let confirmed = 0;
  let failed = 0;

  for (const user of users) {
    const rows = await prisma.memoryRecord.findMany({
      where: {
        userId: user.id,
        writeStatus: { in: ["pending", "failed", "blocked"] },
        ...(includeSynthetic ? {} : { isSynthetic: false }),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    if (rows.length === 0) continue;

    console.log(`\n${user.email}${user.isDemo ? " (synthetic demo account)" : ""}`);
    console.log(`  namespace ${userNamespace(user.id)}`);

    for (const row of rows) {
      attempted += 1;
      const label = `${row.id} [${row.category}] ${row.writeStatus}`;
      if (dryRun) {
        console.log(`  would retry  ${label} — ${row.summary.slice(0, 90)}`);
        continue;
      }
      const result = await writeMemoryToWalrus(user.id, row.id);
      if (result.writeStatus === "confirmed" && result.blobId) {
        confirmed += 1;
        console.log(`  confirmed    ${label} -> blob ${result.blobId}`);
      } else {
        failed += 1;
        console.log(`  ${result.writeStatus.padEnd(12)} ${label} — ${result.error ?? "no error detail"}`);
      }
    }
  }

  if (attempted === 0) {
    console.log("\nNothing to backfill. Every eligible lesson is already confirmed.");
    if (!includeSynthetic) {
      const skipped = await prisma.memoryRecord.count({ where: { isSynthetic: true, writeStatus: { not: "confirmed" } } });
      if (skipped > 0) {
        console.log(`  ${skipped} synthetic lesson(s) were skipped. Use --include-synthetic only for a demo account.`);
      }
    }
    return;
  }

  console.log(`\nSummary: ${attempted} attempted · ${confirmed} confirmed · ${failed} not confirmed`);
  if (dryRun) console.log("Dry run only. No Walrus write was attempted and no record was changed.");
}

main()
  .catch((error) => {
    console.error("\nBackfill failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
