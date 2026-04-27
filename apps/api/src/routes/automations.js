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
import { assertWorkspaceAccess, loadInWorkspace } from '../lib/tenant-guard.js';

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
// Thin wrapper over the central tenant guard. Kept async so
// existing callers (await adminWorkspaceId(...)) compile unchanged.
// Pre-fix this read workspace_id from the DB and fell back to
// fastify.defaultWorkspaceId — letting any session without a
// workspace_id silently operate on the system workspace. The
// guard refuses such sessions with 403.
async function adminWorkspaceId(_fastify, req) {
    return assertWorkspaceAccess(req);
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

    // ─── POST /admin/automations/ensure-defaults ────────────────
    // Idempotent: creates the out-of-the-box automations
    // (payment.approved welcome, member.created drip, etc.) for the
    // caller's workspace if they're missing. Safe to re-run — existing
    // rows are left untouched. Returns what was created vs. skipped.
    fastify.post('/admin/automations/ensure-defaults', guard, async (req) => {
        const ws = await adminWorkspaceId(fastify, req);

        // Minimal subset that covers the "¡Bienvenid@!" flow. Each entry
        // lists the template we need and the automation wiring. We create
        // the MessageTemplate row if missing so a single click unblocks
        // the whole flow — no separate seed step required.
        const defaults = [
            {
                name: 'Pago confirmado',
                trigger: 'payment.approved',
                action: 'whatsapp.send_template',
                template: {
                    code: 'payment.approved',
                    name: 'Pago confirmado',
                    channel: 'WHATSAPP',
                    body: '✅ *CED-GYM*\n\nPago confirmado, {nombre}.\nTu membresía *{plan}* está activa hasta *{fecha_venc}*.\n\nTu QR de acceso: {qr_url}',
                },
                delay_minutes: 0,
            },
            {
                name: 'Bienvenida al activar membresía',
                trigger: 'member.verified',
                action: 'whatsapp.send_template',
                template: {
                    code: 'member.created',
                    name: 'Bienvenida nuevo miembro',
                    channel: 'WHATSAPP',
                    body: '👋 ¡Bienvenido a *CED-GYM*, {nombre}!\n\nYa puedes acceder al gym con tu QR dinámico:\n{qr_url}\n\nTu portal: {link_portal}',
                },
                delay_minutes: 0,
            },
        ];

        const created = [];
        const skipped = [];
        const missingTemplates = [];

        for (const def of defaults) {
            try {
                // Ensure the MessageTemplate exists. Create it if missing so
                // the admin gets a working pipeline in one click — they can
                // tweak the copy later from the templates admin UI.
                let tpl = await prisma.messageTemplate.findFirst({
                    where: { workspace_id: ws, code: def.template.code },
                    select: { id: true },
                });
                if (!tpl) {
                    try {
                        tpl = await prisma.messageTemplate.create({
                            data: {
                                workspace_id: ws,
                                code: def.template.code,
                                name: def.template.name,
                                channel: def.template.channel,
                                body: def.template.body,
                            },
                            select: { id: true },
                        });
                    } catch (e) {
                        fastify.log.error(
                            { err: e, code: def.template.code },
                            '[automations/ensure-defaults] could not seed template',
                        );
                        missingTemplates.push(def.template.code);
                        continue;
                    }
                }
                // Dedup by trigger + action within the workspace. JSON path
                // filters can misbehave across Prisma versions, so we pull
                // candidate rows in-memory and compare params.template_id.
                const candidates = await prisma.automation.findMany({
                    where: {
                        workspace_id: ws,
                        trigger: def.trigger,
                        action: def.action,
                    },
                    select: { id: true, params: true },
                });
                const duplicate = candidates.find(
                    (c) => c.params && c.params.template_id === tpl.id,
                );
                if (duplicate) {
                    skipped.push({ trigger: def.trigger, id: duplicate.id });
                    continue;
                }
                const row = await prisma.automation.create({
                    data: {
                        workspace_id: ws,
                        name: def.name,
                        trigger: def.trigger,
                        action: def.action,
                        enabled: true,
                        filter: null,
                        delay_minutes: def.delay_minutes,
                        params: { template_id: tpl.id, to: 'member' },
                    },
                });
                created.push({ trigger: def.trigger, id: row.id });
            } catch (e) {
                fastify.log.error(
                    { err: e, def },
                    '[automations/ensure-defaults] failed to provision one automation',
                );
            }
        }

        return { created, skipped, missing_templates: missingTemplates };
    });

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

        // findFirst with workspace_id in the WHERE — replaces the
        // findUnique-then-check pattern that allowed a tiny race
        // window between the read and the write.
        const existing = await loadInWorkspace(prisma, 'automation', { id: req.params.id }, ws);
        if (!existing) throw err('NOT_FOUND', 'Automation no encontrada', 404);

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
        const existing = await loadInWorkspace(prisma, 'automation', { id: req.params.id }, ws);
        if (!existing) throw err('NOT_FOUND', 'Automation no encontrada', 404);
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
        const automation = await loadInWorkspace(prisma, 'automation', { id: req.params.id }, ws);
        if (!automation) throw err('NOT_FOUND', 'Automation no encontrada', 404);

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
        const existing = await loadInWorkspace(prisma, 'automation', { id: req.params.id }, ws);
        if (!existing) throw err('NOT_FOUND', 'Automation no encontrada', 404);
        const jobs = await prisma.automationJob.findMany({
            where: { automation_id: req.params.id },
            orderBy: { created_at: 'desc' },
            take: 100,
        });
        return { jobs };
    });
}
