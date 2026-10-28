import { z } from "zod";
import { api, parseBody } from "@/server/api";
import { requireApiUser } from "@/server/auth";
import {
  getTransactionByDigest, getWalletBalances, getWalletTransactions,
  linkOnchainEvidence, syncSuiWallet,
} from "@/server/services/tatum";

export const GET = api(async (req) => {
  await requireApiUser();
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const digest = searchParams.get("digest");
  if (digest) {
    return { transaction: await getTransactionByDigest(digest, address ?? undefined) };
  }
  if (!address) throw new Error("Provide a Sui wallet address or transaction digest");
  const [balances, transactions] = await Promise.all([
    getWalletBalances(address),
    getWalletTransactions(address, 20),
  ]);
  return {
    address,
    balances,
    transactions,
    network: process.env.TATUM_SUI_NETWORK ?? "mainnet",
    note: "Verified through Tatum's Sui RPC. Onchain settlement is not proof of fiat or recipient-side payout.",
  };
});

const syncSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Enter a full 0x-prefixed Sui address"),
  label: z.string().max(60).default("Sui wallet"),
});

export const POST = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, syncSchema);
  const result = await syncSuiWallet(user.id, body.address, body.label);
  return result;
});

const linkSchema = z.object({
  movementId: z.string().min(1),
  digest: z.string().min(20).max(200),
});

export const PATCH = api(async (req) => {
  const user = await requireApiUser();
  const body = await parseBody(req, linkSchema);
  const movement = await linkOnchainEvidence(user.id, body.movementId, body.digest);
  return {
    movement,
    note: "Only onchain settlement was verified. Recipient-side receipt remains unconfirmed unless separately recorded.",
  };
});
