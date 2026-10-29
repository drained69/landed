#!/bin/sh
set -e

# Docker's --env-file keeps surrounding quotes literally, while Next.js and
# Prisma expect the raw value. Normalize the values LANDED reads at runtime.
strip_quotes() {
  eval "value=\$$1"
  case "$value" in
    \"*\") value=$(printf '%s' "$value" | sed 's/^"//; s/"$//') ;;
    \'*\') value=$(printf '%s' "$value" | sed "s/^'//; s/'\$//") ;;
  esac
  export "$1=$value"
}

for key in DATABASE_URL TATUM_API_KEY TATUM_SUI_RPC_URL TATUM_SUI_NETWORK \
  MEMWAL_PRIVATE_KEY MEMWAL_ACCOUNT_ID MEMWAL_SERVER_URL MEMWAL_APP_PREFIX \
  AI_BASE_URL AI_API_KEY AI_MODEL NEXT_PUBLIC_APP_URL LANDED_DEMO_ENABLED; do
  eval "present=\${$key+x}"
  if [ "$present" = "x" ]; then
    strip_quotes "$key"
  fi
done

# Call the installed binaries directly so the runtime image never needs
# corepack to fetch a package manager from the network.
./node_modules/.bin/prisma db push --skip-generate

if [ "${LANDED_SEED_DEMO:-false}" = "true" ]; then
  # Seeds once. Reseeding on every boot would mint new lesson ids and lead a
  # later Walrus backfill to write duplicate, undeletable memories.
  echo "LANDED_SEED_DEMO=true — seeding the labelled synthetic demo if it is missing…"
  ./node_modules/.bin/tsx prisma/seed.ts --if-missing
fi

exec ./node_modules/.bin/next start
