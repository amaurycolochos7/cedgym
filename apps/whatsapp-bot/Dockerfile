FROM node:20-bookworm

# Install Chromium and ALL system dependencies for Puppeteer/Chrome
RUN apt-get update && apt-get install -y \
    chromium \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libnspr4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    libxshmfence1 \
    libgl1 \
    libglib2.0-0 \
    libdbus-1-3 \
    ca-certificates \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium (don't download its own)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Session data persists in this volume across deploys
# This path MUST match the volume mount in docker-compose
ENV WWEBJS_DATA_PATH=/app/data/wwebjs_auth

WORKDIR /app

# Enable pnpm via corepack (monorepo uses pnpm workspaces)
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy workspace manifests so pnpm can resolve @cedgym/db as workspace:*
COPY package.json pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/db/prisma ./packages/db/prisma/
COPY packages/db/src ./packages/db/src/
COPY apps/whatsapp-bot/package.json ./apps/whatsapp-bot/

# Install dependencies for the bot + its workspace deps
# (need dev deps so prisma CLI is available for generate)
RUN pnpm install --filter @cedgym/whatsapp-bot... --frozen-lockfile=false

# Generate Prisma client in the shared db package
RUN pnpm --filter @cedgym/db exec prisma generate

# Copy and run the patch script to fix whatsapp-web.js
COPY apps/whatsapp-bot/patch-wwebjs.cjs ./apps/whatsapp-bot/patch-wwebjs.cjs
# CRITICAL PATCH: Disable the Error constructor override in whatsapp-web.js
# The ocVersion patch (evaluateOnNewDocument that replaces global Error) was designed
# for older WhatsApp Web versions. On modern WA Web, it prevents window.Debug.VERSION
# from ever being set, causing the entire library to hang with an "auth timeout".
# AB test confirmed: WITHOUT this patch, Debug.VERSION appears in 2s; WITH it, NEVER.
RUN cd apps/whatsapp-bot && node patch-wwebjs.cjs

# Copy source code
COPY apps/whatsapp-bot/src ./apps/whatsapp-bot/src/

# Create persistent data directory (mounted as volume)
RUN mkdir -p /app/data/wwebjs_auth

WORKDIR /app/apps/whatsapp-bot

EXPOSE 3002

# Defensive: sweep stale Chromium singleton locks before launching Node.
# SingletonLock is a symlink to "hostname-pid"; when a previous container
# crashed it remains as a broken link that prevents the next Chrome launch
# with "The profile appears to be in use by another Chromium process".
# The in-code cleanup also handles this, but running it here guarantees a
# clean slate even if WhatsAppSession.js is bypassed.
CMD ["sh", "-c", "find /app/data/wwebjs_auth -maxdepth 4 -name 'SingletonLock' -delete 2>/dev/null; find /app/data/wwebjs_auth -maxdepth 4 -name 'SingletonSocket' -delete 2>/dev/null; find /app/data/wwebjs_auth -maxdepth 4 -name 'SingletonCookie' -delete 2>/dev/null; exec node src/index.js"]
