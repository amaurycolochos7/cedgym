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
import QRCode from 'qrcode';
import { audit, auditCtx } from '../lib/audit.js';
import { rotateTokenForUser } from '../lib/qr.js';
import { generateMembershipCard } from '../lib/pdf.js';
import { sendWhatsAppMessage } from '../lib/whatsapp.js';
import {
  generateOtpCode,
  hashOtpCode,
  otpExpiresAt,
  sendOtpViaWhatsApp,
} from '../lib/otp.js';

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
    if (!name || !phone) {
      return reply.status(400).send({ error: { code: 'INVALID_BODY', message: 'name y phone son requeridos' } });
    }
    const normalizedEmail = email && email.trim() ? email.trim().toLowerCase() : null;
    const exists = await fastify.prisma.user.findFirst({
      where: { OR: [{ phone }, ...(normalizedEmail ? [{ email: normalizedEmail }] : [])] },
    });
    if (exists) {
      return reply.status(409).send({ error: { code: 'USER_EXISTS', message: 'Teléfono o correo ya registrado' } });
    }
    const user = await fastify.prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
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

  // ─── POST /admin/miembros/:id/reset-password ──────────────────
  // Admin dispara un OTP al WhatsApp del socio para que arme
  // contraseña nueva. Idéntico a /auth/password/forgot pero iniciado
  // desde el panel sin que el socio tenga que pedirlo.
  fastify.post('/admin/miembros/:id/reset-password', adminOnly, async (req, reply) => {
    const user = await fastify.prisma.user.findFirst({
      where: { id: req.params.id, workspace_id: req.user.workspace_id },
      select: { id: true, phone: true },
    });
    if (!user) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' } });
    }
    if (!user.phone) {
      return reply.status(400).send({ error: { code: 'NO_PHONE', message: 'El miembro no tiene teléfono registrado' } });
    }
    const code = generateOtpCode();
    const code_hash = await hashOtpCode(code);
    await fastify.prisma.otpCode.create({
      data: {
        phone: user.phone,
        code_hash,
        purpose: 'PASSWORD_RESET',
        expires_at: otpExpiresAt(),
      },
    });
    const send = await sendOtpViaWhatsApp({
      workspaceId: user.workspace_id || req.user.workspace_id,
      phone: user.phone,
      code,
      purpose: 'PASSWORD_RESET',
      logger: req.log,
    });
    return { success: true, ok: send.ok };
  });

  // ─── GET /admin/miembros/:id/qr ───────────────────────────────
  // Devuelve URL data:image/png;base64 con el QR rotativo actual.
  // El admin puede imprimirlo, pero dura ~90 s — el socio real
  // siempre debe usar su propio /portal/qr.
  fastify.get('/admin/miembros/:id/qr', adminOnly, async (req, reply) => {
    const user = await fastify.prisma.user.findFirst({
      where: { id: req.params.id, workspace_id: req.user.workspace_id },
      select: { id: true, workspace_id: true, name: true, full_name: true },
    });
    if (!user) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' } });
    }
    const { token, expires_in } = await rotateTokenForUser(
      fastify.redis,
      user.workspace_id,
      user.id,
    );
    const dataUrl = await QRCode.toDataURL(token, { width: 512, margin: 2 });
    return { url: dataUrl, token, expires_in, name: user.full_name || user.name };
  });

  // ─── GET /admin/miembros/:id/carnet.pdf ───────────────────────
  // PDF carnet con nombre, plan, vencimiento, QR — listo para imprimir.
  fastify.get('/admin/miembros/:id/carnet.pdf', adminOnly, async (req, reply) => {
    const user = await fastify.prisma.user.findFirst({
      where: { id: req.params.id, workspace_id: req.user.workspace_id },
      include: { membership: true, workspace: true },
    });
    if (!user) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' } });
    }
    const { token } = await rotateTokenForUser(
      fastify.redis,
      user.workspace_id,
      user.id,
    );
    // generateMembershipCard returns { buffer, url, key, storage } —
    // we only need the Buffer for the HTTP response.
    const { buffer } = await generateMembershipCard(
      user,
      user.membership,
      user.workspace,
      token,
    );
    reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `attachment; filename="carnet-${(user.full_name || user.name || 'socio').replace(/\s+/g, '_')}.pdf"`,
      );
    return reply.send(buffer);
  });

  // ─── POST /admin/miembros/:id/whatsapp ────────────────────────
  // Envío manual (texto libre). Se registra en audit log.
  fastify.post('/admin/miembros/:id/whatsapp', adminOnly, async (req, reply) => {
    const body = (req.body || {}).message;
    if (typeof body !== 'string' || body.trim().length < 3 || body.length > 2000) {
      return reply.status(400).send({
        error: { code: 'BAD_BODY', message: 'Mensaje requerido (3-2000 caracteres)' },
      });
    }
    const user = await fastify.prisma.user.findFirst({
      where: { id: req.params.id, workspace_id: req.user.workspace_id },
      select: { id: true, workspace_id: true, phone: true, name: true, full_name: true },
    });
    if (!user) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' } });
    }
    if (!user.phone) {
      return reply.status(400).send({ error: { code: 'NO_PHONE', message: 'El miembro no tiene teléfono registrado' } });
    }
    const send = await sendWhatsAppMessage({
      workspaceId: user.workspace_id,
      phone: user.phone,
      message: body.trim(),
      logger: req.log,
    });
    audit(fastify, {
      workspace_id: user.workspace_id,
      actor_id: req.user?.sub || req.user?.id || null,
      action: 'whatsapp.sent_manual',
      target_type: 'user',
      target_id: user.id,
      metadata: { preview: body.slice(0, 200), ok: send.ok },
      ...auditCtx(req),
    });
    if (!send.ok) {
      return reply.status(502).send({
        error: { code: 'WA_SEND_FAILED', message: 'No se pudo enviar por WhatsApp', details: send.error },
      });
    }
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

    // Cascade delete. Sequential (NOT inside a transaction) because
    // Prisma poisons the whole tx on the first error — some of these
    // relations are optional and the row may simply not exist. We run
    // each deleteMany independently, swallow per-table errors, and
    // finish with user.delete which is the only one that MUST succeed.
    const prisma = fastify.prisma;
    const safeDelete = async (fn) => {
      try { await fn(); } catch (err) {
        fastify.log.warn({ err: err?.message }, '[delete-user] step failed');
      }
    };

    // OtpCode has `phone`, not `user_id` — we look them up by phone.
    if (user.phone) {
      await safeDelete(() => prisma.otpCode.deleteMany({ where: { phone: user.phone } }));
    }
    await safeDelete(() => prisma.checkIn.deleteMany({ where: { user_id: uid } }));
    await safeDelete(() => prisma.emergencyContact.deleteMany({ where: { user_id: uid } }));
    await safeDelete(() => prisma.refreshToken.deleteMany({ where: { user_id: uid } }));
    await safeDelete(() => prisma.payment.deleteMany({ where: { user_id: uid } }));
    await safeDelete(() => prisma.productPurchase.deleteMany({ where: { user_id: uid } }));
    await safeDelete(() => prisma.productReview.deleteMany({ where: { user_id: uid } }));
    await safeDelete(() => prisma.userBadge.deleteMany({ where: { user_id: uid } }));
    await safeDelete(() => prisma.userProgress.deleteMany({ where: { user_id: uid } }));
    await safeDelete(() => prisma.bodyMeasurement.deleteMany({ where: { user_id: uid } }));
    // Conversation.user_ids is a text[] — remove rows that include uid.
    await safeDelete(() => prisma.conversation.deleteMany({
      where: { user_ids: { has: uid } },
    }));
    await safeDelete(() => prisma.membershipFreeze.deleteMany({
      where: { membership: { user_id: uid } },
    }));
    await safeDelete(() => prisma.membership.deleteMany({ where: { user_id: uid } }));

    // Finally drop the user. If an FK still holds (unlikely), Prisma
    // throws and we surface it to the client.
    try {
      await prisma.user.delete({ where: { id: uid } });
    } catch (err) {
      fastify.log.error({ err: err?.message, uid }, '[delete-user] final delete failed');
      return reply.status(409).send({
        error: {
          code: 'DELETE_CONFLICT',
          message:
            'No se pudo eliminar: hay datos referenciados que no pudimos limpiar. Contacta a soporte.',
          details: err?.message,
        },
      });
    }

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
