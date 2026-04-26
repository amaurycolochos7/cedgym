// ─────────────────────────────────────────────────────────────────
// Admin: staff management.
// Allows an ADMIN/SUPERADMIN to create and manage users with
// non-athlete roles (RECEPTIONIST, ADMIN).
//
//   GET    /admin/staff
//   POST   /admin/staff          — crear recepcionista o admin
//   PATCH  /admin/staff/:id      — cambiar rol / nombre / status
//   DELETE /admin/staff/:id      — eliminar (solo SUPERADMIN)
// ─────────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';

const STAFF_ROLES = ['RECEPTIONIST', 'ADMIN'];

export default async function adminStaffRoutes(fastify) {
  const admin = { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] };
  const superOnly = { preHandler: [fastify.authenticate, fastify.requireRole('SUPERADMIN')] };

  fastify.get('/admin/staff', admin, async (req) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    const items = await fastify.prisma.user.findMany({
      where: {
        workspace_id: workspaceId,
        role: { in: [...STAFF_ROLES, 'SUPERADMIN'] },
      },
      orderBy: { created_at: 'desc' },
    });
    return {
      items: items.map(({ password_hash, ...u }) => u),
      total: items.length,
    };
  });

  fastify.post('/admin/staff', admin, async (req, reply) => {
    const { name, email, phone, password, role } = req.body ?? {};
    if (!name || !email || !phone || !password || !role) {
      return reply.status(400).send({
        error: { code: 'INVALID_BODY', message: 'name, email, phone, password y role son requeridos' },
      });
    }
    if (!STAFF_ROLES.includes(role)) {
      return reply.status(400).send({
        error: { code: 'INVALID_ROLE', message: `role debe ser uno de: ${STAFF_ROLES.join(', ')}` },
      });
    }
    // Solo SUPERADMIN puede crear otro ADMIN
    if (role === 'ADMIN' && req.user?.role !== 'SUPERADMIN') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Solo SUPERADMIN puede crear ADMINs' },
      });
    }

    const exists = await fastify.prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (exists) {
      return reply.status(409).send({
        error: { code: 'USER_EXISTS', message: 'Email o teléfono ya registrado' },
      });
    }

    const user = await fastify.prisma.user.create({
      data: {
        name,
        email,
        phone,
        role,
        status: 'ACTIVE',
        phone_verified_at: new Date(),
        password_hash: await bcrypt.hash(password, 10),
        workspace_id: req.user?.workspace_id ?? fastify.defaultWorkspaceId,
      },
    });

    // Audit log
    try {
      await fastify.prisma.auditLog.create({
        data: {
          workspace_id: user.workspace_id,
          actor_id: req.user?.id,
          action: 'staff.created',
          target_type: 'User',
          target_id: user.id,
          metadata: { role, email },
          ip_address: req.ip,
        },
      });
    } catch { /* best effort */ }

    const { password_hash, ...safeUser } = user;
    return { success: true, user: safeUser };
  });

  fastify.patch('/admin/staff/:id', admin, async (req, reply) => {
    const { name, role, status } = req.body ?? {};
    const existing = await fastify.prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.status(404).send({ error: { code: 'NOT_FOUND' } });

    // Solo SUPERADMIN puede modificar role a/desde ADMIN
    if (role && role !== existing.role) {
      if (!STAFF_ROLES.includes(role)) {
        return reply.status(400).send({
          error: { code: 'INVALID_ROLE', message: `role debe ser uno de: ${STAFF_ROLES.join(', ')}` },
        });
      }
      if ((role === 'ADMIN' || existing.role === 'ADMIN') && req.user?.role !== 'SUPERADMIN') {
        return reply.status(403).send({
          error: { code: 'FORBIDDEN', message: 'Solo SUPERADMIN puede modificar roles ADMIN' },
        });
      }
    }

    const updated = await fastify.prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(role && { role }),
        ...(status && { status }),
      },
    });
    const { password_hash, ...safeUser } = updated;
    return { success: true, user: safeUser };
  });

  fastify.delete('/admin/staff/:id', superOnly, async (req) => {
    const target = await fastify.prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return { success: true };
    if (target.role === 'SUPERADMIN') {
      return { success: false, error: 'No se puede eliminar al SUPERADMIN' };
    }
    // Anonymize en lugar de delete hard (preserva FK en AuditLog, payments, etc.)
    await fastify.prisma.user.update({
      where: { id: req.params.id },
      data: {
        name: 'Staff eliminado',
        email: `deleted-${req.params.id}@cedgym.invalid`,
        phone: null,
        status: 'DELETED',
        role: 'ATHLETE', // despojar de permisos
      },
    });
    return { success: true };
  });
}
