// ─────────────────────────────────────────────────────────────────
// Admin CRUD for MessageTemplate + preview renderer.
//
//   GET    /admin/templates
//   POST   /admin/templates
//   PATCH  /admin/templates/:id
//   DELETE /admin/templates/:id
//   POST   /admin/templates/:id/preview    { context } → rendered string
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { renderTemplate } from '../lib/template-renderer.js';
import { assertWorkspaceAccess, loadInWorkspace } from '../lib/tenant-guard.js';

const createBody = z.object({
    code: z.string().trim().min(2).max(64).regex(/^[a-z0-9_.-]+$/i, 'code alfanumérico'),
    name: z.string().trim().min(2).max(120),
    body: z.string().trim().min(1).max(4000),
    channel: z.enum(['WHATSAPP', 'PUSH', 'EMAIL', 'SMS']).default('WHATSAPP'),
});

const patchBody = createBody.partial().omit({ code: true });

const listQuery = z.object({
    channel: z.enum(['WHATSAPP', 'PUSH', 'EMAIL', 'SMS']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

const previewBody = z.object({
    context: z.record(z.any()).optional(),
});

// Thin wrapper over the central guard. Replaces the previous
// fastify.defaultWorkspaceId fallback that let workspace-less
// sessions silently operate on the system workspace.
async function adminWorkspaceId(_fastify, req) {
    return assertWorkspaceAccess(req);
}

// ─────────────────────────────────────────────────────────────
export default async function templatesRoutes(fastify) {
    const { prisma } = fastify;

    const guard = {
        preHandler: [
            fastify.authenticate,
            fastify.requireRole('ADMIN', 'SUPERADMIN'),
        ],
    };

    // ─── GET /admin/templates ───────────────────────────────────
    fastify.get('/admin/templates', guard, async (req) => {
        const parsed = listQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const ws = await adminWorkspaceId(fastify, req);
        const where = { workspace_id: ws };
        if (parsed.data.channel) where.channel = parsed.data.channel;

        const [total, rows] = await Promise.all([
            prisma.messageTemplate.count({ where }),
            prisma.messageTemplate.findMany({
                where,
                orderBy: [{ channel: 'asc' }, { code: 'asc' }],
                skip: (parsed.data.page - 1) * parsed.data.limit,
                take: parsed.data.limit,
            }),
        ]);
        return {
            total,
            page: parsed.data.page,
            limit: parsed.data.limit,
            pages: Math.max(1, Math.ceil(total / parsed.data.limit)),
            templates: rows,
        };
    });

    // ─── POST /admin/templates ──────────────────────────────────
    fastify.post('/admin/templates', guard, async (req) => {
        const parsed = createBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const ws = await adminWorkspaceId(fastify, req);

        const existing = await prisma.messageTemplate.findUnique({
            where: { workspace_id_code: { workspace_id: ws, code: parsed.data.code } },
        }).catch(() => null);
        if (existing) throw err('CODE_TAKEN', 'Ya existe un template con ese code', 409);

        const created = await prisma.messageTemplate.create({
            data: { ...parsed.data, workspace_id: ws },
        });
        return { template: created };
    });

    // ─── PATCH /admin/templates/:id ─────────────────────────────
    fastify.patch('/admin/templates/:id', guard, async (req) => {
        const parsed = patchBody.safeParse(req.body || {});
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const ws = await adminWorkspaceId(fastify, req);

        const existing = await loadInWorkspace(prisma, 'messageTemplate', { id: req.params.id }, ws);
        if (!existing) throw err('NOT_FOUND', 'Template no encontrado', 404);
        const updated = await prisma.messageTemplate.update({
            where: { id: req.params.id },
            data: parsed.data,
        });
        return { template: updated };
    });

    // ─── DELETE /admin/templates/:id ────────────────────────────
    fastify.delete('/admin/templates/:id', guard, async (req) => {
        const ws = await adminWorkspaceId(fastify, req);
        const existing = await loadInWorkspace(prisma, 'messageTemplate', { id: req.params.id }, ws);
        if (!existing) throw err('NOT_FOUND', 'Template no encontrado', 404);
        await prisma.messageTemplate.delete({ where: { id: req.params.id } });
        return { deleted: true };
    });

    // ─── POST /admin/templates/:id/preview ──────────────────────
    fastify.post('/admin/templates/:id/preview', guard, async (req) => {
        const parsed = previewBody.safeParse(req.body || {});
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const ws = await adminWorkspaceId(fastify, req);

        const template = await loadInWorkspace(prisma, 'messageTemplate', { id: req.params.id }, ws);
        if (!template) throw err('NOT_FOUND', 'Template no encontrado', 404);
        const context = { ...(parsed.data.context || {}), workspace_id: ws };
        const rendered = await renderTemplate(template.body, context);
        return { rendered, template_body: template.body };
    });
}
