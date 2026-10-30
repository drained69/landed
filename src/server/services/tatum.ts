import { prisma } from "@/server/db";
import { fetchWithRateLimitRetry, IntegrationUnavailableError } from "@/server/errors";
import { convertToMinor, getRates, type SourcedRate } from "./rates";

export { IntegrationUnavailableError };

const KNOWN_COINS: Record<string, { symbol: string; decimals: number; name: string }> = {
  "0x2::sui::SUI": { symbol: "SUI", decimals: 9, name: "Sui" },
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN": { symbol: "USDC", decimals: 6, name: "USD Coin" },
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN": { symbol: "USDT", decimals: 6, name: "Tether USD" },
};

function rpcUrl(): string {
  const base = (process.env.TATUM_SUI_RPC_URL?.trim() || "https://sui-mainnet.gateway.tatum.io").replace(/\/+$/, "");
  // Sui retired JSON-RPC; Tatum serves Sui over GraphQL at /graphql on the same gateway.
  return base.endsWith("/graphql") ? base : `${base}/graphql`;
}

/** GraphQL returns zero-padded addresses (0x000…0002::sui::SUI); LANDED keys coins by the short form. */
export function normalizeCoinType(coinType: string): string {
  return coinType.replace(/^0x0*([0-9a-fA-F]+)::/, (_, hex: string) => `0x${hex.toLowerCase()}::`);
}

function apiKey(): string {
  const key = process.env.TATUM_API_KEY?.trim();
  if (!key) {
    throw new IntegrationUnavailableError(
      "TATUM_NOT_CONFIGURED",
      "Tatum is not configured. Set TATUM_API_KEY on the server to enable verified Sui reads. LANDED does not substitute a public RPC and label it Tatum.",
    );
  }
  return key;
}

async function gql<T>(label: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetchWithRateLimitRetry(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Tatum Sui ${label} failed: HTTP ${response.status}${text ? ` — ${text.slice(0, 300)}` : ""}`);
  }
  const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Tatum Sui ${label}: ${json.errors.map((e) => e.message).join("; ")}`);
  if (!json.data) throw new Error(`Tatum Sui ${label}: empty result`);
  return json.data;
}

const TX_FIELDS = `digest sender { address }
  effects {
    status timestamp executionError { message }
    gasEffects { gasSummary { computationCost storageCost storageRebate } }
    balanceChanges(first: 50) { nodes { owner { address } coinType { repr } amount } }
  }`;

interface GqlTransaction {
  digest: string;
  sender: { address: string } | null;
  effects: {
    status: "SUCCESS" | "FAILURE" | null;
    timestamp: string | null;
    executionError: { message: string } | null;
    gasEffects: { gasSummary: { computationCost: number | string; storageCost: number | string; storageRebate: number | string } | null } | null;
    balanceChanges: { nodes: { owner: { address: string } | null; coinType: { repr: string }; amount: string }[] } | null;
  } | null;
}

/** Map a GraphQL transaction onto the shape the rest of this module normalizes. */
function fromGql(tx: GqlTransaction): SuiTransactionBlock & { transaction?: { data?: { sender?: string } } } {
  const gas = tx.effects?.gasEffects?.gasSummary;
  return {
    digest: tx.digest,
    timestampMs: tx.effects?.timestamp ? String(Date.parse(tx.effects.timestamp)) : undefined,
    balanceChanges: (tx.effects?.balanceChanges?.nodes ?? []).map((c) => ({
      owner: { AddressOwner: c.owner?.address },
      coinType: normalizeCoinType(c.coinType.repr),
      amount: c.amount,
    })),
    effects: {
      status: tx.effects?.status
        ? { status: tx.effects.status === "SUCCESS" ? "success" : "failure", error: tx.effects.executionError?.message }
        : undefined,
      gasUsed: gas
        ? { computationCost: String(gas.computationCost), storageCost: String(gas.storageCost), storageRebate: String(gas.storageRebate) }
        : undefined,
    },
    transaction: { data: { sender: tx.sender?.address } },
  };
}

async function fetchTransaction(digest: string) {
  const data = await gql<{ transaction: GqlTransaction | null }>(
    "transaction",
    `query($d: String!) { transaction(digest: $d) { ${TX_FIELDS} } }`,
    { d: digest },
  );
  if (!data.transaction) throw new Error(`Sui transaction ${digest} was not found on ${process.env.TATUM_SUI_NETWORK?.trim() || "mainnet"}.`);
  return fromGql(data.transaction);
}

export interface TatumHealth {
  configured: boolean;
  reachable: boolean;
  network: string;
  rpcUrl: string;
  checkpoint: string | null;
  error: string | null;
}

export async function tatumHealth(): Promise<TatumHealth> {
  const network = process.env.TATUM_SUI_NETWORK?.trim() || "mainnet";
  if (!process.env.TATUM_API_KEY?.trim()) {
    return {
      configured: false,
      reachable: false,
      network,
      rpcUrl: rpcUrl(),
      checkpoint: null,
      error: "TATUM_API_KEY is not set. Verified Sui reads are disabled; demo data is clearly labelled.",
    };
  }
  try {
    const data = await gql<{ checkpoint: { sequenceNumber: number | string } | null }>("checkpoint", "{ checkpoint { sequenceNumber } }");
    const checkpoint = data.checkpoint ? String(data.checkpoint.sequenceNumber) : null;
    return { configured: true, reachable: true, network, rpcUrl: rpcUrl(), checkpoint, error: null };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      network,
      rpcUrl: rpcUrl(),
      checkpoint: null,
      error: error instanceof Error ? error.message : "Unknown Tatum error",
    };
  }
}

export interface NormalizedBalance {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  amountMinor: number;
  amountRaw: string;
}

function toMinor(raw: string, decimals: number): number {
  const n = BigInt(raw || "0");
  const divisor = 10n ** BigInt(decimals);
  const whole = n / divisor;
  const fraction = n % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 2);
  return Number(whole) * 100 + Number(fractionStr || "0");
}

export async function getWalletBalances(address: string): Promise<NormalizedBalance[]> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(address)) throw new Error("Invalid Sui address");
  const data = await gql<{
    address: { balances: { nodes: { coinType: { repr: string }; totalBalance: string; coinMetadata: { decimals: number; symbol: string | null; name: string | null } | null }[] } } | null;
  }>(
    "balances",
    `query($a: SuiAddress!) { address(address: $a) { balances(first: 50) { nodes { coinType { repr } totalBalance coinMetadata { decimals symbol name } } } } }`,
    { a: address },
  );
  const results: NormalizedBalance[] = [];
  for (const balance of data.address?.balances.nodes ?? []) {
    if (BigInt(balance.totalBalance) <= 0n) continue;
    const coinType = normalizeCoinType(balance.coinType.repr);
    const known = KNOWN_COINS[coinType];
    const m = balance.coinMetadata;
    const meta = known ?? (m ? { symbol: m.symbol || "TOKEN", decimals: m.decimals, name: m.name || "Token" } : undefined);
    if (!meta) continue;
    results.push({
      coinType,
      symbol: meta.symbol,
      name: meta.name,
      decimals: meta.decimals,
      amountMinor: toMinor(balance.totalBalance, meta.decimals),
      amountRaw: balance.totalBalance,
    });
  }
  return results;
}

interface SuiTransactionBlock {
  digest: string;
  timestampMs?: string;
  balanceChanges?: {
    owner: { AddressOwner?: string; ObjectOwner?: string; Shared?: unknown };
    coinType: string;
    amount: string;
  }[];
  effects?: {
    status?: { status: string; error?: string };
    gasUsed?: { computationCost: string; storageCost: string; storageRebate: string };
  };
  transaction?: { data?: { sender?: string } };
}

export interface NormalizedChainTransaction {
  digest: string;
  timestamp: Date;
  status: "success" | "failure" | "pending";
  error: string | null;
  direction: "in" | "out" | null;
  coinType: string | null;
  symbol: string | null;
  decimals: number;
  amountMinor: number | null;
  counterparty: string | null;
  explorerUrl: string;
}

function explorerUrl(digest: string): string {
  const network = process.env.TATUM_SUI_NETWORK?.trim() || "mainnet";
  return `https://suiscan.xyz/${network === "mainnet" ? "mainnet" : network}/tx/${digest}`;
}

function normalizeTransaction(tx: SuiTransactionBlock, address: string): NormalizedChainTransaction {
  const lower = address.toLowerCase();
  const change = tx.balanceChanges?.find((c) => c.owner.AddressOwner?.toLowerCase() === lower);
  const status = tx.effects?.status?.status === "success" ? "success" : tx.effects?.status?.status === "failure" ? "failure" : "pending";
  const amount = change ? BigInt(change.amount) : null;
  const coin = change?.coinType ?? null;
  const known = coin ? KNOWN_COINS[coin] : undefined;
  const decimals = known?.decimals ?? 0;
  return {
    digest: tx.digest,
    timestamp: new Date(Number(tx.timestampMs ?? Date.now())),
    status,
    error: tx.effects?.status?.error ?? null,
    direction: amount === null ? null : amount > 0n ? "in" : "out",
    coinType: coin,
    symbol: known?.symbol ?? null,
    decimals,
    amountMinor: amount !== null && known ? toMinor((amount < 0n ? -amount : amount).toString(), decimals) : null,
    counterparty: change?.owner.AddressOwner ?? null,
    explorerUrl: explorerUrl(tx.digest),
  };
}

export async function getWalletTransactions(address: string, limit = 20): Promise<NormalizedChainTransaction[]> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(address)) throw new Error("Invalid Sui address");
  const data = await gql<{ address: { transactions: { nodes: GqlTransaction[] } } | null }>(
    "transactions",
    `query($a: SuiAddress!, $n: Int!) { address(address: $a) { transactions(last: $n, relation: AFFECTED) { nodes { ${TX_FIELDS} } } } }`,
    { a: address, n: limit },
  );
  return (data.address?.transactions.nodes ?? []).reverse().map((tx) => normalizeTransaction(fromGql(tx), address));
}

export async function getTransactionByDigest(digest: string, address?: string): Promise<NormalizedChainTransaction> {
  return normalizeTransaction(await fetchTransaction(digest), address ?? "0x0");
}

export interface WalletSyncResult {
  address: string;
  balances: NormalizedBalance[];
  transactions: number;
  accountsUpdated: number;
  syncedAt: string;
  explorerUrl: string;
  note: string;
}

export async function syncSuiWallet(userId: string, address: string, label = "Sui wallet"): Promise<WalletSyncResult> {
  const [balances, transactions] = await Promise.all([
    getWalletBalances(address),
    getWalletTransactions(address, 25),
  ]);

  let accountsUpdated = 0;
  for (const balance of balances) {
    const currency = balance.symbol === "SUI" ? "SUI" : balance.symbol;
    const account = await prisma.financialAccount.upsert({
      where: { userId_name: { userId, name: `${label} · ${balance.symbol}` } },
      create: {
        userId,
        name: `${label} · ${balance.symbol}`,
        accountType: "stablecoin",
        provider: "Tatum · Sui",
        currency,
        balanceMinor: balance.amountMinor,
        balanceSource: "onchain",
        verificationStatus: "verified_onchain",
        isLiquid: balance.symbol !== "SUI",
        walletAddress: address,
        chain: "sui",
        lastSyncedAt: new Date(),
        notes: `${balance.amountRaw} base units · ${balance.coinType}`,
      },
      update: {
        balanceMinor: balance.amountMinor,
        balanceSource: "onchain",
        verificationStatus: "verified_onchain",
        lastSyncedAt: new Date(),
        notes: `${balance.amountRaw} base units · ${balance.coinType}`,
      },
    });
    accountsUpdated += 1;

    for (const tx of transactions) {
      if (tx.direction === null || tx.amountMinor === null || tx.coinType !== balance.coinType) continue;
      await prisma.transaction.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: `tatum:${tx.digest}:${tx.coinType}:${tx.direction}` } },
        create: {
          userId,
          accountId: account.id,
          amountMinor: tx.amountMinor,
          currency,
          direction: tx.direction,
          category: tx.direction === "in" ? "income" : "transfer",
          description: `Sui ${tx.status} transaction`,
          timestamp: tx.timestamp,
          source: "onchain",
          status: tx.status === "success" ? "posted" : tx.status,
          transactionDigest: tx.digest,
          verificationStatus: "verified_onchain",
          dedupeKey: `tatum:${tx.digest}:${tx.coinType}:${tx.direction}`,
          metadata: JSON.stringify({ explorerUrl: tx.explorerUrl, error: tx.error }),
        },
        update: {
          status: tx.status === "success" ? "posted" : tx.status,
          verificationStatus: "verified_onchain",
        },
      });
    }
  }

  return {
    address,
    balances,
    transactions: transactions.length,
    accountsUpdated,
    syncedAt: new Date().toISOString(),
    explorerUrl: `https://suiscan.xyz/${process.env.TATUM_SUI_NETWORK === "mainnet" || !process.env.TATUM_SUI_NETWORK ? "mainnet" : process.env.TATUM_SUI_NETWORK}/account/${address}`,
    note: "Balances and settlement status come from Tatum's Sui GraphQL gateway. An onchain success does not prove a recipient received or withdrew offchain funds.",
  };
}

export async function linkOnchainEvidence(userId: string, movementId: string, digest: string) {
  const movement = await prisma.moneyMovement.findFirst({ where: { id: movementId, userId } });
  if (!movement) throw new Error("Movement not found");
  const tx = await getTransactionByDigest(digest);
  if (tx.status !== "success") {
    throw new Error(`Sui transaction ${digest} is ${tx.status}; LANDED will not mark it confirmed.`);
  }
  return prisma.moneyMovement.update({
    where: { id: movement.id },
    data: {
      transactionDigest: digest,
      onchainStatus: tx.status,
      evidenceType: "onchain_verified",
      notes: `${movement.notes ? `${movement.notes}\n` : ""}Onchain settlement verified via Tatum at ${new Date().toISOString()}. This does not confirm recipient-side fiat payout.`,
    },
  });
}

export interface TransactionEvidence {
  digest: string;
  status: "success" | "failure" | "pending";
  error: string | null;
  timestamp: string;
  sender: string | null;
  /** Network gas actually burned, in SUI. Never converted to fiat without a sourced rate. */
  gasFeeSui: string;
  gasFeeMist: string;
  /** Gas in USD cents, only when Tatum's Data API returned a SUI/USD rate. */
  gasFeeUsdMinor: number | null;
  rate: SourcedRate | null;
  balanceChanges: {
    owner: string | null;
    coinType: string;
    symbol: string | null;
    amountMinor: number | null;
    direction: "in" | "out";
  }[];
  explorerUrl: string;
  note: string;
}

/**
 * Read a Sui transaction through Tatum and normalize the facts an outcome
 * needs: settlement status, gas, and per-owner balance changes.
 */
export async function getTransactionEvidence(digest: string): Promise<TransactionEvidence> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(digest)) throw new Error("That does not look like a Sui transaction digest");
  const tx = await fetchTransaction(digest);
  const gas = tx.effects?.gasUsed;
  const gasMist = gas
    ? BigInt(gas.computationCost) + BigInt(gas.storageCost) - BigInt(gas.storageRebate)
    : 0n;
  const status = tx.effects?.status?.status === "success" ? "success" : tx.effects?.status?.status === "failure" ? "failure" : "pending";
  let rate: SourcedRate | null = null;
  try {
    rate = (await getRates(["SUI"], "USD")).get("SUI") ?? null;
  } catch {
    rate = null; // Shown in SUI only; no invented conversion.
  }
  return {
    gasFeeUsdMinor: rate ? convertToMinor(gasMist, 9, rate) : null,
    rate,
    digest: tx.digest,
    status,
    error: tx.effects?.status?.error ?? null,
    timestamp: new Date(Number(tx.timestampMs ?? Date.now())).toISOString(),
    sender: tx.transaction?.data?.sender ?? null,
    gasFeeMist: gasMist.toString(),
    gasFeeSui: formatUnits(gasMist, 9),
    balanceChanges: (tx.balanceChanges ?? []).map((change) => {
      const known = KNOWN_COINS[change.coinType];
      const raw = BigInt(change.amount);
      const abs = raw < 0n ? -raw : raw;
      return {
        owner: change.owner.AddressOwner ?? null,
        coinType: change.coinType,
        symbol: known?.symbol ?? null,
        amountMinor: known ? toMinor(abs.toString(), known.decimals) : null,
        direction: raw < 0n ? "out" : "in",
      };
    }),
    explorerUrl: explorerUrl(tx.digest),
    note: "Read from Tatum's Sui GraphQL gateway. Onchain settlement does not prove a recipient-side fiat payout. Gas is converted to USD only with a Tatum Data API rate.",
  };
}

function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = 10n ** BigInt(decimals);
  const fraction = (abs % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${abs / divisor}${fraction ? `.${fraction}` : ""}`;
}
