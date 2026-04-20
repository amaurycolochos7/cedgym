# CED·GYM — Plataforma multi-deporte

Monorepo de la plataforma gym management SaaS de CED·GYM. Construido con:

- **Next.js 14** (App Router, TypeScript, Tailwind) — frontend
- **Fastify 5** (ESM, JWT, Prisma) — API
- **PostgreSQL + Redis**
- **whatsapp-web.js** — bot de WhatsApp para OTP, recordatorios, marketing
- **Mercado Pago** — pagos y suscripciones
- **Prisma ORM** — schema compartido
- **pnpm workspaces**

## Estructura

```
cedgym/
├── apps/
│   ├── api/              Fastify API (auth, membresías, pagos, marketplace, gamification, chat)
│   ├── web/              Next.js 14 frontend (público, portal atleta, admin, staff)
│   ├── whatsapp-bot/     Bot whatsapp-web.js multi-sesión
│   └── worker/           Cron sweeps (recordatorios, inactividad, cumpleaños)
├── packages/
│   └── db/               Schema Prisma compartido
├── deploy/               Guías y scripts para Dokploy/Vercel
├── docker-compose.yml    Infraestructura local + producción
└── ULTRAPLAN.md          Plan completo del producto
```

## Arranque en local

### 1. Prerequisitos
- Node ≥20
- pnpm ≥9
- Docker + Docker Compose

### 2. Instalar dependencias
```bash
pnpm install
```

### 3. Servicios de infraestructura
```bash
docker compose up -d db redis
```

### 4. Generar Prisma client y aplicar schema
```bash
pnpm --filter @cedgym/db generate
cd packages/db && npx prisma db push && cd ../..
```

### 5. Seeds (workspace + superadmin + badges + automaciones)
```bash
node apps/api/src/seed.js
node apps/api/src/seed-automations.js
```

Seed default:
- Workspace slug: `ced-gym`
- Admin: `admin@cedgym.mx` / `CedGym2026!`

### 6. Correr los servicios

Terminal 1 — API:
```bash
pnpm --filter @cedgym/api dev
# http://localhost:3001
```

Terminal 2 — Frontend:
```bash
pnpm --filter @cedgym/web dev
# http://localhost:3000
```

Terminal 3 — WhatsApp bot (opcional en local):
```bash
pnpm --filter @cedgym/whatsapp-bot start
# http://localhost:3002
```

Terminal 4 — Worker (opcional):
```bash
pnpm --filter @cedgym/worker start
```

### 7. Parear WhatsApp (después de iniciar el bot)
- Ir a `/admin/whatsapp` (como superadmin)
- Click "Iniciar sesión" → aparecerá QR
- Escanear con la app de WhatsApp → Dispositivos vinculados

## Deploy

Ver [`deploy/DEPLOY.md`](deploy/DEPLOY.md). Resumen:

- **Frontend**: Vercel (free tier con `apps/web` como root).
- **Backend (api, bot, worker, db, redis)**: Dokploy en `http://187.77.11.79:3000`.
- **Repo Git**: `amaurycolochos7/cedgym`.
- Secrets generados con `deploy/generate-secrets.sh`.
- Smoke test post-deploy: `deploy/check-deploy.sh`.

## Scripts útiles

```bash
# Regenerar Prisma después de cambio de schema
pnpm --filter @cedgym/db generate

# Abrir Prisma Studio
pnpm --filter @cedgym/db studio

# Ver logs de docker compose
docker compose logs -f

# Build producción frontend
pnpm --filter @cedgym/web build
```

## Documentación

- [`ULTRAPLAN.md`](ULTRAPLAN.md) — plan completo del producto con fases, schema y endpoints.
- [`deploy/DEPLOY.md`](deploy/DEPLOY.md) — deploy paso a paso.
- Cada `apps/*/README.md` — detalles del microservicio.

## Licencia
Privado — uso exclusivo CED·GYM.
