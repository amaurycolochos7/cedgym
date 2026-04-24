// ─────────────────────────────────────────────────────────────────
// Users — self-service (LFPDPPP compliance).
//
//   GET    /users/me/export            — export all personal data (JSON)
//   DELETE /users/me                   — anonymize account (soft delete)
//   PATCH  /users/me/fitness-profile   — save fitness wizard output for AI
//   POST   /users/me/selfie            — upload/replace face selfie (staff ID)
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { putObject } from '../lib/storage.js';

const FitnessProfileSchema = z
  .object({
    // Paso 1 — demografía
    age: z.number().int().min(6).max(99).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    height_cm: z.number().int().min(100).max(230).optional(),
    weight_kg: z.number().min(30).max(250).optional(),

    // Paso 2 — tipo de usuario + disciplina
    user_type: z.enum(['ADULT', 'SENIOR', 'KID', 'ATHLETE']).optional(),
    discipline: z
      .enum([
        'STRENGTH', 'HYROX', 'POWERLIFTING', 'FUNCTIONAL',
        'FOOTBALL_US', 'FOOTBALL_SOCCER', 'BASKETBALL',
        'TENNIS', 'BOXING', 'CROSSFIT',
      ])
      .nullable()
      .optional(),

    // Paso 3 — objetivo, nivel, actividad
    objective: z
      .enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS'])
      .optional(),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
    activity_level: z.enum(['sedentary', 'light', 'moderate', 'high', 'very_high']).optional(),

    // Paso 4 — disponibilidad
    days_per_week: z.number().int().min(2).max(6).optional(),
    session_duration_min: z.number().int().min(15).max(180).optional(),

    // Paso 5 — restricciones
    injuries: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    available_equipment: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
    dietary_restrictions: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    allergies: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    disliked_foods: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict(); // Rechaza campos no declarados — evita que la IA consuma basura.

// Selfie — data URL o base64 crudo. Validamos size + mime en el handler
// porque Zod no es la herramienta adecuada para medir un buffer binario.
const SelfieSchema = z
  .object({
    image_base64: z.string().min(32).max(4 * 1024 * 1024), // ~3MB de b64 ≈ 2.2MB raw
  })
  .strict();

// Decodifica un data URL o b64 pelado. Devuelve { buffer, mime } o null.
function decodeImagePayload(raw) {
  if (typeof raw !== 'string') return null;
  let mime = 'image/jpeg';
  let b64 = raw.trim();
  const m = b64.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/i);
  if (m) {
    mime = m[1].toLowerCase();
    b64 = m[2];
  }
  try {
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length < 512) return null; // demasiado pequeño para ser una foto real
    return { buffer, mime };
  } catch {
    return null;
  }
}

export default async function usersRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] };

  // Guarda/actualiza el perfil fitness (consumido por /ai/routines/generate
  // y /ai/meal-plans/generate). El cliente manda el blob completo; lo
  // persistimos en User.fitness_profile (Json column).
  fastify.patch('/users/me/fitness-profile', auth, async (req, reply) => {
    const userId = req.user?.id ?? req.user?.sub;

    const parsed = FitnessProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_FITNESS_PROFILE',
          message: 'Formato de perfil fitness inválido.',
          details: parsed.error.flatten(),
        },
      });
    }

    const updated = await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        fitness_profile: parsed.data,
      },
      select: { id: true, fitness_profile: true, updated_at: true },
    });

    return { success: true, user: updated };
  });

  // Sube/actualiza la selfie del usuario. Obligatoria antes de comprar una
  // membresía desde el portal (el staff usa la foto para identificar en
  // check-in). Admin/recepción crean membresías por su lado y no pasan por
  // esta puerta, así que el bypass es natural.
  fastify.post(
    '/users/me/selfie',
    {
      preHandler: [fastify.authenticate],
      bodyLimit: 4 * 1024 * 1024, // 4 MB JSON (b64 es ~33% más grande que el binario)
    },
    async (req, reply) => {
      const userId = req.user?.id ?? req.user?.sub;

      const parsed = SelfieSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_SELFIE_BODY',
            message: 'Envía { image_base64 } con una imagen válida.',
            details: parsed.error.flatten(),
          },
        });
      }

      const decoded = decodeImagePayload(parsed.data.image_base64);
      if (!decoded) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_SELFIE_FORMAT',
            message: 'Formato inválido. Usa JPEG o PNG en base64.',
          },
        });
      }

      // 2 MB de imagen decodificada es más que suficiente para una selfie.
      const MAX_BYTES = 2 * 1024 * 1024;
      if (decoded.buffer.length > MAX_BYTES) {
        return reply.status(400).send({
          error: {
            code: 'SELFIE_TOO_LARGE',
            message: 'La imagen supera 2 MB. Reintenta con menor resolución.',
          },
        });
      }

      const ext = decoded.mime === 'image/png' ? 'png' : 'jpg';
      const key = `selfies/${userId}/${Date.now()}.${ext}`;
      const { url } = await putObject({
        key,
        body: decoded.buffer,
        contentType: decoded.mime,
      });

      const updated = await fastify.prisma.user.update({
        where: { id: userId },
        data: { selfie_url: url },
        select: { id: true, selfie_url: true, updated_at: true },
      });

      return { success: true, selfie_url: updated.selfie_url, user: updated };
    }
  );

  fastify.get('/users/me/export', auth, async (req, reply) => {
    const userId = req.user?.id ?? req.user?.sub;

    const [
      user,
      membership,
      payments,
      check_ins,
      purchases,
      measurements,
      reviews,
      progress,
      badges,
    ] = await Promise.all([
      fastify.prisma.user.findUnique({ where: { id: userId } }),
      fastify.prisma.membership.findUnique({ where: { user_id: userId } }),
      fastify.prisma.payment.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' } }),
      fastify.prisma.checkIn.findMany({ where: { user_id: userId }, orderBy: { scanned_at: 'desc' } }),
      fastify.prisma.productPurchase.findMany({
        where: { user_id: userId },
        include: { product: { select: { title: true, slug: true, type: true } } },
      }),
      fastify.prisma.bodyMeasurement.findMany({ where: { user_id: userId } }),
      fastify.prisma.productReview.findMany({ where: { user_id: userId } }),
      fastify.prisma.userProgress.findUnique({ where: { user_id: userId } }).catch(() => null),
      fastify.prisma.userBadge.findMany({ where: { user_id: userId }, include: { badge: true } }).catch(() => []),
    ]);

    if (!user) {
      return reply.status(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const payload = {
      exported_at: new Date().toISOString(),
      user: { ...user, password_hash: undefined },
      membership,
      payments,
      check_ins,
      purchases,
      measurements,
      reviews,
      progress,
      badges,
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
        selfie_url: null,
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
