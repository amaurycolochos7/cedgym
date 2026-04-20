# ═══════════════════════════════════════════════════════════════
# CED-GYM Web (Next.js 14)
# Build context: repo root. Web doesn't use Prisma — no packages/db.
# ═══════════════════════════════════════════════════════════════

FROM node:20-alpine AS deps

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
# Copy other workspace manifests so pnpm can resolve @cedgym/* references
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/whatsapp-bot/package.json ./apps/whatsapp-bot/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile=false --filter @cedgym/web --prod=false

FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY apps/web ./apps/web

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MP_PUBLIC_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MP_PUBLIC_KEY=$NEXT_PUBLIC_MP_PUBLIC_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN cd apps/web && pnpm build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/

EXPOSE 3000
WORKDIR /app/apps/web
CMD ["pnpm", "start", "-p", "3000"]
