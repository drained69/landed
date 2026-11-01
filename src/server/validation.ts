import { z } from "zod";
import { decimalsFor, parseAmountToMinor } from "@/lib/money";
import { ApiError } from "@/server/api";

export const currencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Enter a three-letter currency code");
export const dateSchema = z.string().max(40).refine((value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  // Date-only form fields must not silently roll February 30 into March.
  return !/^\d{4}-\d{2}-\d{2}$/.test(value) || date.toISOString().slice(0, 10) === value;
}, "Enter a valid date");

/** Prisma Int fields are signed 32-bit integers, even when JavaScript accepts more. */
export const MAX_STORED_MINOR = 2_147_483_647;

export function parseApiAmount(input: string | number, currency: string, minimum = 0): number {
  let amount: number;
  try {
    const raw = String(input).trim().replace(/^([$£€¥])\s*/, "");
    const decimals = decimalsFor(currency);
    const decimalPart = decimals ? `(?:[.,]\\d{1,${decimals}})?` : "";
    const simple = new RegExp(`^-?\\d+${decimalPart}$`);
    const groupedUS = new RegExp(`^-?\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,${decimals || 1}})?$`);
    const groupedEU = new RegExp(`^-?\\d{1,3}(?:\\.\\d{3})+,\\d{${decimals || 1}}$`);
    if ((!simple.test(raw) && !groupedUS.test(raw) && !groupedEU.test(raw)) ||
      (decimals === 0 && !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw))) {
      throw new Error("Enter a valid amount in the selected currency");
    }
    // A single comma with fewer digits than the currency precision was
    // previously treated as a thousands separator (e.g. 12,3 became 123).
    if (decimals > 0 && /^-?\d+,\d+$/.test(raw)) {
      const digits = raw.split(",")[1].length;
      if (digits !== decimals && digits !== 3) throw new Error("Use a complete decimal amount or grouped thousands");
    }
    amount = parseAmountToMinor(input, currency);
  } catch (error) {
    throw new ApiError(400, "INVALID_AMOUNT", error instanceof Error ? error.message : "Enter a valid amount");
  }
  if (!Number.isSafeInteger(amount) || amount > MAX_STORED_MINOR || amount < -MAX_STORED_MINOR) {
    throw new ApiError(400, "INVALID_AMOUNT", "This amount exceeds the supported range");
  }
  if (amount < minimum) {
    throw new ApiError(400, "INVALID_AMOUNT", minimum > 0 ? "Amount must be greater than zero" : "Amount cannot be negative");
  }
  return amount;
}

export function parseLimit(value: string | null, fallback: number, maximum: number): number {
  if (value === null) return fallback;
  const limit = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1) {
    throw new ApiError(400, "INVALID_LIMIT", "Limit must be a positive whole number");
  }
  return Math.min(limit, maximum);
}
