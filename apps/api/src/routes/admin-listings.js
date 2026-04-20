// ─────────────────────────────────────────────────────────────────
// Admin list endpoints. The author-facing `/courses` and `/classes`
// routes filter to `published=true` and public-bookable windows —
// fine for members, useless for admin dashboards. This module adds:
//
//   GET /admin/courses                — every course in the workspace
//   GET /admin/classes                — classes in a window (all statuses)
//
// These are `GET`-only; every existing write path (POST/PATCH/DELETE)
// keeps living in `routes/courses.js` and `routes/classes.js`.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';

const classesQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  sport: z.string().optional(),
});

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

  // ─── GET /admin/classes ───────────────────────────────────────
  //
  // Accepts `from` / `to` ISO strings and returns every scheduled
  // class in the window — including cancelled ones, which admins
  // still need to see on the calendar.
  fastify.get('/admin/classes', adminGuard, async (req) => {
    const parsed = classesQuery.safeParse(req.query || {});
    if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
    const { from, to, sport } = parsed.data;

    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

    const where = { workspace_id };
    if (from || to) {
      where.starts_at = {};
      if (from) where.starts_at.gte = new Date(from);
      if (to) where.starts_at.lte = new Date(to);
    }
    if (sport) where.sport = sport;

    const rows = await prisma.classSchedule.findMany({
      where,
      orderBy: { starts_at: 'asc' },
    });

    // Trainer lookup (no FK relation on ClassSchedule either).
    const trainerIds = [...new Set(rows.map((r) => r.trainer_id).filter(Boolean))];
    const trainers = trainerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: trainerIds } },
          select: { id: true, name: true, full_name: true },
        })
      : [];
    const trainerById = new Map(trainers.map((t) => [t.id, t]));

    const now = new Date();
    return rows.map((c) => {
      const ends = new Date(c.starts_at);
      ends.setMinutes(ends.getMinutes() + (c.duration_min || 0));
      const t = trainerById.get(c.trainer_id);
      // ClassSchedule has no cancellation column; `cancel` zeroes out
      // `booked` and the cancellations show up via ClassBooking
      // status. We infer "completed" only — cancelled state is derived
      // by the caller via the separate cancel endpoint if needed.
      let status = 'scheduled';
      if (c.starts_at && c.starts_at < now) status = 'completed';
      return {
        id: c.id,
        name: c.name,
        sport: c.sport,
        trainer_id: c.trainer_id,
        coach_name: t?.full_name || t?.name || null,
        starts_at: c.starts_at.toISOString(),
        ends_at: ends.toISOString(),
        duration_min: c.duration_min,
        capacity: c.capacity,
        booked: c.booked ?? 0,
        location: c.location,
        min_plan: c.min_plan,
        status,
      };
    });
  });
}
