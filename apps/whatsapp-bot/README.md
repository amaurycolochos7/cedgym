# @cedgym/whatsapp-bot

Microservicio que corre una sesión de WhatsApp Web por **workspace** usando
[whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) sobre Puppeteer
+ Chromium. Lo usa CED-GYM para enviar recordatorios, cobros, check-ins, etc.

> El plan de CED-GYM es **1 bot por workspace** (no por staff). El bot vive en
> un contenedor propio, persiste la autenticación en el volumen Docker y se
> auto-rehidrata al arrancar.

---

## Variables de entorno

| Var                        | Obligatoria | Default                    | Qué hace                                                                 |
| -------------------------- | ----------- | -------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`             | sí          | —                          | Postgres para Prisma (`@cedgym/db`).                                     |
| `PORT`                     | no          | `3002`                     | Puerto HTTP.                                                             |
| `API_KEY`                  | sí          | —                          | Header `x-api-key` obligatorio en todos los endpoints excepto `/health`. |
| `PUPPETEER_EXECUTABLE_PATH`| no          | `/usr/bin/chromium`        | Binario de Chromium/Chrome. En Docker viene del base image.              |
| `WWEBJS_DATA_PATH`         | no          | `/app/data/wwebjs_auth`    | Carpeta donde whatsapp-web.js guarda la sesión (`LocalAuth`).            |
| `SELF_HEAL_ENABLED`        | no          | `true`                     | Pon `false` para desactivar la barrida de self-heal cada 5 min.          |

---

## Endpoints

Todos requieren header `x-api-key: <API_KEY>` salvo `/health`.

### `GET /health`
Liveness probe, sin auth. Responde `{ ok: true }`.

### `GET /sessions`
Lista todas las sesiones actualmente cargadas en memoria.

### `GET /sessions/:workspaceId/status`
Estado agregado (memoria + DB fallback).

### `GET /sessions/:workspaceId/qr`
QR como PNG dataURL (`data:image/png;base64,...`). Devuelve `{ qr: null }` si
ya está autenticado.

### `POST /sessions/:workspaceId/start`
Arranca la sesión (fire-and-forget). Responde al instante; el init de Puppeteer
toma 30–90 s en frío. El cliente debe hacer polling a `/status` + `/qr`.

### `POST /sessions/:workspaceId/logout`
Logout real: envía señal de unlink a los servidores de WhatsApp, borra la
carpeta local de `LocalAuth` y destruye Chromium. Re-pairing requiere nuevo QR.

### `POST /send-message`
Body: `{ workspaceId, phone, message }`.

### `POST /send-media`
Body: `{ workspaceId, phone, message, mediaUrl }`.

### `POST /send-document`
Body: `{ workspaceId, phone, message, base64, filename, mimetype }`.

Cuando no hay sesión conectada, los endpoints de envío responden `503` con
`{ fallback: true }` para que el caller degrade a un canal alterno.

---

## Cómo parear un número

1. `POST /sessions/<workspaceId>/start` con el `x-api-key`.
2. Polling: `GET /sessions/<workspaceId>/qr` cada 3–5 s.
3. Cuando la respuesta trae `qr: "data:image/png;base64,..."`, renderízalo y
   escanéalo desde **WhatsApp > Dispositivos vinculados** en el teléfono.
4. Verifica con `GET /sessions/<workspaceId>/status` que `isConnected: true`.

La sesión vive en el volumen montado en `/app/data/wwebjs_auth` — sobrevive
redeploys mientras el volumen no se borre.

---

## Troubleshooting Chromium

- **"The profile appears to be in use by another Chromium process"**
  Queda un `SingletonLock` de un Chrome anterior. El `CMD` del Dockerfile y
  `WhatsAppSession.js` los barren al arrancar, pero si persiste:
  `find /app/data/wwebjs_auth -name 'Singleton*' -delete`.

- **`client.initialize() timed out after 120s`**
  Casi siempre falta algún `.so` de X/Chromium. El Dockerfile ya instala los
  paquetes de Debian necesarios (libnss3, libatk…, libgbm1, libxss1, etc.).
  Si corres fuera de Docker, instala esas libs en tu SO.

- **Auth falla después de pegar QR**
  WhatsApp rota la versión de Web; el bot pinea una versión conocida en
  `webVersionCache`. Si dejó de funcionar, actualiza el URL al último HTML en
  [`wppconnect-team/wa-version`](https://github.com/wppconnect-team/wa-version/tree/main/html).

- **`window.Debug.VERSION` nunca aparece / cuelga sin errores**
  Es el bug del override de `Error` en versiones modernas de WA Web. El script
  `patch-wwebjs.cjs` lo desactiva en tiempo de instalación — verifica que
  corrió en el `docker build` (busca "✅ Patched Client.js" en los logs).

- **Memoria creciendo sin parar**
  El `memory watchdog` mata el proceso si RSS > 1.5 GB durante 5 ciclos de 1
  min. Docker/Swarm lo reinicia y el volumen rehidrata la sesión.

---

## Estructura

```
apps/whatsapp-bot/
├── Dockerfile            # node:20-bookworm + chromium + pnpm
├── package.json          # @cedgym/whatsapp-bot
├── patch-wwebjs.cjs      # parche al Client.js de whatsapp-web.js
├── README.md
└── src/
    ├── index.js          # Express, self-heal, memory watchdog, shutdown
    ├── SessionManager.js # Map<workspaceId, WhatsAppSession> + locks
    ├── WhatsAppSession.js# Wrapper de whatsapp-web.js Client + LocalAuth
    └── routes/
        ├── sessions.js   # start/logout/status/qr/list
        └── messages.js   # send-message / send-media / send-document
```
