/** Financial primitives. All money is integer minor units (cents). */
import type { CurrencyCode } from "./types";

export const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2, EUR: 2, GBP: 2, PHP: 2, MXN: 2, INR: 2, NGN: 2, KES: 2,
  JPY: 0, KRW: 0, VND: 0,
};

export function decimalsFor(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return ["USD", "EUR", "GBP", "PHP", "MXN", "INR", "NGN", "KES", "JPY", "KRW", "VND"].includes(value);
}

/** Parse a human-entered amount into minor units without floating point. */
export function parseAmountToMinor(input: string | number, currency = "USD"): number {
  const decimals = decimalsFor(currency);
  const raw = String(input).trim().replace(/[^0-9.,-]/g, "");
  if (!raw) throw new Error("Enter an amount");
  const negative = raw.startsWith("-");
  let normalized = raw.replace(/-/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimalsAfterComma = normalized.length - lastComma - 1;
    normalized = decimalsAfterComma === decimals
      ? normalized.replace(",", ".")
      : normalized.replace(/,/g, "");
  }
  const [whole = "0", fraction = ""] = normalized.split(".");
  const wholeSafe = whole.replace(/\D/g, "") || "0";
  const fractionSafe = fraction.replace(/\D/g, "").padEnd(decimals, "0").slice(0, decimals);
  const value = Number(wholeSafe) * 10 ** decimals + Number(fractionSafe || "0");
  if (!Number.isSafeInteger(value)) throw new Error("Amount is too large");
  return negative ? -value : value;
}

/** Number of major units, for display only. */
export function minorToMajor(minor: number, currency = "USD"): number {
  return minor / 10 ** decimalsFor(currency);
}

export function majorToMinor(major: number, currency = "USD"): number {
  return Math.round(major * 10 ** decimalsFor(currency));
}

export function formatMinor(
  minor: number,
  currency = "USD",
  options: { sign?: boolean; locale?: string; compact?: boolean; maximumFractionDigits?: number } = {},
): string {
  const { sign = false, locale = "en-US", compact = false } = options;
  const value = minorToMajor(minor, currency);
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: compact ? 0 : decimalsFor(currency),
    maximumFractionDigits: options.maximumFractionDigits ?? (compact ? 1 : decimalsFor(currency)),
    notation: compact ? "compact" : "standard",
  }).format(Math.abs(value));
  if (sign && value !== 0) return `${value > 0 ? "+" : "−"}${formatted}`;
  return value < 0 ? `−${formatted}` : formatted;
}

export function formatAmount(minor: number, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimalsFor(currency),
    maximumFractionDigits: decimalsFor(currency),
  }).format(minorToMajor(minor, currency));
}

export function roundMinorTo(minor: number, stepMajor: number, currency = "USD"): number {
  const step = majorToMinor(stepMajor, currency);
  if (step <= 0) return minor;
  return Math.floor(minor / step) * step;
}

export function subtractFloor(a: number, b: number): number {
  return Math.max(0, a - b);
}

export function percentage(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/** Safe multiplication of a rate string into minor units. */
export function applyRate(amountMinor: number, rate: string): number {
  const parsed = Number(rate);
  if (!Number.isFinite(parsed) || parsed <= 0) return amountMinor;
  return Math.round(amountMinor * parsed);
}

export function formatRate(rate: string, from: string, to: string): string {
  const n = Number(rate);
  if (!Number.isFinite(n)) return `1 ${from} = — ${to}`;
  return `1 ${from} = ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(n)} ${to}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}
