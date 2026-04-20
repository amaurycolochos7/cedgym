# CED-GYM — Guía de Deploy (Dokploy + Vercel)

Guía paso a paso para llevar CED-GYM a producción usando **Dokploy** (backend) y **Vercel** (frontend).

- Dokploy UI: `http://187.77.11.79:3000`
- Proyecto en Dokploy: `cedgym` (ya creado por el cliente)
- Repo: `https://github.com/amaurycolochos7/cedgym.git`
- Frontend Vercel: `https://cedgym.vercel.app` (o la que asigne Vercel)
- API pública: `http://187.77.11.79:3001`
- WhatsApp bot: `http://187.77.11.79:3002`

> **Nota:** No hay dominio propio. El API se expone via IP pública. Para HTTPS a futuro ver sección **F. Siguientes pasos**.

---

## A. Preparar el repo en GitHub

### A.1 Push inicial (si aún no está subido)

```bash
cd /ruta/al/cedgym
git init
git remote add origin https://github.com/amaurycolochos7/cedgym.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

### A.2 Dar acceso a Dokploy

Si el repo es **público** no hay nada que hacer.

Si es **privado**, hay 2 opciones:

**Opción 1 — GitHub App (recomendado):**
1. En Dokploy → Settings → Git Providers → GitHub → **Install GitHub App**.
2. Autorizar acceso sólo al repo `cedgym`.

**Opción 2 — Deploy Key:**
1. En Dokploy → Settings → SSH Keys → Generate → copiar public key.
2. En GitHub → repo `cedgym` → Settings → Deploy keys → Add key → pegar.

---

## B. Configurar Dokploy paso a paso

Abrí `http://187.77.11.79:3000` e ingresá con las credenciales ya creadas. Todos los recursos van dentro del proyecto `cedgym`.

### B.0 Generar secrets (antes de empezar)

En tu máquina local:

```bash
bash deploy/generate-secrets.sh > deploy/.secrets.local
cat deploy/.secrets.local
```

Copiá esos valores — los vas a pegar varias veces. **No commitees `.secrets.local`**.

Adicionalmente necesitás desde **Mercado Pago → Developers → Credentials**:
- `MP_ACCESS_TOKEN` (Access Token de producción, tipo `APP_USR-...`)
- `MP_PUBLIC_KEY` (Public Key de producción)

---

### B.1 Crear Postgres

1. `Projects → cedgym → + Create → Database → PostgreSQL`
2. Configurá:
   - **Name:** `cedgym-db`
   - **Version:** `16`
   - **Database Name:** `cedgym`
   - **User:** `cedgym`
   - **Password:** pegá el `POSTGRES_PASSWORD` generado
   - **External Port:** *dejar vacío* (sólo red interna)
3. En **Advanced**:
   - **Memory Limit:** `512 MB`
   - **CPU Limit:** `0.5`
4. Click **Deploy**.
5. Esperá que el estado pase a **Running** (~30s).

> En el panel, anotá el **hostname interno**: debería ser `cedgym-db` (coincide con el `container_name`).

---

### B.2 Crear Redis

1. `+ Create → Database → Redis`
2. Configurá:
   - **Name:** `cedgym-redis`
   - **Version:** `7`
   - **Password:** *dejar vacío* (red interna)
   - **External Port:** *dejar vacío*
3. Click **Deploy**.

---

### B.3 Crear servicio API

1. `+ Create → Application → Docker`
2. **General:**
   - **Name:** `cedgym-api`
   - **Description:** `REST API Fastify + Prisma`
3. **Source:**
   - **Provider:** GitHub
   - **Repo:** `amaurycolochos7/cedgym`
   - **Branch:** `main`
   - **Build Path:** `.` (raíz)
4. **Build:**
   - **Build Type:** `Dockerfile`
   - **Dockerfile Path:** `apps/api/Dockerfile`
   - **Build Context:** `.`
5. **Environment:** (pegar todo en el textarea)
   ```env
   DATABASE_URL=postgresql://cedgym:<POSTGRES_PASSWORD>@cedgym-db:5432/cedgym
   REDIS_URL=redis://cedgym-redis:6379
   JWT_SECRET=<JWT_SECRET generado>
   JWT_REFRESH_SECRET=<JWT_REFRESH_SECRET generado>
   MP_ACCESS_TOKEN=<de Mercado Pago>
   MP_PUBLIC_KEY=<de Mercado Pago>
   MP_WEBHOOK_SECRET=<MP_WEBHOOK_SECRET generado>
   WHATSAPP_BOT_URL=http://cedgym-whatsapp-bot:3002
   WHATSAPP_BOT_KEY=<WHATSAPP_BOT_KEY generado>
   API_PORT=3001
   API_HOST=0.0.0.0
   NODE_ENV=production
   API_PUBLIC_URL=http://187.77.11.79:3001
   CORS_ORIGINS=https://cedgym.vercel.app,http://localhost:3000
   ```
6. **Ports:**
   - Published Port: `3001` → Target Port: `3001`
7. **Advanced → Healthcheck:**
   - Command: `wget --spider -q http://localhost:3001/health`
   - Interval: `30s`, Timeout: `10s`, Retries: `5`, Start period: `30s`
8. Click **Deploy**.
9. Seguí los logs en **Logs** hasta ver `API listening on 0.0.0.0:3001`.

---

### B.4 Crear servicio WhatsApp bot

1. `+ Create → Application → Docker`
2. **Name:** `cedgym-whatsapp-bot`
3. **Source:** mismo repo, branch `main`
4. **Build:**
   - Dockerfile Path: `apps/whatsapp-bot/Dockerfile`
   - Build Context: `.`
5. **Environment:**
   ```env
   DATABASE_URL=postgresql://cedgym:<POSTGRES_PASSWORD>@cedgym-db:5432/cedgym
   API_KEY=<MISMO WHATSAPP_BOT_KEY que en cedgym-api>
   PORT=3002
   NODE_ENV=production
   ```
6. **Ports:** `3002:3002`
7. **Advanced → Volumes:** *(crítico — sin esto se pierde la sesión de WhatsApp en cada redeploy)*
   - Type: `Volume`
   - Name: `wwebjs_auth`
   - Mount path: `/app/data/wwebjs_auth`
8. **Advanced → Resources:**
   - SHM size: `512MB` (Chromium lo necesita)
   - Memory limit: `1024MB`
9. **Advanced → Healthcheck:**
   - Command: `wget --spider -q http://localhost:3002/health`
   - Start period: `45s` (Chromium tarda en bootear)
10. Click **Deploy**.

---

### B.5 Crear servicio worker

1. `+ Create → Application → Docker`
2. **Name:** `cedgym-worker`
3. **Source:** mismo repo
4. **Build:**
   - Dockerfile Path: `apps/worker/Dockerfile`
   - Build Context: `.`
5. **Environment:**
   ```env
   DATABASE_URL=postgresql://cedgym:<POSTGRES_PASSWORD>@cedgym-db:5432/cedgym
   REDIS_URL=redis://cedgym-redis:6379
   WHATSAPP_BOT_URL=http://cedgym-whatsapp-bot:3002
   WHATSAPP_BOT_KEY=<mismo valor>
   NODE_ENV=production
   ```
6. **Ports:** ninguno (no expone nada)
7. Click **Deploy**.

---

### B.6 Migraciones Prisma (sólo la primera vez)

1. Ir a `cedgym-api → Terminal` en Dokploy.
2. Ejecutar:
   ```bash
   npx prisma migrate deploy
   node apps/api/src/seed.js
   ```
3. Verificar:
   ```bash
   npx prisma db execute --stdin <<< "SELECT count(*) FROM \"User\";"
   ```

> **Re-run seed:** sólo si hiciste `migrate reset`. El seed debe ser idempotente (upsert).

---

### B.7 Parear WhatsApp

Cada workspace (gym) tiene su propia sesión.

1. Obtené el `workspace_id` del gym desde la DB (tabla `Workspace`).
2. Abrí en el browser (con extensión ModHeader o similar para setear `x-api-key`):
   ```
   http://187.77.11.79:3002/sessions/<WORKSPACE_ID>/qr
   Header: x-api-key: <WHATSAPP_BOT_KEY>
   ```
3. O desde CLI:
   ```bash
   curl -H "x-api-key: <WHATSAPP_BOT_KEY>" \
        http://187.77.11.79:3002/sessions/<WORKSPACE_ID>/qr
   ```
4. Escaneá el QR con el WhatsApp del celular del gym (WhatsApp → Dispositivos vinculados).
5. Verificá en DB:
   ```sql
   SELECT is_connected, phone_number FROM "WhatsappSession"
   WHERE workspace_id = '<WORKSPACE_ID>';
   ```
   Debe quedar `is_connected = true`.

---

## C. Deploy frontend en Vercel

1. Entrá a `https://vercel.com` → **New Project** → **Import Git Repository** → `amaurycolochos7/cedgym`.
2. Configurá:
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`
   - **Build Command (override):**
     ```
     cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @cedgym/web build
     ```
   - **Install Command (override):**
     ```
     cd ../.. && pnpm install --frozen-lockfile
     ```
   - **Output Directory:** `.next` (default desde `apps/web`)
3. **Environment Variables:**
   ```
   NEXT_PUBLIC_API_URL=http://187.77.11.79:3001
   NEXT_PUBLIC_MP_PUBLIC_KEY=<MP Public Key>
   ```
4. Click **Deploy**.
5. Esperá ~2-3 min. Anotá la URL (ej. `cedgym.vercel.app`).

> **Alternativa:** usar el `deploy/vercel.json` de este repo committeándolo a la raíz — Vercel lo detecta automáticamente. Pero si lo hacés, borrá los overrides del dashboard para que no pisen el JSON.

---

## D. Configurar CORS

El API ya existe (no lo modifica esta guía). Asegurate de que `apps/api/src/index.js` lea la env `CORS_ORIGINS` y habilite al menos:

- `https://cedgym.vercel.app` (producción)
- Cada preview URL `https://cedgym-*.vercel.app` (opcional, con regex)
- `http://localhost:3000` (desarrollo local)

Si ves errores CORS en el browser, ajustá la env `CORS_ORIGINS` en Dokploy → `cedgym-api` → Environment, y **Redeploy**.

---

## E. Webhook de Mercado Pago

1. Entrá a `https://www.mercadopago.com.ar/developers/panel/app/<APP_ID>/webhooks`.
2. **Agregar URL de notificación:**
   ```
   http://187.77.11.79:3001/webhooks/mercadopago
   ```
3. **Eventos:**
   - Pagos (`payment`)
   - Suscripciones (`subscription_preapproval`)
4. **Secret:** pegá el `MP_WEBHOOK_SECRET` generado.
5. **Test:** click en "Simular notificación" → revisá logs del `cedgym-api`. Debe responder `200`.

> **Nota:** Mercado Pago requiere que la URL sea alcanzable desde internet. Como usás IP pública ya funciona. Si más adelante agregás firewall, whitelisteá los IPs de MP.

---

## F. Verificación final

Desde tu máquina local:

```bash
bash deploy/check-deploy.sh 187.77.11.79
# o con el frontend URL explícito
FRONT_URL=https://cedgym.vercel.app bash deploy/check-deploy.sh
```

Deberías ver todos los checks en verde excepto avisos benignos.

---

## G. Siguientes pasos (cuando tengan dominio propio)

1. Comprar dominio (ej. `cedgym.com`).
2. En Dokploy → `cedgym-api` → Domains → `api.cedgym.com` (Dokploy gestiona Let's Encrypt gratis).
3. En Vercel → `cedgym.com` → apuntar CNAME.
4. Actualizar envs:
   - API: `API_PUBLIC_URL=https://api.cedgym.com`, `CORS_ORIGINS=https://cedgym.com`
   - Web: `NEXT_PUBLIC_API_URL=https://api.cedgym.com`
   - MP Webhook: `https://api.cedgym.com/webhooks/mercadopago`

---

## H. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `Error: connect ECONNREFUSED cedgym-db:5432` | DB no está Running o nombre de host mal | Verificar en Dokploy que el container se llame `cedgym-db` y el service esté Running |
| Frontend devuelve `Network Error` en requests al API | CORS mal configurado | Revisar env `CORS_ORIGINS` en `cedgym-api` y redeploy |
| WhatsApp bot crashea con `Protocol error` o `Target closed` | Chromium sin memoria | Subir `shm_size` a `1024MB` y memory limit a `1536MB` |
| QR no aparece en `/qr` | Sesión ya conectada o bot iniciando | Esperar 45s post-deploy; si persiste, borrar volume `wwebjs_auth` y reintentar |
| `prisma migrate deploy` falla con `P1001` | DB no alcanzable desde API | Verificar `DATABASE_URL` y que ambos contenedores estén en la misma network Dokploy |
| Webhook MP devuelve 403 | `MP_WEBHOOK_SECRET` no coincide | Regenerar en MP, actualizar env en Dokploy, redeploy API |
| Vercel build falla con `Cannot find module @cedgym/...` | Root Directory mal o install command sin `cd ../..` | Revisar sección C.2 |
| Puerto 3001 no responde pero container está Up | Firewall del VPS bloqueando | Abrir puerto: `ufw allow 3001/tcp` en el servidor |

### Logs útiles

```bash
# En el servidor (SSH):
docker logs -f cedgym-api --tail 100
docker logs -f cedgym-whatsapp-bot --tail 100
docker logs -f cedgym-worker --tail 100

# Desde Dokploy UI:
# <servicio> → Logs (tail en vivo)
```

### Rollback rápido

En Dokploy → `<servicio>` → Deployments → click en el deploy anterior → **Redeploy**.
