// ─────────────────────────────────────────────────────────────────
// Admin: campañas de WhatsApp masivas (reactivación, etc).
//
//   GET  /admin/memberships/expired      — socios con membresía vencida
//   POST /admin/campaigns/whatsapp-bulk  — encola envíos (2 s de spacing)
//
// El envío real se delega al bot (apps/whatsapp-bot). Para respetar
// el rate-limit natural de WhatsApp Web cada job se programa con
// 2 segundos de separación (scheduled_at). El worker de automations
// los consume en orden.
// ─────────────────────────────────────────────────────────────────
import { z } from 'zod';
import dayjs from 'dayjs';
import { audit, auditCtx } from '../lib/audit.js';

const bulkBody = z.object({
  user_ids: z.array(z.string().min(1)).min(1).max(500),
  message_template: z.string().trim().min(10).max(2000),
});

const DEFAULT_TEMPLATE = [
  'Hola {nombre} 👋',
  '',
  'Te extrañamos en CED·GYM 💪. Tu plan venció hace {dias} días — es momento de volver.',
  '',
  '📣 *Promoción exclusiva*: 15% off en tu renovación si activas hoy.',
  '',
  '👉 https://cedgym.187-77-11-79.sslip.io/planes',
].join('\n');

// Reemplaza {nombre} y {dias} en la plantilla.
function renderTemplate(tpl, ctx) {
  return tpl
    .replaceAll('{nombre}', ctx.nombre || 'atleta')
    .replaceAll('{dias}', String(ctx.dias ?? 0))
    .replaceAll('{plan}', ctx.plan || '')
    .replaceAll('{gym}', 'CED·GYM');
}

export default async function adminCampaignsRoutes(fastify) {
  const { prisma } = fastify;
  // Reception can VIEW expired list, but only ADMIN/SUPERADMIN can fire
  // bulk WhatsApp campaigns (abuse blast radius is too high otherwise).
  const guard = {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('ADMIN', 'SUPERADMIN', 'RECEPTIONIST'),
    ],
  };
  const adminOnly = {
    preHandler: [
      fastify.authenticate,
      fastify.requireRole('ADMIN', 'SUPERADMIN'),
    ],
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  };

  // ─── GET /admin/memberships/expired ────────────────────────────
  fastify.get('/admin/memberships/expired', guard, async (req) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    const now = new Date();

    // Last membership por usuario donde status='EXPIRED' o expires_at<now().
    // Membership tiene user_id único, así que un solo findMany basta.
    const rows = await prisma.membership.findMany({
      where: {
        workspace_id: workspaceId,
        OR: [
          { status: 'EXPIRED' },
          { expires_at: { lt: now } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            full_name: true,
            email: true,
            phone: true,
            status: true,
          },
        },
      },
      orderBy: { expires_at: 'desc' },
      take: 500,
    });

    const items = rows
      .filter((r) => r.user && r.user.phone)
      .map((r) => {
        const expiresAt = r.expires_at ? dayjs(r.expires_at) : null;
        const daysSince = expiresAt ? Math.max(0, dayjs().diff(expiresAt, 'day')) : 0;
        return {
          user_id: r.user.id,
          name: r.user.full_name || r.user.name || '—',
          phone: r.user.phone,
          email: r.user.email,
          plan: r.plan,
          billing_cycle: r.billing_cycle,
          expires_at: r.expires_at,
          days_since_expiry: daysSince,
          status: r.status,
        };
      });

    return { items, total: items.length, template: DEFAULT_TEMPLATE };
  });

  // ─── POST /admin/campaigns/whatsapp-bulk ───────────────────────
  // Encola N jobs (uno por usuario) con 2 s de separación.
  fastify.post('/admin/campaigns/whatsapp-bulk', adminOnly, async (req, reply) => {
    const parsed = bulkBody.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'BAD_BODY', message: parsed.error.message },
        statusCode: 400,
      });
    }
    const { user_ids, message_template } = parsed.data;
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    const actorId = req.user?.sub || req.user?.id || null;

    // Pull users + their membership info for rendering the template.
    const users = await prisma.user.findMany({
      where: { id: { in: user_ids }, workspace_id: workspaceId },
      include: { membership: true },
    });

    if (users.length === 0) {
      return reply.status(404).send({
        error: { code: 'NO_USERS', message: 'No se encontraron usuarios' },
        statusCode: 404,
      });
    }

    // Ad-hoc automation row so we can attach jobs to it. Reusamos la tabla
    // Automation existente (no queremos un segundo sistema de colas).
    const campaign = await prisma.automation.create({
      data: {
        workspace_id: workspaceId,
        name: `Campaña reactivación ${dayjs().format('YYYY-MM-DD HH:mm')}`,
        trigger: 'manual.bulk',
        delay_minutes: 0,
        action: 'whatsapp.send',
        params: { template: message_template, source: 'admin-campaigns' },
        enabled: false, // disabled: it's one-shot, no re-firing
      },
    });

    const now = Date.now();
    const jobs = users
      .filter((u) => u.phone)
      .map((u, i) => {
        const daysSince = u.membership?.expires_at
          ? Math.max(0, dayjs().diff(dayjs(u.membership.expires_at), 'day'))
          : 0;
        const body = renderTemplate(message_template, {
          nombre: u.full_name || u.name || 'atleta',
          dias: daysSince,
          plan: u.membership?.plan || '',
        });
        return {
          workspace_id: workspaceId,
          automation_id: campaign.id,
          trigger_event: 'manual.bulk',
          context: {
            user_id: u.id,
            phone: u.phone,
            body,
            channel: 'whatsapp',
          },
          // 2 seconds apart to avoid WhatsApp Web rate-limit.
          scheduled_at: new Date(now + i * 2000),
          status: 'PENDING',
        };
      });

    if (jobs.length === 0) {
      return reply.status(400).send({
        error: { code: 'NO_PHONES', message: 'Ningún usuario tiene teléfono registrado' },
        statusCode: 400,
      });
    }

    await prisma.automationJob.createMany({ data: jobs });

    await audit(fastify, {
      workspace_id: workspaceId,
      actor_id: actorId,
      action: 'campaign.whatsapp_bulk.enqueued',
      target_type: 'automation',
      target_id: campaign.id,
      metadata: {
        count: jobs.length,
        template_preview: message_template.slice(0, 120),
        actor_role: req.user?.role || null,
      },
      ...auditCtx(req),
    });

    return {
      ok: true,
      campaign_id: campaign.id,
      enqueued: jobs.length,
      first_run_at: jobs[0].scheduled_at,
      last_run_at: jobs[jobs.length - 1].scheduled_at,
    };
  });
}
