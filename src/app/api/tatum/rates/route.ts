import { api, ApiError, rateLimit } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import { getRates } from "@/server/services/rates";

export const GET = api(async (req) => {
  const user = await requireApiUser();
  rateLimit(`tatum-rates:${user.id}`, 60, 60_000);
  const params = req.nextUrl.searchParams;
  const symbols = (params.get("symbols") ?? "SUI").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const base = (params.get("base") ?? user.preferredCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) throw new ApiError(400, "INVALID_BASE", "Base must be a 3-letter currency code");
  const rates = await getRates(symbols, base);
  return { base, rates: [...rates.values()] };
});
