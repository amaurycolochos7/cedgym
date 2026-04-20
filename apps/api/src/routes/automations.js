// ─────────────────────────────────────────────────────────────────
// Admin CRUD for automations + AutomationJob logs.
//
// Admin:
//   GET    /admin/automations
//   POST   /admin/automations
//   PATCH  /admin/automations/:id
//   DELETE /admin/automations/:id         (cascade deletes jobs)
//   POST   /admin/automations/:id/test    (fires to admin's phone)
//   GET    /admin/automations/:id/jobs    (last 100)
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { renderTemplate } from '../lib/template-renderer.js';

const KNOWN_TRIGGERS = [
    'membership.expiring_soon',
    'membership.expired',
    'membership.renewed',
    'membership.frozen',
    'membership.freeze_requested',
    'membership.canceled',
    'payment.approved',
    'payment.rejected',
    'member.created',
    'member.verified',
    'member.checked_in',
    'member.birthday',
    'checkin.first_of_week',
    'inactivity.14_days',
    'course.enrolled',
    'product.purchased',
    'product.review_request',
    'gamification.badge_unlocked',
    'gamification.streak_break_warning',
    'referral.reward_granted',
    'class.reminder_2h',
    'class.cancellation_alert',
    'measurement.reminder',
    'auth.otp_register',
    'auth.password_reset',
];

const ACTIONS = ['whatsapp.send_template', 'push.notify', 'email.send'];

const createBody = z.object({
    name: z.string().trim().min(2).max(120),
    trigger: z.string().trim().min(3).max(80),
    filter: z.record(z.any()).nullable().optional(),
    delay_minutes: z.number().int().min(-1440).max(1440 * 30).default(0),
    action: z.enum(ACTIONS),
    params: z.record(z.any()),
    enabled: z.boolean().default(true),
});

const patchBody = createBody.partial();

const listQuery = z.object({
    trigger: z.string().optional(),
    enabled: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

const testBody = z.object({
    context: z.record(z.any()).optional(),
    // Optional override — if omitted we try the current admin's phone.
    phone: z
        .string()
        .regex(/^\+\d{10,15}$/)
        .optional(),
});

// ─────────────────────────────────────────────────────────────
async function adminWorkspaceId(fastify, req) {
    const userId = req.user.sub || req.user.id;
    const admin = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { workspace_id: true },
    });
    return admin?.workspace_id || fastify.defaultWorkspaceId;
}

async function sendWhatsAppTest(fastify, { phone, message }) {
    const botUrl = process.env.WHATSAPP_BOT_URL || 'http://whatsapp-bot:3002';
    const apiKey = process.env.WHATSAPP_BOT_KEY || '';
    const res = await fetch(`${botUrl}/send-message`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
        },
        body: JSON.stringify({ phone, message }),
    }).catch((e) => {
        fastify.log.warn({ err: e.message }, '[automations/test] bot unreachable');
        return null;
    });
    if (!res) return { ok: false, error: 'BOT_UNREACHABLE' };
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: `BOT_${res.status}`, body: body.slice(0, 200) };
    }
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────
export default async function automationsRoutes(fastify) {
    const { prisma } = fastify;

    const guard = {
        preHandler: [
            fastify.authenticate,
            fastify.requireRole('ADMIN', 'SUPERADMIN'),
        ],
    };

    // ─── GET /admin/automations ─────────────────────────────────
    fastify.get('/admin/automations', guard, async (req) => {
        const parsed = listQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const { trigger, enabled, page, limit } = parsed.data;
        const ws = await adminWorkspaceId(fastify, req);

        const where = { workspace_id: ws };
        if (trigger) where.trigger = trigger;
        if (enabled !== undefined) where.enabled = enabled === 'true';

        const [total, rows] = await Promise.all([
            prisma.automation.count({ where }),
            prisma.automation.findMany({
                where,
                orderBy: [{ trigger: 'asc' }, { created_at: 'asc' }],
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);
        return {
            total,
            page,
            limit,
            pages: Math.max(1, Math.ceil(total / limit)),
            known_triggers: KNOWN_TRIGGERS,
            actions: ACTIONS,
            automations: rows,
        };
    });

    // ─── POST /admin/automations ────────────────────────────────
    fastify.post('/admin/automations', guard, async (req) => {
        const parsed = createBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const ws = await adminWorkspaceId(fastify, req);
        const created = await prisma.automation.create({
            data: {
                workspace_id: ws,
                name: parsed.data.name,
                trigger: parsed.data.trigger,
                filter: parsed.data.filter ?? null,
                delay_minutes: parsed.data.delay_minutes,
                action: parsed.data.action,
                params: parsed.data.params,
                enabled: parsed.data.enabled,
            },
        });
        return { automation: created };
    });

    // ─── PATCH /admin/automations/:id ───────────────────────────
    fastify.patch('/admin/automations/:id', guard, async (req) => {
        const parsed = patchBody.safeParse(req.body || {});
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const ws = await adminWorkspaceId(fastify, req);

        const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.workspace_id !== ws) {
            throw err('NOT_FOUND', 'Automation no encontrada', 404);
        }
        const updated = await prisma.automation.update({
            where: { id: req.params.id },
            data: { ...parsed.data },
        });
        return { automation: updated };
    });

    // ─── DELETE /admin/automations/:id ──────────────────────────
    // Cascade wipes AutomationJob rows (schema onDelete: Cascade).
    fastify.delete('/admin/automations/:id', guard, async (req) => {
        const ws = await adminWorkspaceId(fastify, req);
        const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.workspace_id !== ws) {
            throw err('NOT_FOUND', 'Automation no encontrada', 404);
        }
        await prisma.automation.delete({ where: { id: req.params.id } });
        return { deleted: true };
    });

    // ─── POST /admin/automations/:id/test ───────────────────────
    //
    // Renders the template referenced by the automation against the
    // provided context and sends it directly to the admin's phone
    // (or an explicit override). Does NOT touch AutomationJob — it's
    // an out-of-band test.
    fastify.post('/admin/automations/:id/test', guard, async (req, reply) => {
        const parsed = testBody.safeParse(req.body || {});
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

        const ws = await adminWorkspaceId(fastify, req);
        const automation = await prisma.automation.findUnique({ where: { id: req.params.id } });
        if (!automation || automation.workspace_id !== ws) {
            throw err('NOT_FOUND', 'Automation no encontrada', 404);
        }

        const adminId = req.user.sub || req.user.id;
        const admin = await prisma.user.findUnique({
            where: { id: adminId },
            select: { phone: true },
        });
        const phone = parsed.data.phone || admin?.phone;
        if (!phone) {
            throw err('NO_PHONE', 'No hay teléfono destino (admin sin phone y sin override)', 400);
        }

        const context = { ...(parsed.data.context || {}), workspace_id: ws };

        if (automation.action === 'whatsapp.send_template') {
            const templateId = automation.params?.template_id;
            if (!templateId) {
                return reply.status(400).send({
                    error: { code: 'NO_TEMPLATE', message: 'params.template_id ausente' },
                    statusCode: 400,
                });
            }
            const template = await prisma.messageTemplate.findUnique({ where: { id: templateId } });
            if (!template) {
                return reply.status(400).send({
                    error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template no existe' },
                    statusCode: 400,
                });
            }
            const message = await renderTemplate(template.body, context);
            const sendResult = await sendWhatsAppTest(fastify, { phone, message });
            return {
                action: 'whatsapp.send_template',
                phone,
                message_preview: message,
                send: sendResult,
            };
        }

        if (automation.action === 'push.notify' || automation.action === 'email.send') {
            return {
                action: automation.action,
                phone,
                note: 'Stub: canal aún no integrado (FCM / Resend pendientes).',
                context,
            };
        }

        return reply.status(400).send({
            error: { code: 'UNKNOWN_ACTION', message: `Acción "${automation.action}" no soportada` },
            statusCode: 400,
        });
    });

    // ─── GET /admin/automations/:id/jobs ────────────────────────
    fastify.get('/admin/automations/:id/jobs', guard, async (req) => {
        const ws = await adminWorkspaceId(fastify, req);
        const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.workspace_id !== ws) {
            throw err('NOT_FOUND', 'Automation no encontrada', 404);
        }
        const jobs = await prisma.automationJob.findMany({
            where: { automation_id: req.params.id },
            orderBy: { created_at: 'desc' },
            take: 100,
        });
        return { jobs };
    });
}
