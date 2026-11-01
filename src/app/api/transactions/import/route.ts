import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { prisma } from "@/server/db";
import { api, ApiError } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { parseApiAmount } from "@/server/validation";
import { rowDirection } from "@/server/csv";

interface CsvRow {
  date?: string;
  Date?: string;
  amount?: string;
  Amount?: string;
  description?: string;
  Description?: string;
  merchant?: string;
  Merchant?: string;
  category?: string;
  Category?: string;
  direction?: string;
  Direction?: string;
  currency?: string;
  Currency?: string;
}

function normalizeDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) {
    const [, a, b, y] = parts;
    const monthFirst = new Date(Number(y), Number(a) - 1, Number(b));
    if (!Number.isNaN(monthFirst.getTime())) return monthFirst;
  }
  return null;
}

function inferCategory(description: string, direction: string): string {
  const d = description.toLowerCase();
  if (direction === "in") {
    if (/salary|payroll|wage|income|deposit|refund/.test(d)) return "income";
    return "other_income";
  }
  if (/rent|landlord/.test(d)) return "housing";
  if (/grocery|supermarket|market|food|restaurant|cafe|coffee/.test(d)) return "food";
  if (/uber|lyft|transit|metro|fuel|gas|transport/.test(d)) return "transport";
  if (/netflix|spotify|subscription|prime|icloud/.test(d)) return "subscriptions";
  if (/electric|water|internet|phone|utility|insurance/.test(d)) return "utilities";
  if (/pharmacy|doctor|health|medical/.test(d)) return "health";
  if (/transfer|sent|remit/.test(d)) return "transfer";
  return "uncategorized";
}

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const accountId = typeof form?.get("accountId") === "string" ? String(form.get("accountId")) : null;
  if (!(file instanceof File)) throw new ApiError(400, "FILE_REQUIRED", "Attach a CSV file");
  if (file.size > 2_000_000) throw new ApiError(413, "FILE_TOO_LARGE", "CSV must be under 2 MB");
  const text = await file.text();
  const fileHash = createHash("sha256").update(text).digest("hex");

  if (accountId) {
    const account = await prisma.financialAccount.findFirst({ where: { id: accountId, userId: user.id } });
    if (!account) throw new ApiError(404, "NOT_FOUND", "Account not found");
  }

  const existingBatch = await prisma.importBatch.findUnique({
    where: { userId_fileHash: { userId: user.id, fileHash } },
  });
  if (existingBatch) {
    throw new ApiError(409, "DUPLICATE_IMPORT", `This exact file was already imported on ${existingBatch.createdAt.toLocaleDateString()}.`);
  }

  const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new ApiError(400, "CSV_PARSE_ERROR", parsed.errors[0].message);
  }
  if (parsed.data.length > 5000) throw new ApiError(400, "TOO_MANY_ROWS", "Import up to 5,000 rows at a time. Split this file into smaller files.");
  const rows = parsed.data;
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const date = normalizeDate(row.date ?? row.Date);
    const rawAmount = row.amount ?? row.Amount;
    const description = (row.description ?? row.Description ?? row.merchant ?? row.Merchant ?? "").trim();
    const currency = (row.currency ?? row.Currency ?? user.preferredCurrency).toUpperCase();
    if (!date || !rawAmount) { skipped += 1; continue; }
    const direction = rowDirection(String(rawAmount), row.direction ?? row.Direction);
    let amountMinor: number;
    try {
      amountMinor = Math.abs(parseApiAmount(rawAmount, currency));
    } catch {
      skipped += 1;
      continue;
    }
    if (amountMinor <= 0) { skipped += 1; continue; }
    const category = (row.category ?? row.Category ?? "").trim() ||
      inferCategory(description, direction);
    const dedupeKey = `csv:${createHash("sha256").update(`${date.toISOString()}|${amountMinor}|${direction}|${description}|${currency}`).digest("hex").slice(0, 32)}`;
    try {
      await prisma.transaction.create({
        data: {
          userId: user.id,
          accountId,
          amountMinor,
          currency,
          direction,
          category: category.toLowerCase().replace(/\s+/g, "_").slice(0, 60),
          merchant: description.slice(0, 120) || null,
          description,
          timestamp: date,
          source: "csv",
          status: "posted",
          verificationStatus: "user_confirmed",
          dedupeKey,
        },
      });
      imported += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      skipped += 1;
    }
  }

  await prisma.importBatch.create({
    data: { userId: user.id, filename: file.name, fileHash, rowCount: rows.length, importedCount: imported, skippedCount: skipped },
  });

  return {
    imported,
    skipped,
    rows: rows.length,
    note: "CSV rows are user-imported, not bank-verified. Duplicate files and duplicate rows are rejected by hash.",
  };
});
