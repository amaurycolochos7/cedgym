# CED-GYM — Modo desarrollo híbrido

## Qué es
- **Frontend (Next.js)** corre en tu máquina: `http://localhost:3000`
- **Backend (API + WA bot + DB + worker)** corre en producción: `https://api.187-77-11-79.sslip.io`
- Editás `.tsx` → browser recarga al instante, sin rebuild Docker.

## Cómo correr
```bash
cd c:/Users/Amaury/.gemini/antigravity/scratch/cedgym
pnpm install                            # una sola vez
pnpm --filter @cedgym/web dev -- -p 3030
# abre http://localhost:3030
```

> **Por qué 3030**: el puerto 3000 ya está ocupado por otro proyecto local tuyo.
> `3030` está agregado a `CORS_ORIGINS` del API de producción.

Loguéate con `admin@cedgym.mx` / `CedGym2026!` (o usuarios demo `Demo2026!`).

## Cómo subir a prod cuando estés conforme
```bash
git add -A
git commit -m "mensaje descriptivo"
git push origin main
# Dokploy auto-deploya en ~1 min (cache de Docker = rápido)
```

## Qué NO corre en local
- API / WhatsApp bot / Redis / Postgres: todo vive en el VPS.
- La sesión de WA sigue conectada con `+52 1 562 961 0819`.
- Los envíos WA y los jobs del worker ocurren en prod (impacto real).

## Tips
- Si cambiás env vars en `apps/web/.env.local`, reiniciá `pnpm dev`.
- Para hits a admin endpoints, abrí DevTools → Network para inspeccionar shape de responses — si algo se rompe en un endpoint admin, casi siempre es un mismatch UI-vs-API que se arregla en `apps/web/lib/admin-api.ts`.
- Para ver logs del API en tiempo real:
  ```bash
  SSH_PASS='Jomoponse-1+' python deploy/_ssh_runner.py <<< "docker logs -f compose-index-wireless-monitor-gscocg-api-1 --tail 50"
  ```
