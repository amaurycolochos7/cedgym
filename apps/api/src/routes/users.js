// ─────────────────────────────────────────────────────────────────
// Users — self-service (LFPDPPP compliance).
//
//   GET    /users/me/export    — export all personal data (JSON)
//   DELETE /users/me           — anonymize account (soft delete, preserves
//                                payment history for legal/accounting reasons)
// ─────────────────────────────────────────────────────────────────

export default async function usersRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] };

  fastify.get('/users/me/export', auth, async (req, reply) => {
    const userId = req.user?.id ?? req.user?.sub;

    const [
      user,
      membership,
      payments,
      check_ins,
      emergency_contacts,
      purchases,
      measurements,
      bookings,
      reviews,
      progress,
      badges,
      referralsMade,
      referralReceived,
    ] = await Promise.all([
      fastify.prisma.user.findUnique({ where: { id: userId } }),
      fastify.prisma.membership.findUnique({ where: { user_id: userId } }),
      fastify.prisma.payment.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' } }),
      fastify.prisma.checkIn.findMany({ where: { user_id: userId }, orderBy: { scanned_at: 'desc' } }),
      fastify.prisma.emergencyContact.findMany({ where: { user_id: userId } }),
      fastify.prisma.productPurchase.findMany({
        where: { user_id: userId },
        include: { product: { select: { title: true, slug: true, type: true } } },
      }),
      fastify.prisma.bodyMeasurement.findMany({ where: { user_id: userId } }),
      fastify.prisma.classBooking.findMany({ where: { user_id: userId } }),
      fastify.prisma.productReview.findMany({ where: { user_id: userId } }),
      fastify.prisma.userProgress.findUnique({ where: { user_id: userId } }).catch(() => null),
      fastify.prisma.userBadge.findMany({ where: { user_id: userId }, include: { badge: true } }).catch(() => []),
      fastify.prisma.referral.findMany({ where: { referrer_id: userId } }).catch(() => []),
      fastify.prisma.referral.findUnique({ where: { referred_id: userId } }).catch(() => null),
    ]);

    if (!user) {
      return reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const payload = {
      exported_at: new Date().toISOString(),
      user: { ...user, password_hash: undefined },
      membership,
      emergency_contacts,
      payments,
      check_ins,
      purchases,
      measurements,
      bookings,
      reviews,
      progress,
      badges,
      referrals: {
        made: referralsMade,
        received: referralReceived,
      },
      notice:
        'Este archivo contiene una copia de tus datos personales conforme a la LFPDPPP (México). ' +
        'Guárdalo en un lugar seguro; contiene información sensible.',
    };

    reply
      .header('content-type', 'application/json; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="cedgym-export-${userId}-${Date.now()}.json"`
      );
    return payload;
  });

  fastify.delete('/users/me', auth, async (req, reply) => {
    const userId = req.user?.id ?? req.user?.sub;
    const { confirm } = req.body ?? {};
    if (confirm !== 'DELETE') {
      return reply.status(400).send({
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Envía { "confirm": "DELETE" } en el body para confirmar la eliminación.',
        },
      });
    }

    // Hard deletes that don't break accounting integrity.
    await Promise.all([
      fastify.prisma.emergencyContact.deleteMany({ where: { user_id: userId } }),
      fastify.prisma.bodyMeasurement.deleteMany({ where: { user_id: userId } }),
      fastify.prisma.refreshToken.deleteMany({ where: { user_id: userId } }),
      fastify.prisma.productReview.deleteMany({ where: { user_id: userId } }),
    ]);

    // Anonymize the User row (preserves Payment FK for legal record).
    const anonEmail = `deleted-${userId}@cedgym.invalid`;
    await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        name: 'Usuario eliminado',
        full_name: null,
        email: anonEmail,
        phone: null,
        birth_date: null,
        gender: null,
        avatar_url: null,
        status: 'DELETED',
      },
    });

    // Write audit log entry.
    try {
      await fastify.prisma.auditLog.create({
        data: {
          workspace_id: req.user?.workspace_id,
          actor_id: userId,
          action: 'user.self_deleted',
          target_type: 'User',
          target_id: userId,
          ip_address: req.ip,
          user_agent: req.headers['user-agent'] ?? null,
        },
      });
    } catch (e) {
      fastify.log.warn({ err: e.message }, 'audit log write failed on self-delete');
    }

    // Clear session cookie.
    reply.clearCookie?.('cedgym_session');
    return { success: true, message: 'Cuenta eliminada (datos personales anonimizados).' };
  });
}
