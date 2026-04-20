// ─────────────────────────────────────────────────────────────────
// Admin: WhatsApp bot proxy.
//
// The bot runs as a separate container (apps/whatsapp-bot). These
// endpoints proxy calls to it so the admin UI can pair and manage
// the session without exposing the bot's internal API key.
//
//   GET   /admin/whatsapp/status
//   GET   /admin/whatsapp/qr
//   POST  /admin/whatsapp/start
//   POST  /admin/whatsapp/logout
// ─────────────────────────────────────────────────────────────────

const BOT_URL = process.env.WHATSAPP_BOT_URL || 'http://localhost:3002';
const BOT_KEY = process.env.WHATSAPP_BOT_KEY || '';

async function botFetch(path, init = {}) {
  const res = await fetch(`${BOT_URL}${path}`, {
    ...init,
    headers: {
      'x-api-key': BOT_KEY,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: { raw: text } };
  }
}

export default async function adminWhatsAppRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] };

  fastify.get('/admin/whatsapp/status', guard, async (req, reply) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    try {
      const { status, body } = await botFetch(`/sessions/${workspaceId}/status`);
      if (status >= 400) {
        const ws = await fastify.prisma.whatsAppSession.findUnique({
          where: { workspace_id: workspaceId },
        });
        return {
          is_connected: !!ws?.is_connected,
          initializing: !!ws?.initializing,
          phone_number: ws?.phone_number ?? null,
          last_heartbeat: ws?.last_heartbeat ?? null,
          source: 'db',
        };
      }
      // Normalize bot camelCase → snake_case for the UI
      return {
        is_connected: !!body.isConnected,
        initializing: !!body.initializing,
        phone_number: body.phoneNumber ?? null,
        pushname: body.pushname ?? null,
        platform: body.platform ?? null,
        has_qr: !!body.qr,
        last_heartbeat: body.lastReadyAt ?? null,
        last_error: body.lastError ?? null,
        source: 'bot',
      };
    } catch (err) {
      fastify.log.warn({ err: err.message }, 'bot unreachable');
      return { is_connected: false, initializing: false, phone_number: null, source: 'error' };
    }
  });

  fastify.get('/admin/whatsapp/qr', guard, async (req) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    try {
      const { body } = await botFetch(`/sessions/${workspaceId}/qr`);
      return body;
    } catch {
      return { qr: null };
    }
  });

  fastify.post('/admin/whatsapp/start', guard, async (req) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    // Limpia QR obsoleto antes de re-iniciar. Si hay un QR en DB de una sesión
    // anterior que ya expiró, no queremos que el GET /qr lo devuelva mientras
    // el bot genera el nuevo.
    await fastify.prisma.whatsAppSession.updateMany({
      where: { workspace_id: workspaceId, is_connected: false },
      data: { qr_data: null },
    }).catch(() => {});
    const { body } = await botFetch(`/sessions/${workspaceId}/start`, { method: 'POST' });
    return body;
  });

  fastify.post('/admin/whatsapp/logout', guard, async (req) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    const { body } = await botFetch(`/sessions/${workspaceId}/logout`, { method: 'POST' });
    return body;
  });
}
