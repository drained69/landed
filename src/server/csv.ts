/**
 * Direction of a bank-export row. An explicit direction column wins; otherwise
 * the sign decides, from the account's point of view: negative is money
 * leaving (spending), positive is money arriving.
 */
export function rowDirection(rawAmount: string, declared: string | undefined): "in" | "out" {
  const d = (declared ?? "").trim().toLowerCase();
  if (d === "in" || d === "out") return d;
  if (["debit", "withdrawal", "dr"].includes(d)) return "out";
  if (["credit", "deposit", "cr"].includes(d)) return "in";
  const trimmed = rawAmount.trim();
  const negative = trimmed.startsWith("-") || trimmed.startsWith("(") || /-\s*[\d.,]+$/.test(trimmed.replace(/^[^\d-]+/, ""));
  return negative ? "out" : "in";
}
