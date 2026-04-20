#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# CED-GYM — Server hardening (run UNA vez en el VPS).
#
# Uso:  ssh root@187.77.11.79 'bash -s' < deploy/harden-server.sh
#       o SSH al server y pegar el contenido.
#
# Idempotente: se puede correr varias veces sin romper nada.
# ═══════════════════════════════════════════════════════════════

set -e

echo "▶ 1/5  Firewall (ufw)…"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp  comment 'SSH'
ufw allow 80/tcp  comment 'HTTP Traefik'
ufw allow 443/tcp comment 'HTTPS Traefik'
ufw allow 3000/tcp comment 'Dokploy panel'
ufw --force enable
ufw status verbose

echo "▶ 2/5  fail2ban…"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban
systemctl enable --now fail2ban
cat >/etc/fail2ban/jail.d/cedgym.conf <<'JAIL'
[sshd]
enabled = true
maxretry = 3
bantime = 3600
findtime = 600
JAIL
systemctl restart fail2ban
fail2ban-client status sshd || true

echo "▶ 3/5  Unattended security upgrades…"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades
echo 'APT::Periodic::Update-Package-Lists "1";' > /etc/apt/apt.conf.d/20auto-upgrades
echo 'APT::Periodic::Unattended-Upgrade "1";'   >> /etc/apt/apt.conf.d/20auto-upgrades

echo "▶ 4/5  Directorio de backups Postgres…"
mkdir -p /root/backups
cat >/etc/cron.daily/cedgym-db-backup <<'CRON'
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M)
if docker ps --format '{{.Names}}' | grep -q '^cedgym-db$'; then
  docker exec cedgym-db pg_dump -U cedgym cedgym | gzip > /root/backups/cedgym-$DATE.sql.gz
  find /root/backups/ -type f -name 'cedgym-*.sql.gz' -mtime +7 -delete
fi
CRON
chmod +x /etc/cron.daily/cedgym-db-backup
echo "  → dump diario en /root/backups/cedgym-*.sql.gz (retención 7 días)"

echo "▶ 5/5  Estado final…"
echo "  UFW:"
ufw status | head -12
echo "  fail2ban:"
systemctl is-active fail2ban
echo "  Docker:"
docker --version 2>/dev/null || echo "  (Docker no instalado — instalá Docker antes del deploy)"

echo ""
echo "✅  Hardening aplicado."
echo ""
echo "Siguiente paso manual: en https://panel.187-77-11-79.sslip.io"
echo "  → Profile → Change password  (rotar el admin default)."
