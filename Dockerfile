# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
  && apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="file:./build.db"
COPY . .
RUN pnpm prisma generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# The database lives in its own directory so a volume can be mounted there
# without hiding prisma/schema.prisma and the seed script.
ENV DATABASE_URL="file:/app/data/landed.db"

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /app/data && chmod +x ./scripts/docker-start.sh && chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# SQLite needs a persistent volume at /app/data. Platforms that mount volumes
# as root (Railway) need the container to run as root: RAILWAY_RUN_UID=0.
# For PostgreSQL, replace the schema provider and run migrations in a release step.
CMD ["sh", "scripts/docker-start.sh"]
