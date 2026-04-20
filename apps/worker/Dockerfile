FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/

RUN pnpm install --filter @cedgym/worker... --frozen-lockfile || pnpm install --filter @cedgym/worker...

COPY packages/db ./packages/db
RUN pnpm --filter @cedgym/db exec prisma generate --schema=./prisma/schema.prisma

COPY apps/worker ./apps/worker

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/worker ./apps/worker
COPY --from=deps /app/package.json /app/pnpm-workspace.yaml ./

WORKDIR /app/apps/worker
CMD ["node", "src/index.js"]
