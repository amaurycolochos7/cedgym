// ─────────────────────────────────────────────────────────────────
// Admin list endpoints. The author-facing `/courses` route filters
// to `published=true` — fine for members, useless for admin
// dashboards. This module adds:
//
//   GET /admin/courses                — every course in the workspace
//
// GET-only; every existing write path (POST/PATCH/DELETE) keeps
// living in `routes/courses.js`.
// ─────────────────────────────────────────────────────────────────

import { err } from '../lib/errors.js';

export default async function adminListingsRoutes(fastify) {
  const { prisma } = fastify;

  const adminGuard = {
    preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')],
  };

  // ─── GET /admin/courses ───────────────────────────────────────
  //
  // Returns every course in the admin's workspace. Includes
  // `trainer_name` and `enrolled_count` so the admin grid can render
  // without follow-up requests.
  fastify.get('/admin/courses', adminGuard, async (req) => {
    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

    const rows = await prisma.course.findMany({
      where: { workspace_id },
      orderBy: { starts_at: 'desc' },
    });

    // Look up trainer names separately (no FK relation on Course).
    const trainerIds = [...new Set(rows.map((r) => r.trainer_id).filter(Boolean))];
    const trainers = trainerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: trainerIds } },
          select: { id: true, name: true, full_name: true },
        })
      : [];
    const trainerById = new Map(trainers.map((t) => [t.id, t]));

    // enrolled_count = APPROVED course payments per course.
    let enrolledById = new Map();
    if (rows.length > 0) {
      const agg = await prisma.payment.groupBy({
        by: ['reference'],
        where: {
          type: 'COURSE',
          status: 'APPROVED',
          reference: { in: rows.map((r) => r.id) },
        },
        _count: { _all: true },
      });
      enrolledById = new Map(agg.map((a) => [a.reference, a._count._all]));
    }

    return rows.map((c) => {
      const t = trainerById.get(c.trainer_id);
      return {
        id: c.id,
        name: c.name,
        description: c.description ?? undefined,
        sport: c.sport ?? undefined,
        trainer_id: c.trainer_id ?? undefined,
        trainer_name: t?.full_name || t?.name || undefined,
        capacity: c.capacity,
        price_mxn: c.price_mxn,
        starts_at: c.starts_at?.toISOString(),
        ends_at: c.ends_at?.toISOString(),
        schedule: c.schedule || {},
        published: c.published,
        enrolled_count: enrolledById.get(c.id) ?? c.enrolled ?? 0,
      };
    });
  });
}
