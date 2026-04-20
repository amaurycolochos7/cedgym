// ─────────────────────────────────────────────────────────────────
// Admin: members listing + quick actions.
//
//   GET    /admin/miembros                 — paginated list (search, status, plan, sport)
//   GET    /admin/miembros/:id             — full member profile
//   POST   /admin/miembros                 — quick create (admin-initiated)
//   PATCH  /admin/miembros/:id             — edit (name, status, notes)
//   POST   /admin/miembros/:id/suspend
//   POST   /admin/miembros/:id/reactivate
// ─────────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';

export default async function adminMembersRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN', 'RECEPTIONIST', 'TRAINER')] };
  const adminOnly = { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] };

  fastify.get('/admin/miembros', guard, async (req) => {
    const { search, status, plan, sport, limit = 30, offset = 0 } = req.query;
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;

    const where = {
      workspace_id: workspaceId,
      role: 'ATHLETE',
      ...(status && { status }),
      ...(search && {
        OR: [
          { name:       { contains: search, mode: 'insensitive' } },
          { full_name:  { contains: search, mode: 'insensitive' } },
          { email:      { contains: search, mode: 'insensitive' } },
          { phone:      { contains: search } },
        ],
      }),
      ...((plan || sport) && {
        membership: {
          ...(plan  && { plan }),
          ...(sport && { sport }),
        },
      }),
    };

    const [items, total] = await Promise.all([
      fastify.prisma.user.findMany({
        where,
        include: { membership: true },
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
        orderBy: { created_at: 'desc' },
      }),
      fastify.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        id: u.id,
        name: u.name,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        created_at: u.created_at,
        membership: u.membership
          ? {
              plan: u.membership.plan,
              status: u.membership.status,
              sport: u.membership.sport,
              expires_at: u.membership.expires_at,
            }
          : null,
      })),
      total,
      limit: Number(limit),
      offset: Number(offset),
    };
  });

  fastify.get('/admin/miembros/:id', guard, async (req, reply) => {
    const u = await fastify.prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        membership: true,
        emergency_contacts: true,
      },
    });
    if (!u) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' } });

    const [checkinCount, lastCheckin, progress] = await Promise.all([
      fastify.prisma.checkIn.count({ where: { user_id: u.id } }),
      fastify.prisma.checkIn.findFirst({ where: { user_id: u.id }, orderBy: { scanned_at: 'desc' } }),
      fastify.prisma.userProgress.findUnique({ where: { user_id: u.id } }).catch(() => null),
    ]);

    return {
      ...u,
      password_hash: undefined,
      stats: {
        total_checkins: checkinCount,
        last_checkin_at: lastCheckin?.scanned_at ?? null,
        xp: progress?.xp ?? 0,
        level: progress?.level ?? 1,
        current_streak: progress?.current_streak_days ?? 0,
      },
    };
  });

  fastify.post('/admin/miembros', adminOnly, async (req, reply) => {
    const { name, email, phone, password } = req.body ?? {};
    if (!name || !email || !phone) {
      return reply.status(400).send({ error: { code: 'INVALID_BODY', message: 'name, email y phone son requeridos' } });
    }
    const exists = await fastify.prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
    if (exists) {
      return reply.status(409).send({ error: { code: 'USER_EXISTS', message: 'Email o teléfono ya registrado' } });
    }
    const user = await fastify.prisma.user.create({
      data: {
        name,
        email,
        phone,
        role: 'ATHLETE',
        status: 'ACTIVE',
        phone_verified_at: new Date(),
        password_hash: await bcrypt.hash(password || `CedGym${Date.now()}`, 10),
        workspace_id: req.user?.workspace_id ?? fastify.defaultWorkspaceId,
      },
    });
    return { id: user.id, success: true };
  });

  fastify.patch('/admin/miembros/:id', adminOnly, async (req) => {
    const { name, full_name, email, status } = req.body ?? {};
    const updated = await fastify.prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(full_name && { full_name }),
        ...(email && { email }),
        ...(status && { status }),
      },
    });
    return { id: updated.id, success: true };
  });

  fastify.post('/admin/miembros/:id/suspend', adminOnly, async (req) => {
    await fastify.prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'SUSPENDED' },
    });
    return { success: true };
  });

  fastify.post('/admin/miembros/:id/reactivate', adminOnly, async (req) => {
    await fastify.prisma.user.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' },
    });
    return { success: true };
  });
}
