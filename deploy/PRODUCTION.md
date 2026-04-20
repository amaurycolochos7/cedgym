# CED·GYM — Deploy Producción (Dokploy + Vercel + sslip.io)

Supplemento al `DEPLOY.md`. Acá definimos **URLs bonitas sin dominio propio** y
hardening básico de seguridad.

## 1. URLs públicas — sslip.io

`sslip.io` es un servicio DNS wildcard gratis: cualquier subdominio resuelve al
IP embedido. Funciona con Let's Encrypt, es estable, no requiere registro.

Patrón: `<nombre>.<ip-con-guiones>.sslip.io`

Para nuestro server `187.77.11.79`:

| Servicio | URL pública | Target |
|---|---|---|
| API | `https://api.187-77-11-79.sslip.io` | `cedgym-api:3001` |
| Frontend (Vercel) | `https://cedgym.vercel.app` | gestionado por Vercel |
| WhatsApp bot | *no expuesto — sólo red interna* | `cedgym-whatsapp-bot:3002` |
| Dokploy panel | `https://panel.187-77-11-79.sslip.io` (opcional) | Dokploy UI |

> **Nota:** mantener WA bot interno reduce superficie de ataque — sólo `cedgym-api`
> necesita hablarle, y viven en la misma red Docker.

## 2. Configurar dominio en Dokploy (por app)

Para `cedgym-api`:

1. Ir a **Applications → cedgym-api → Domains**.
2. **+ Add Domain**:
   - Host: `api.187-77-11-79.sslip.io`
   - Path: `/`
   - Container port: `3001`
   - HTTPS: **ON**
   - Certificate provider: **Let's Encrypt**
3. Click **Save**. Dokploy dispara la emisión del cert (~30-60s).
4. Verificar: `curl -I https://api.187-77-11-79.sslip.io/health` → `HTTP/2 200`.

**No agregar dominio a `cedgym-whatsapp-bot`.** Queda sólo en red interna.

**Opcional — panel Dokploy con HTTPS:** *(si tu Dokploy está en :3000 por IP)*
1. En Dokploy → **Settings → Server → Domain**: `panel.187-77-11-79.sslip.io`.
2. Re-arrancar Dokploy si pide. Ahora el panel se accede via HTTPS.

## 3. Variables de entorno (copiar de `.secrets.local`)

Todas las envs de cada servicio están listas para copy-paste en
`deploy/.secrets.local` (gitignoreado — ya generado).

Antes de pegar:
- Reemplazar `MP_ACCESS_TOKEN` y `MP_PUBLIC_KEY` con credenciales reales de Mercado Pago.
- Si movés el server a otra IP, regenerar los URLs `sslip.io`.

## 4. Webhook Mercado Pago

URL: `https://api.187-77-11-79.sslip.io/webhooks/mercadopago`
- Secret: el valor de `MP_WEBHOOK_SECRET` de `.secrets.local`.
- Eventos: `payment`, `subscription_preapproval`.

MP **requiere HTTPS** para webhooks de producción — sslip.io + Let's Encrypt lo cubre.

## 5. Vercel (frontend)

Environment Variables (Production + Preview):
```
NEXT_PUBLIC_API_URL=https://api.187-77-11-79.sslip.io
NEXT_PUBLIC_MP_PUBLIC_KEY=<MP_PUBLIC_KEY>
```

Tras primer deploy, agregar la URL de Vercel a `CORS_ORIGINS` en `cedgym-api` y
**Redeploy** API.

## 6. Hardening de seguridad (SSH al VPS)

Ejecutar **una sola vez** después del primer deploy:

```bash
ssh root@187.77.11.79

# 6.1 Firewall — sólo dejar pasar SSH, HTTP, HTTPS y Dokploy
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp                 # SSH
ufw allow 80/tcp                 # HTTP (Traefik)
ufw allow 443/tcp                # HTTPS (Traefik)
ufw allow 3000/tcp               # Dokploy panel (opcional si ya usás dominio)
ufw --force enable
ufw status verbose

# 6.2 fail2ban (anti brute-force SSH)
apt-get update && apt-get install -y fail2ban
systemctl enable --now fail2ban
fail2ban-client status sshd

# 6.3 Unattended security upgrades
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

# 6.4 Deshabilitar login root por SSH a futuro (opcional — crear user antes)
# adduser cedgym && usermod -aG sudo,docker cedgym
# copiar ~/.ssh/authorized_keys al user nuevo
# editar /etc/ssh/sshd_config:
#   PermitRootLogin no
#   PasswordAuthentication no
# systemctl reload ssh

# 6.5 Rotar password admin de Dokploy
# Ir a https://panel.187-77-11-79.sslip.io → Profile → Change password
```

> **Si cerrás puertos:** nunca cierres 80/443 mientras Dokploy/Let's Encrypt
> esté emitiendo certificados. El challenge HTTP-01 necesita el 80 abierto.

## 7. Backups automáticos Postgres

Opción A — Dokploy built-in:
1. `cedgym-db → Backups → + Create`.
2. Schedule: `0 3 * * *` (diario 3am).
3. Retention: 7 días.
4. Destination: S3 / Backblaze / local volume.

Opción B — cron manual (si no tenés S3):
```bash
# en /etc/cron.daily/cedgym-db-backup.sh
#!/bin/bash
DATE=$(date +%Y%m%d)
docker exec cedgym-db pg_dump -U cedgym cedgym | gzip > /root/backups/cedgym-$DATE.sql.gz
find /root/backups/ -type f -mtime +7 -delete
```
```bash
chmod +x /etc/cron.daily/cedgym-db-backup.sh
mkdir -p /root/backups
```

## 8. Monitoreo mínimo

- `docker ps` y `docker stats` — chequeo rápido manual.
- `journalctl -u docker -f` — ver eventos Docker.
- Dokploy tiene logs por app en la UI.
- Alertas (opcional): UptimeRobot gratis apuntando a `https://api.187-77-11-79.sslip.io/health` cada 5 min.

## 9. Checklist post-deploy

- [ ] `https://api.187-77-11-79.sslip.io/health` responde 200
- [ ] `https://cedgym.vercel.app/` carga sin errores de CORS
- [ ] Login funciona (probar con `admin@cedgym.mx`)
- [ ] WhatsApp QR disponible (desde admin UI)
- [ ] Webhook MP validado con "Simular notificación"
- [ ] Backup DB verificado (restaurar un dump en local al menos una vez)
- [ ] Firewall activo (`ufw status`)
- [ ] fail2ban activo (`systemctl status fail2ban`)
- [ ] Password Dokploy rotado
