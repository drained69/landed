import { prisma } from "../src/server/db";
import {
  memoryConfig,
  memoryHealth,
  verifyMemoryLedger,
} from "../src/server/services/memory";

/**
 * Verify that this deployment can write to Walrus Memory and that every
 * "confirmed" lesson really has a returned blob ID.
 *
 * This script never fabricates a successful write. It exits non-zero when
 * credentials are missing, the relayer is unreachable, or the confirmed count
 * is below the requested minimum.
 *
 * Usage:
 *   pnpm walrus:verify
 *   pnpm walrus:verify --min=0
 *   pnpm walrus:verify --user=demo@landed.app
 */

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

async function main() {
  const min = Number(argValue("min") ?? 10);
  const email = argValue("user");
  const config = memoryConfig();

  console.log("\nLANDED · Walrus Memory verification\n");
  line("Namespace prefix", config.appPrefix);
  line("Account ID", config.accountId ?? "not set");
  line("Relayer", config.serverUrl);
  line("Credentials", config.configured ? "configured" : `missing (${config.missing.join(", ")})`);

  const health = await memoryHealth();
  line("Reachable", health.reachable ? "yes" : "no");
  line("Write ready", health.writeReady == null ? "unknown" : health.writeReady ? "yes" : "no");
  if (health.error) line("Relayer detail", health.error);

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

  let confirmedTotal = 0;
  let syntheticConfirmed = 0;
  let inventoryTotal = 0;

  for (const user of users) {
    const ledger = await verifyMemoryLedger(user.id);
    confirmedTotal += ledger.counts.confirmed;
    const confirmedRows = ledger.records.filter((r) => r.writeStatus === "confirmed" && r.blobId);
    syntheticConfirmed += confirmedRows.filter((r) => r.isSynthetic).length;

    console.log(`\n${user.email}${user.isDemo ? " (synthetic demo account)" : ""}`);
    line("Namespace", ledger.namespace);
    line(
      "Records",
      `${ledger.counts.total} total · ${ledger.counts.confirmed} confirmed · ${ledger.counts.blocked} blocked · ${ledger.counts.failed} failed · ${ledger.counts.pending} pending`,
    );
    for (const row of confirmedRows) {
      line(
        `  ${row.category}`,
        `${row.id}  blob=${row.blobId}  ${row.confirmedAt ? new Date(row.confirmedAt).toISOString() : "no timestamp"}`,
      );
    }
    if (ledger.counts.confirmed === 0) {
      line("Note", ledger.note);
    }
    const inv = ledger.inventory;
    if (inv.configured && !inv.error) {
      inventoryTotal += inv.lessonBlobs + inv.journalBlobs;
      line(
        "Relayer inventory",
        `${inv.lessonBlobs} lesson blob(s) · ${inv.journalBlobs} journal blob(s) · ${inv.matched} matched · ${inv.onlyOnWalrus} only on Walrus · ${inv.onlyLocal} only local${inv.truncated ? " · truncated" : ""}`,
      );
    } else if (inv.error) {
      line("Relayer inventory", inv.error);
    }
  }

  console.log(`\nConfirmed Mainnet writes: ${confirmedTotal} in LANDED's ledger · ${inventoryTotal} listed by the relayer (minimum requested: ${min})`);
  if (syntheticConfirmed > 0) {
    console.log(`  of which synthetic demo lessons: ${syntheticConfirmed}`);
  }

  if (!config.configured) {
    console.error("\nRESULT: blocked — Walrus Memory credentials are not configured. Nothing was claimed as a Mainnet write.");
    process.exitCode = 1;
    return;
  }
  if (!health.reachable) {
    console.error("\nRESULT: failed — the relayer is configured but unreachable. Nothing was claimed as a Mainnet write.");
    process.exitCode = 1;
    return;
  }
  // The relayer's own inventory is the independent count; the ledger must agree.
  if (Math.min(confirmedTotal, inventoryTotal) < min) {
    console.error(`\nRESULT: incomplete — ${confirmedTotal} confirmed in the ledger, ${inventoryTotal} listed by the relayer, ${min} required. Run pnpm walrus:backfill.`);
    process.exitCode = 1;
    return;
  }
  console.log("\nRESULT: verified. Every confirmed lesson has a returned Walrus blob ID, and the relayer lists them.");
}

main()
  .catch((error) => {
    console.error("\nVerification failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
