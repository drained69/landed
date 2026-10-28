import { IntegrationUnavailableError } from "@/server/errors";

/**
 * Tatum Data API exchange rates (`/v4/data/rate/symbol`).
 *
 * LANDED never invents an exchange rate. This is the one sourced path: a rate
 * is only used when Tatum returns it, and every converted value carries the
 * rate, its upstream source and timestamp so the UI can show where it came from.
 */

export interface SourcedRate {
  symbol: string;
  basePair: string;
  /** Decimal string exactly as returned; never parsed into a float for money math. */
  value: string;
  source: string;
  timestamp: string;
  fetchedVia: "tatum-data-api";
}

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; rate: SourcedRate }>();

function dataApiUrl(): string {
  return process.env.TATUM_DATA_API_URL?.trim() || "https://api.tatum.io";
}

function apiKey(): string {
  const key = process.env.TATUM_API_KEY?.trim();
  if (!key) {
    throw new IntegrationUnavailableError(
      "TATUM_NOT_CONFIGURED",
      "Tatum is not configured. Set TATUM_API_KEY to enable sourced exchange rates. LANDED will not invent a rate.",
    );
  }
  return key;
}

interface RateResponse {
  value: string;
  basePair: string;
  timestamp: number;
  source: string;
  symbol: string;
  batchId?: string;
}

function normalize(raw: RateResponse): SourcedRate {
  if (!/^\d+(\.\d+)?$/.test(String(raw.value))) throw new Error(`Tatum returned an unusable rate for ${raw.symbol}`);
  return {
    symbol: raw.symbol.toUpperCase(),
    basePair: raw.basePair.toUpperCase(),
    value: String(raw.value),
    source: raw.source,
    timestamp: new Date(raw.timestamp).toISOString(),
    fetchedVia: "tatum-data-api",
  };
}

/** Current rates for several symbols in one call. Missing symbols are omitted, never guessed. */
export async function getRates(symbols: string[], basePair = "USD"): Promise<Map<string, SourcedRate>> {
  const base = basePair.toUpperCase();
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))].filter((s) => /^[A-Z0-9]{2,12}$/.test(s) && s !== base);
  const result = new Map<string, SourcedRate>();
  const missing: string[] = [];
  for (const symbol of wanted) {
    const hit = cache.get(`${symbol}/${base}`);
    if (hit && Date.now() - hit.at < CACHE_MS) result.set(symbol, hit.rate);
    else missing.push(symbol);
  }
  if (missing.length === 0) return result;

  const response = await fetch(`${dataApiUrl()}/v4/data/rate/symbol/batch`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify(missing.map((symbol, i) => ({ batchId: String(i), symbol, basePair: base }))),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Tatum Data API rate request failed: HTTP ${response.status}${text ? ` — ${text.slice(0, 200)}` : ""}`);
  }
  const rows = (await response.json()) as RateResponse[];
  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      const rate = normalize(row);
      cache.set(`${rate.symbol}/${base}`, { at: Date.now(), rate });
      result.set(rate.symbol, rate);
    } catch {
      // A symbol Tatum cannot price stays unpriced.
    }
  }
  return result;
}

/**
 * Convert an integer amount in `fromDecimals` base units to integer minor
 * units (cents) of the rate's base pair. BigInt end to end; no float money.
 */
export function convertToMinor(amountBaseUnits: bigint, fromDecimals: number, rate: SourcedRate, toDecimals = 2): number {
  const [whole, fraction = ""] = rate.value.split(".");
  const rateScale = fraction.length;
  const rateInt = BigInt(`${whole}${fraction}` || "0");
  // amount / 10^fromDecimals * rateInt / 10^rateScale * 10^toDecimals, rounded half up.
  const numerator = amountBaseUnits * rateInt * 10n ** BigInt(toDecimals);
  const denominator = 10n ** BigInt(fromDecimals + rateScale);
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs + denominator / 2n) / denominator;
  const value = Number(negative ? -rounded : rounded);
  if (!Number.isSafeInteger(value)) throw new Error("Converted amount is too large");
  return value;
}

export interface RatesHealth {
  configured: boolean;
  reachable: boolean;
  sample: SourcedRate | null;
  error: string | null;
}

export async function ratesHealth(): Promise<RatesHealth> {
  if (!process.env.TATUM_API_KEY?.trim()) {
    return { configured: false, reachable: false, sample: null, error: "TATUM_API_KEY is not set. Crypto balances are shown in their own units only." };
  }
  try {
    const rates = await getRates(["SUI"], "USD");
    return { configured: true, reachable: true, sample: rates.get("SUI") ?? null, error: rates.has("SUI") ? null : "Tatum returned no SUI/USD rate." };
  } catch (error) {
    return { configured: true, reachable: false, sample: null, error: error instanceof Error ? error.message : "Unknown Tatum Data API error" };
  }
}
