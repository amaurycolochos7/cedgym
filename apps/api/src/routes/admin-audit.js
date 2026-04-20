// ─────────────────────────────────────────────────────────────────
// Admin: lectura del audit log (solo SUPERADMIN).
//
//   GET /admin/audit?limit=200&action=&actor=&target=
//
// Devuelve las últimas N filas de audit_logs del workspace, con el
// nombre del actor resuelto (JOIN a users para no obligar al frontend
// a hacer un segundo request).
// ─────────────────────────────────────────────────────────────────
import { z } from 'zod';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  action: z.string().trim().min(1).max(100).optional(),
  actor: z.string().trim().min(1).max(100).optional(), // matches actor_id or actor name
  target: z.string().trim().min(1).max(100).optional(),
});

export default async function adminAuditRoutes(fastify) {
  const { prisma } = fastify;
  const guard = {
    preHandler: [fastify.authenticate, fastify.requireRole('SUPERADMIN')],
  };

  fastify.get('/admin/audit', guard, async (req, reply) => {
    const parsed = listQuery.safeParse(req.query || {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'BAD_QUERY', message: parsed.error.message },
        statusCode: 400,
      });
    }
    const { limit, action, actor, target } = parsed.data;
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;

    const where = { workspace_id: workspaceId };
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (target) where.target_id = { contains: target, mode: 'insensitive' };
    if (actor) where.actor_id = { contains: actor, mode: 'insensitive' };

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
    });

    // Batch-resolve actor names (avoid N+1).
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, full_name: true, email: true, role: true },
        })
      : [];
    const actorMap = new Map(actors.map((u) => [u.id, u]));

    const items = rows.map((r) => ({
      id: r.id,
      action: r.action,
      actor_id: r.actor_id,
      actor_name: r.actor_id
        ? actorMap.get(r.actor_id)?.full_name ||
          actorMap.get(r.actor_id)?.name ||
          actorMap.get(r.actor_id)?.email ||
          r.actor_id
        : 'sistema',
      actor_role: r.actor_id ? actorMap.get(r.actor_id)?.role || null : null,
      target_type: r.target_type,
      target_id: r.target_id,
      metadata: r.metadata,
      ip_address: r.ip_address,
      user_agent: r.user_agent,
      created_at: r.created_at,
    }));

    return { items, total: items.length, limit };
  });
}
