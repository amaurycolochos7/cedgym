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
import { audit, auditCtx } from '../lib/audit.js';
import {
  assertWorkspaceAccess,
  requireSameWorkspace,
} from '../lib/tenant-guard.js';

const STAFF_ROLES = ['RECEPTIONIST', 'ADMIN'];

export default async function adminStaffRoutes(fastify) {
  const admin = { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] };
  const superOnly = { preHandler: [fastify.authenticate, fastify.requireRole('SUPERADMIN')] };

  fastify.get('/admin/staff', admin, async (req) => {
    const workspaceId = assertWorkspaceAccess(req);
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
    const workspaceId = assertWorkspaceAccess(req);
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

    // Duplicate check is global because email/phone are unique across the
    // platform, not scoped per workspace. (A single physical person can't
    // exist twice — even across gyms.)
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
        password_hash: await bcrypt.hash(password, 12),
        workspace_id: workspaceId,
      },
    });

    audit(fastify, {
      workspace_id: workspaceId,
      actor_id: req.user?.sub || req.user?.id || null,
      action: 'staff.created',
      target_type: 'user',
      target_id: user.id,
      metadata: { role, email },
      ...auditCtx(req),
    });

    const { password_hash, ...safeUser } = user;
    return { success: true, user: safeUser };
  });

  fastify.patch('/admin/staff/:id', admin, async (req, reply) => {
    const workspaceId = assertWorkspaceAccess(req);
    const existing = await requireSameWorkspace(
      fastify.prisma,
      'user',
      req.params.id,
      workspaceId,
      { select: { id: true, name: true, role: true, status: true } },
    );

    // Allowlist body fields — no role escalation via mass-assign.
    const { name, role, status } = req.body ?? {};

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
    // Defense in depth: nobody (not even SUPERADMIN) can grant SUPERADMIN
    // through this route — that path requires a deliberate DB action.
    if (role === 'SUPERADMIN') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'No se puede asignar SUPERADMIN desde el panel' },
      });
    }

    const data = {
      ...(typeof name === 'string' && name.trim() && { name: name.trim() }),
      ...(role && { role }),
      ...(status && { status }),
    };
    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: { code: 'NO_CHANGES', message: 'Sin cambios válidos' } });
    }

    const updated = await fastify.prisma.user.update({
      where: { id: existing.id },
      data,
    });

    audit(fastify, {
      workspace_id: workspaceId,
      actor_id: req.user?.sub || req.user?.id || null,
      action: 'staff.updated',
      target_type: 'user',
      target_id: existing.id,
      metadata: {
        changes: Object.keys(data),
        previous_role: existing.role,
        new_role: data.role || existing.role,
      },
      ...auditCtx(req),
    });

    const { password_hash, ...safeUser } = updated;
    return { success: true, user: safeUser };
  });

  fastify.delete('/admin/staff/:id', superOnly, async (req, reply) => {
    const workspaceId = assertWorkspaceAccess(req);
    const target = await requireSameWorkspace(
      fastify.prisma,
      'user',
      req.params.id,
      workspaceId,
      { select: { id: true, name: true, email: true, role: true } },
    );
    // Self-delete check goes FIRST: it's an absolute invariant — even a
    // SUPERADMIN cannot delete their own account through the panel.
    // (Locking yourself out is a footgun we never want to leave open.)
    const actorId = req.user?.sub || req.user?.id;
    if (target.id === actorId) {
      return reply.status(400).send({
        error: { code: 'CANNOT_DELETE_SELF', message: 'No puedes eliminar tu propia cuenta' },
      });
    }
    if (target.role === 'SUPERADMIN') {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'No se puede eliminar al SUPERADMIN' },
      });
    }

    // Anonymize en lugar de delete hard (preserva FK en AuditLog, payments, etc.)
    await fastify.prisma.user.update({
      where: { id: target.id },
      data: {
        name: 'Staff eliminado',
        email: `deleted-${target.id}@cedgym.invalid`,
        phone: null,
        status: 'DELETED',
        role: 'ATHLETE', // despojar de permisos
      },
    });

    audit(fastify, {
      workspace_id: workspaceId,
      actor_id: actorId || null,
      action: 'staff.deleted',
      target_type: 'user',
      target_id: target.id,
      metadata: {
        previous_role: target.role,
        previous_email: target.email,
      },
      ...auditCtx(req),
    });

    return { success: true };
  });
}
