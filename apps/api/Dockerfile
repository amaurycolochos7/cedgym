# ═══════════════════════════════════════════════════════════════
# CED-GYM API — multi-stage Dockerfile
# Build context: repo root (so packages/db is reachable)
# ═══════════════════════════════════════════════════════════════

# ---------- Stage 1: deps ----------
FROM node:20-alpine AS deps

WORKDIR /app

# pnpm is pinned in the root package.json via `packageManager`.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy workspace manifests first — best caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/db/prisma ./packages/db/prisma

RUN pnpm install --frozen-lockfile=false --filter @cedgym/api... --prod=false

# Generate Prisma client against the shared schema.
RUN pnpm --filter @cedgym/db exec prisma generate

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Pull installed deps + generated Prisma client from the deps stage.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=deps /app/apps/api/package.json ./apps/api/
COPY --from=deps /app/packages/db/package.json ./packages/db/
COPY --from=deps /app/packages/db/prisma ./packages/db/prisma

# Copy source.
COPY apps/api/src ./apps/api/src
COPY packages/db/src ./packages/db/src

EXPOSE 3001

WORKDIR /app/apps/api

# Run Prisma `db push` on boot (idempotent), then seed, then start.
# The seed is non-blocking — if it fails we still want the API up.
CMD sh -c "cd /app && pnpm --filter @cedgym/db exec prisma db push --accept-data-loss && cd /app/apps/api && (node src/seed.js || echo '[seed] skipped/failed') && node src/index.js"
