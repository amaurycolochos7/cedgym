# CED-GYM — Deploy

Archivos de deployment para llevar CED-GYM a producción.

## Arquitectura

```
┌─────────────────┐         ┌──────────────────────────────────────┐
│   Vercel        │         │   Dokploy VPS  (187.77.11.79)        │
│                 │         │                                      │
│  cedgym-web     │ HTTPS   │  ┌────────────┐  ┌─────────────────┐ │
│  (Next.js)      │────────→│  │ cedgym-api │  │ cedgym-         │ │
│                 │  CORS   │  │  :3001     │  │ whatsapp-bot    │ │
│ cedgym.vercel   │         │  └────┬───────┘  │  :3002          │ │
│      .app       │         │       │          └────────┬────────┘ │
└─────────────────┘         │       ↓                   │          │
                            │  ┌──────────┐  ┌──────────┴────────┐ │
                            │  │ cedgym-  │  │ cedgym-worker     │ │
                            │  │   db     │←─┤ (sin puerto)      │ │
                            │  │ (Pg16)   │  └───────────────────┘ │
                            │  └──────────┘  ┌───────────────────┐ │
                            │                │ cedgym-redis      │ │
                            │                └───────────────────┘ │
                            └──────────────────────────────────────┘
```

## Archivos

| Archivo | Propósito |
|---|---|
| `DEPLOY.md` | **Guía completa paso a paso**. Empezá por acá. |
| `dokploy-compose.yml` | Compose optimizado para Dokploy (sin puertos internos expuestos, healthchecks, adminer opcional). |
| `vercel.json` | Config para que Vercel entienda el monorepo pnpm. Copiá a la raíz del repo si querés que Vercel lo use. |
| `generate-secrets.sh` | Genera JWT, webhook secrets, DB passwords. |
| `check-deploy.sh` | Smoke test post-deploy. |

## Requisitos

- VPS con Dokploy instalado y funcional en `http://187.77.11.79:3000`.
- Cuenta GitHub con el repo `amaurycolochos7/cedgym` accesible.
- Cuenta Mercado Pago (Argentina) con app creada en Developers → credenciales de producción.
- Cuenta Vercel (gratis) conectada al GitHub.
- `openssl` local para generar secrets (`bash`, Git Bash o WSL en Windows).

## Roadmap del deploy

| # | Qué | Dónde | Tiempo aprox. |
|---|-----|-------|---------------|
| 1 | Generar secrets | Local (`generate-secrets.sh`) | 1 min |
| 2 | Postgres | Dokploy | 3 min |
| 3 | Redis | Dokploy | 2 min |
| 4 | API | Dokploy (build desde GitHub) | 5-8 min (primer build) |
| 5 | WhatsApp bot | Dokploy | 5-8 min |
| 6 | Worker | Dokploy | 4-6 min |
| 7 | Migraciones + seed | Dokploy Terminal | 2 min |
| 8 | Parear WhatsApp | Scanning QR | 2 min |
| 9 | Frontend | Vercel | 3-5 min |
| 10 | Webhook MP | MP dashboard | 2 min |
| 11 | Smoke test | Local (`check-deploy.sh`) | 1 min |

**Total:** ~35-45 min (asumiendo builds no fallidos).

## Troubleshooting rápido

| Problema | Ver |
|---|---|
| WhatsApp bot no conecta / sesión perdida | `DEPLOY.md` §H — re-escanear QR, verificar volume `wwebjs_auth` |
| Chromium out of memory | `DEPLOY.md` §H — aumentar `shm_size` a 1024MB |
| CORS error en browser | `DEPLOY.md` §D — revisar env `CORS_ORIGINS` en `cedgym-api` |
| Webhook MP devuelve 403 | `DEPLOY.md` §H — chequear `MP_WEBHOOK_SECRET` |
| Vercel build falla por módulos | `DEPLOY.md` §C — usar build command con `cd ../..` |

Ver `DEPLOY.md` §H para la tabla completa.

## Seguridad

- `deploy/.secrets.local` está en `.gitignore` (o debería estarlo). **Nunca committees secrets.**
- DB y Redis NO exponen puertos externos — sólo accesibles via red interna Dokploy.
- El API expone `3001` al público (sin HTTPS por falta de dominio). Los tokens JWT y Mercado Pago webhooks tienen validación por firma igualmente.
- Cuando haya dominio, activar HTTPS via Dokploy (Let's Encrypt automático).
