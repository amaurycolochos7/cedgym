// ─────────────────────────────────────────────────────────────────
// Users — self-service (LFPDPPP compliance).
//
//   GET    /users/me/export             — export all personal data (JSON)
//   DELETE /users/me                    — anonymize account (soft delete)
//   PATCH  /users/me/fitness-profile    — legacy unified profile (compat)
//   GET    /users/me/routine-profile    — read routine-specific profile
//   PATCH  /users/me/routine-profile    — save routine-specific profile
//   GET    /users/me/nutrition-profile  — read nutrition-specific profile
//   PATCH  /users/me/nutrition-profile  — save nutrition-specific profile
//   POST   /users/me/selfie             — upload/replace face selfie
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { putObject } from '../lib/storage.js';

// ── Shared enums (mirror values across routine + nutrition + legacy) ──
const ZGender    = z.enum(['MALE', 'FEMALE', 'OTHER']);
const ZUserType  = z.enum(['ADULT', 'SENIOR', 'KID', 'ATHLETE']);
const ZDiscipline = z.enum([
  // Deportes principales (mostrados destacados en el wizard)
  'FOOTBALL_SOCCER', 'FOOTBALL_US', 'BASKETBALL', 'TENNIS',
  'SWIMMING', 'BASEBALL', 'VOLLEYBALL',
  // Otros deportes / disciplinas (acordeón "Otros" en el wizard)
  'BOXING', 'CROSSFIT', 'POWERLIFTING', 'HYROX',
  'STRENGTH', 'FUNCTIONAL',
]);
const ZObjective = z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS']);
const ZLevel     = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']);
const ZActivity  = z.enum(['sedentary', 'light', 'moderate', 'high', 'very_high']);

// Estilo de entrenamiento preferido — se traduce en el prompt a rep
// scheme y descansos. Si MIXED, la IA balancea.
const ZTrainingStyle = z.enum(['HEAVY', 'HYPERTROPHY', 'CIRCUITS', 'MIXED']);

// Grupos musculares prioritarios / a desenfatizar. Multi-select.
const ZMuscleGroup = z.enum([
  'CHEST', 'BACK', 'SHOULDERS', 'ARMS', 'GLUTES', 'QUADS', 'HAMSTRINGS', 'CALVES', 'CORE', 'FULL_BODY',
]);

// Catálogo expandido. Capa "qué exactamente busca el miembro" — más
// específico que el `objective` (que es solo bajar grasa / ganar
// músculo / etc.). Lo lee el prompt como contexto duro.
const ZGoalType = z.enum([
  // Cuerpo y composición
  'AESTHETICS',           // estética general
  'DEFINITION',           // definición / marcar / déficit calórico
  'BULKING',              // volumen / ganar masa / superávit
  'RECOMP',               // recomposición — mismo peso, menos grasa, más músculo
  // Competir / desempeñar
  'BODYBUILDING',         // fisiculturismo (subir tarima)
  'POWERLIFTING_GOAL',    // PRs en sentadilla / banca / peso muerto
  'HYROX_GOAL',           // próxima carrera HYROX
  'CROSSFIT_GOAL',        // benchmarks de CrossFit
  'CALISTHENICS',         // skills (pull-up, muscle up, handstand)
  'MARATHON',             // correr 10k / media maratón / maratón
  'PERFORMANCE',          // rendimiento deportivo general
  // Salud y bienestar
  'HEALTH',               // salud general
  'POSTURE',              // postura / dolor crónico
  'ENERGY',               // energía / vitalidad diaria
  'POST_INJURY',          // recuperación de lesión
  'POST_PARTUM',          // post-parto
  // Evento
  'EVENT',                // boda, vacaciones, fecha concreta
  'COMPETITION',          // legacy — competencia genérica
]);

const ZTimeOfDay = z.enum(['MORNING', 'MIDDAY', 'AFTERNOON', 'EVENING', 'VARIES']);

// ── Routine profile schema ──────────────────────────────────────
//
// Contiene SOLO lo que el endpoint POST /ai/routines/generate necesita
// para producir una rutina personalizada. La motivación libre y
// gustos/disgustos van al prompt como contexto literal — alimentan a
// la IA para que no se vaya por la libre.
const RoutineProfileSchema = z
  .object({
    // Datos básicos compartidos (también escritos en nutrition_profile
    // por el wizard cuando se llenan por primera vez).
    age: z.number().int().min(6).max(99).optional(),
    gender: ZGender.optional(),
    height_cm: z.number().int().min(100).max(230).optional(),
    weight_kg: z.number().min(30).max(250).optional(),

    // Tipo de entrenamiento + disciplina deportiva.
    user_type: ZUserType.optional(),
    discipline: ZDiscipline.nullable().optional(),

    // Objetivo y experiencia.
    objective: ZObjective.optional(),
    level: ZLevel.optional(),
    years_training: z.enum(['NONE', 'LT_1', '1_2', '3_5', 'GT_5']).optional(),
    activity_level: ZActivity.optional(),

    // Cómo le gusta entrenar / preferencias de estilo.
    training_style: ZTrainingStyle.optional(),
    priority_muscles: z.array(ZMuscleGroup).max(5).optional(),
    deprioritized_muscles: z.array(ZMuscleGroup).max(5).optional(),
    likes: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
    dislikes: z.array(z.string().trim().min(1).max(40)).max(15).optional(),

    // Disponibilidad.
    days_per_week: z.number().int().min(2).max(6).optional(),
    session_duration_min: z.number().int().min(20).max(180).optional(),
    time_of_day: ZTimeOfDay.optional(),

    // Logística.
    location: z.enum(['GYM', 'HOME', 'BOTH']).optional(),
    available_equipment: z.array(z.string().trim().min(1).max(64)).max(30).optional(),

    // Salud.
    injuries: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    mobility_limitations: z.array(z.string().trim().min(1).max(80)).max(10).optional(),

    // Motivación / contexto narrativo (alimenta el prompt literal).
    motivation: z.string().trim().max(800).optional(),
    goal_type: ZGoalType.optional(),
    goal_deadline: z.string().trim().max(40).optional(), // ISO date or 'YYYY-MM' o texto libre
    past_experience: z.string().trim().max(800).optional(),
    notes: z.string().trim().max(800).optional(),
  })
  .strict();

// ── Nutrition profile schema ────────────────────────────────────
const ZBudget = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const ZCookerProfile = z.enum(['SELF', 'FAMILY', 'EATS_OUT']);
const ZCookingTime = z.enum(['LOW', 'MEDIUM', 'HIGH']);
const ZFoodRelationship = z.enum(['CONTROLLED', 'ANXIOUS', 'SOCIAL', 'EMOTIONAL', 'BORED']);

const NutritionProfileSchema = z
  .object({
    // Datos compartidos para Mifflin-St Jeor (pueden venir vacíos si
    // ya están en routine_profile — el endpoint busca en ambos).
    age: z.number().int().min(6).max(99).optional(),
    gender: ZGender.optional(),
    height_cm: z.number().int().min(100).max(230).optional(),
    weight_kg: z.number().min(30).max(250).optional(),
    activity_level: ZActivity.optional(),

    // Objetivo nutricional (puede diferir del de rutina — ej. socio
    // gana fuerza en pesa pero quiere déficit calórico).
    objective: ZObjective.optional(),
    calories_target: z.number().int().positive().max(6000).optional(),

    // Logística de comer.
    meals_per_day: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
    cooker: ZCookerProfile.optional(),
    cooking_time: ZCookingTime.optional(),
    budget: ZBudget.optional(),
    country: z.string().trim().min(2).max(3).optional(), // ISO-2/3 ej "MX"

    // Restricciones.
    dietary_restrictions: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    allergies: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    disliked_foods: z.array(z.string().trim().min(1).max(80)).max(30).optional(),

    // Hábitos.
    supplements: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
    water_liters_per_day: z.number().min(0).max(10).optional(),
    coffee: z.boolean().optional(),
    alcohol: z.enum(['NONE', 'SOCIAL', 'REGULAR']).optional(),
    free_meals_per_week: z.number().int().min(0).max(7).optional(),

    // Motivación / contexto.
    motivation: z.string().trim().max(800).optional(),
    food_relationship: ZFoodRelationship.optional(),
    past_experience: z.string().trim().max(800).optional(),
    notes: z.string().trim().max(800).optional(),
  })
  .strict();

// Legacy unified schema — se mantiene para compatibilidad con el
// wizard viejo. El endpoint legacy proyecta los campos relevantes a
// los dos perfiles nuevos para que ambos queden poblados de un solo
// PATCH (cuentas migradas siguen funcionando).
const FitnessProfileSchema = z
  .object({
    age: z.number().int().min(6).max(99).optional(),
    gender: ZGender.optional(),
    height_cm: z.number().int().min(100).max(230).optional(),
    weight_kg: z.number().min(30).max(250).optional(),
    user_type: ZUserType.optional(),
    discipline: ZDiscipline.nullable().optional(),
    objective: ZObjective.optional(),
    level: ZLevel.optional(),
    activity_level: ZActivity.optional(),
    days_per_week: z.number().int().min(2).max(6).optional(),
    session_duration_min: z.number().int().min(15).max(180).optional(),
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

// Proyecta los campos de un FitnessProfileSchema (legacy unificado)
// hacia el shape de routine_profile + nutrition_profile. Llamado SOLO
// por el endpoint legacy PATCH /users/me/fitness-profile para que las
// cuentas viejas (y la versión vieja del wizard) sigan poblando los
// dos perfiles separados sin perder datos.
function projectLegacyToSeparate(legacy) {
  const sharedKeys = ['age', 'gender', 'height_cm', 'weight_kg'];
  const shared = Object.fromEntries(
    sharedKeys.filter((k) => legacy[k] !== undefined).map((k) => [k, legacy[k]]),
  );
  const routine = {
    ...shared,
    ...(legacy.user_type !== undefined ? { user_type: legacy.user_type } : {}),
    ...(legacy.discipline !== undefined ? { discipline: legacy.discipline } : {}),
    ...(legacy.objective !== undefined ? { objective: legacy.objective } : {}),
    ...(legacy.level !== undefined ? { level: legacy.level } : {}),
    ...(legacy.activity_level !== undefined ? { activity_level: legacy.activity_level } : {}),
    ...(legacy.days_per_week !== undefined ? { days_per_week: legacy.days_per_week } : {}),
    ...(legacy.session_duration_min !== undefined ? { session_duration_min: legacy.session_duration_min } : {}),
    ...(legacy.injuries !== undefined ? { injuries: legacy.injuries } : {}),
    ...(legacy.available_equipment !== undefined ? { available_equipment: legacy.available_equipment } : {}),
    ...(legacy.notes !== undefined ? { notes: legacy.notes } : {}),
  };
  const nutrition = {
    ...shared,
    ...(legacy.activity_level !== undefined ? { activity_level: legacy.activity_level } : {}),
    ...(legacy.objective !== undefined ? { objective: legacy.objective } : {}),
    ...(legacy.dietary_restrictions !== undefined ? { dietary_restrictions: legacy.dietary_restrictions } : {}),
    ...(legacy.allergies !== undefined ? { allergies: legacy.allergies } : {}),
    ...(legacy.disliked_foods !== undefined ? { disliked_foods: legacy.disliked_foods } : {}),
  };
  return { routine, nutrition };
}

export default async function usersRoutes(fastify) {
  const auth = { preHandler: [fastify.authenticate] };

  // ── Routine profile ──────────────────────────────────────────
  fastify.get('/users/me/routine-profile', auth, async (req) => {
    const userId = req.user?.id ?? req.user?.sub;
    const u = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { routine_profile: true, fitness_profile: true },
    });
    // Fallback de lectura: si todavía no se ha llenado el separado
    // pero hay legacy, devolvemos los campos que sí aplican a rutina
    // para que el editor cargue datos sensatos en vez de vacío.
    const profile = u?.routine_profile
      ?? (u?.fitness_profile ? projectLegacyToSeparate(u.fitness_profile).routine : null)
      ?? null;
    return { profile };
  });

  fastify.patch('/users/me/routine-profile', auth, async (req, reply) => {
    const userId = req.user?.id ?? req.user?.sub;
    const parsed = RoutineProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_ROUTINE_PROFILE',
          message: 'Formato de perfil de rutina inválido.',
          details: parsed.error.flatten(),
        },
      });
    }
    const updated = await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        routine_profile: parsed.data,
        profile_completed: true,
      },
      select: { id: true, routine_profile: true, profile_completed: true, updated_at: true },
    });
    return { success: true, user: updated };
  });

  // ── Nutrition profile ────────────────────────────────────────
  fastify.get('/users/me/nutrition-profile', auth, async (req) => {
    const userId = req.user?.id ?? req.user?.sub;
    const u = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { nutrition_profile: true, fitness_profile: true },
    });
    const profile = u?.nutrition_profile
      ?? (u?.fitness_profile ? projectLegacyToSeparate(u.fitness_profile).nutrition : null)
      ?? null;
    return { profile };
  });

  fastify.patch('/users/me/nutrition-profile', auth, async (req, reply) => {
    const userId = req.user?.id ?? req.user?.sub;
    const parsed = NutritionProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'INVALID_NUTRITION_PROFILE',
          message: 'Formato de perfil de nutrición inválido.',
          details: parsed.error.flatten(),
        },
      });
    }
    const updated = await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        nutrition_profile: parsed.data,
        profile_completed: true,
      },
      select: { id: true, nutrition_profile: true, profile_completed: true, updated_at: true },
    });
    return { success: true, user: updated };
  });

  // ── Legacy unified profile (deprecated, kept for compat) ─────
  // El wizard nuevo NO usa este endpoint, pero clientes mobile / web
  // sin actualizar siguen pegando aquí. Proyectamos los campos a los
  // dos perfiles separados ADEMÁS de guardarlo en fitness_profile,
  // para que las cuentas migradas de inmediato vean los nuevos
  // perfiles llenos sin re-hacer el wizard.
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

    const { routine, nutrition } = projectLegacyToSeparate(parsed.data);

    const updated = await fastify.prisma.user.update({
      where: { id: userId },
      data: {
        fitness_profile: parsed.data,
        routine_profile: routine,
        nutrition_profile: nutrition,
        profile_completed: true,
      },
      select: {
        id: true,
        fitness_profile: true,
        routine_profile: true,
        nutrition_profile: true,
        profile_completed: true,
        updated_at: true,
      },
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
