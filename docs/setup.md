# Setup and deployment

## 1. Local

Requirements: Node 20+ (Node 22+ recommended), pnpm 9+.

```bash
pnpm install
cp .env.example .env
pnpm setup
pnpm dev
```

`pnpm setup` runs `prisma generate`, creates `prisma/dev.db`, applies the schema, and seeds the synthetic demo.

Demo account:

```
demo@landed.app
landed-demo-2026
```

Use **Open demo account** on the sign-in page, or POST `/api/auth/demo`. Disable the route with `LANDED_DEMO_ENABLED=false` in any environment where a public demo is not appropriate.

Reset deterministically:

```bash
pnpm db:reset
```

## 2. Tatum Sui

1. Create a Tatum account and an API key at <https://dashboard.tatum.io>.
2. Put the key in `.env` (server only):

```dotenv
TATUM_API_KEY="..."
TATUM_SUI_RPC_URL="https://sui-mainnet.gateway.tatum.io"
TATUM_SUI_NETWORK="mainnet"
```

3. Restart the dev server.
4. In **Settings → Integrations → Tatum**, paste a Sui address and choose **Test read**. You should see balances and, for a known address, recent transactions with explorer links.

What LANDED calls through Tatum:

- `sui_getLatestCheckpointSequenceNumber` (health)
- `suix_getAllBalances` (balances)
- `suix_getOwnedObjects` (coins)
- `sui_getTransactionBlock` (settlement reads)

There is **no fallback to a public RPC**. If the key is absent, the API returns HTTP 503 with `TATUM_NOT_CONFIGURED` and the UI shows `not configured`.

Onchain settlement is deliberately kept separate from offchain recipient confirmation: a successful Sui transaction proves settlement, not that the recipient received the intended fiat amount.

## 3. Walrus Memory

1. Create a memory account at <https://memory.walrus.xyz>.
2. Create a **delegate key** for the app — do not use the owner key in a server that also serves users.
3. Set:

```dotenv
MEMWAL_PRIVATE_KEY="..."
MEMWAL_ACCOUNT_ID="..."
MEMWAL_SERVER_URL="https://relayer.memory.walrus.xyz"
MEMWAL_APP_PREFIX="landed"
```

4. Verify configuration and relayer health:

```bash
pnpm walrus:verify --min=0
```

5. Generate outcomes and confirm lessons in the app, or retry eligible lessons:

```bash
pnpm walrus:backfill --dry-run
pnpm walrus:backfill
```

6. Confirm the hackathon threshold:

```bash
pnpm walrus:verify        # requires 10 confirmed blob IDs by default
```

Each confirmed record shows memory ID, category, write status, blob ID, source decision, and confirmation timestamp in **Memory** and in `/api/memories/verify`.

### Synthetic demo lessons

Walrus blobs are public and permanent. Seeded lessons are synthetic, so backfill **skips them by default**. To populate a clearly labelled demo account:

```bash
pnpm walrus:backfill --include-synthetic --user=demo@landed.app
```

Only do this for a demo account whose data you are comfortable publishing permanently. `pnpm walrus:verify` reports how many confirmed writes are synthetic.

### What a write means

A record becomes `confirmed` only when `rememberAndWait` returns a blob ID. Missing credentials produce `blocked`; relayer or SDK errors produce `failed`; neither is counted as a Mainnet write.

## 4. Optional AI explanations

```dotenv
AI_BASE_URL="https://api.openai.com/v1"
AI_API_KEY="..."
AI_MODEL="..."
```

The AI layer receives only a compact, server-built explanation request. It cannot compute amounts, rank routes, confirm outcomes, or write memory. With no configuration, deterministic explanations are used.

## 5. Production build

```bash
pnpm build
pnpm start
```

Health-relevant endpoints:

- `/` — landing page
- `/api/auth/me` — session state (401 when signed out)
- `/api/integrations/health` — Tatum/Walrus/AI status (authenticated)
- `/api/export` — complete user record (authenticated)

## 6. Docker

```bash
docker build -t landed .
docker run --rm -p 3000:3000 \
  -v landed-data:/app/prisma \
  -e LANDED_SEED_DEMO=true \
  --env-file .env \
  landed
```

The image applies the schema (`prisma db push`) before `next start`. Set `LANDED_SEED_DEMO=true` on the first run to create the labelled synthetic demo account; omit it afterward so restarts do not delete and rebuild that data. SQLite lives at `/app/prisma/dev.db`, so the volume is required for persistence.

Do not bake `.env` into the image. Pass secrets at runtime. Docker's `--env-file` keeps surrounding quotes as literal characters while Next.js and Prisma expect raw values; `scripts/docker-start.sh` strips matching quotes from the variables LANDED reads, so both quoted and unquoted `.env` files work.

## 7. Railway

`railway.json` selects the Dockerfile and runs the schema push at deploy. Steps:

1. Create a Railway project from this repository.
2. Add the variables from `.env` in the Railway dashboard.
3. Set `LANDED_SEED_DEMO=true` if you want the labelled synthetic demo on first boot. Remove it after the first successful deploy, because the seed replaces the demo user's data on every start.
4. Attach a volume mounted at `/app/prisma` if you keep SQLite.
5. Deploy. Set the public domain in `NEXT_PUBLIC_APP_URL`.

For a multi-instance or durable production deployment, use PostgreSQL instead of SQLite.

## 8. PostgreSQL

The schema is intentionally portable.

1. Change the datasource provider in `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

2. Set `DATABASE_URL` to the managed Postgres URL.
3. Regenerate and apply:

```bash
pnpm prisma generate
pnpm prisma db push        # or prisma migrate deploy with committed migrations
```

4. Re-run the demo seed only if you want synthetic data:

```bash
pnpm db:seed
```

Integer minor-unit columns and JSON-as-text columns map directly. For a long-lived deployment, replace `db push` with Prisma migrations and run `prisma migrate deploy` in the release step.

## 9. Operational checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm walrus:verify --min=0
```

Expected in this checkout without credentials:

- Tatum: `not configured`, API 503 for wallet reads.
- Walrus: `not configured`, writes `blocked`, 0 confirmed.
- All other flows work against the labelled synthetic demo.

## 10. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Missing MEMWAL_PRIVATE_KEY` | Add the delegate key and account ID, then restart. |
| Walrus `failed` | Read the stored error in the memory ledger; retry with `pnpm walrus:backfill`. |
| Tatum 503 | `TATUM_API_KEY` absent; the app refuses to substitute another RPC. |
| Demo data disappeared | `pnpm db:reset` reseeds; SQLite volume not mounted in Docker. |
| `prisma db push` asks to reset | Schema changed against a non-empty DB; for local demo use `pnpm db:reset`, for production use migrations. |
| Login cookie not set behind a proxy | Ensure HTTPS in production; the cookie is `secure` when `NODE_ENV=production`. |
