// ─────────────────────────────────────────────────────────────────
// Admin: members listing + quick actions.
//
//   GET    /admin/miembros                 — paginated list (search, status, plan, sport)
//   GET    /admin/miembros/:id             — full member profile
//   POST   /admin/miembros                 — quick create (admin-initiated)
//   PATCH  /admin/miembros/:id             — edit (name, status, notes)
//   POST   /admin/miembros/:id/suspend
//   POST   /admin/miembros/:id/reactivate
//   DELETE /admin/miembros/:id             — hard delete user + cascade data
// ─────────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import { audit, auditCtx } from '../lib/audit.js';

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

  // ─── DELETE /admin/miembros/:id ────────────────────────────────
  // Hard delete: cascade through all related rows in a single
  // transaction, then drop the user. Writes a best-effort audit entry.
  // Guards: tenant scope (workspace_id must match the caller) + role.
  fastify.delete('/admin/miembros/:id', adminOnly, async (req, reply) => {
    const workspaceId = req.user.workspace_id;
    const user = await fastify.prisma.user.findFirst({
      where: { id: req.params.id, workspace_id: workspaceId },
      select: {
        id: true,
        name: true,
        full_name: true,
        email: true,
        phone: true,
        role: true,
      },
    });
    if (!user) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' },
      });
    }
    // Prevent admins from deleting themselves or a higher-tier user.
    if (user.id === (req.user?.sub || req.user?.id)) {
      return reply.status(400).send({
        error: { code: 'CANNOT_DELETE_SELF', message: 'No puedes eliminar tu propia cuenta' },
      });
    }
    if (user.role === 'SUPERADMIN' && req.user.role !== 'SUPERADMIN') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Solo SUPERADMIN puede eliminar a otro SUPERADMIN' },
      });
    }

    const uid = user.id;

    // Cascade delete. Order matters: children first, then parent. Each
    // deleteMany is safe — if a relation is already cascaded by the
    // schema, the rows will be gone before we try.
    await fastify.prisma.$transaction(async (tx) => {
      await tx.checkIn.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.emergencyContact.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.refreshToken.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.otpCode.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.payment.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.productPurchase.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.productReview.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.classBooking.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.referral.deleteMany({
        where: { OR: [{ referrer_id: uid }, { referred_id: uid }] },
      }).catch(() => {});
      await tx.userBadge.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.userProgress.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.bodyMeasurement.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.message.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.conversation.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.membershipFreeze.deleteMany({
        where: { membership: { user_id: uid } },
      }).catch(() => {});
      await tx.membership.deleteMany({ where: { user_id: uid } }).catch(() => {});
      await tx.automationJob.deleteMany({ where: { context: { path: ['user_id'], equals: uid } } }).catch(() => {});
      await tx.user.delete({ where: { id: uid } });
    });

    // Best-effort audit (never blocks).
    audit(fastify, {
      workspace_id: workspaceId,
      actor_id: req.user?.sub || req.user?.id || null,
      action: 'member.deleted',
      target_type: 'user',
      target_id: uid,
      metadata: {
        name: user.full_name || user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      ...auditCtx(req),
    });

    return { success: true, id: uid };
  });
}
