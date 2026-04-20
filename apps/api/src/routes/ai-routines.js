// ─────────────────────────────────────────────────────────────────
// AI-generated routines.
//
// Mounted by @fastify/autoload at /ai/routines (via `autoPrefix`).
//
// Authenticated endpoints (JWT):
//   POST /ai/routines/generate   — generate & persist a new routine
//   GET  /ai/routines/me         — active routine for the caller
//   GET  /ai/routines/me/history — all routines (active + inactive)
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { generateJSON } from '../lib/openai.js';

export const autoPrefix = '/ai/routines';

// ── Validation schemas ────────────────────────────────────────────
const FITNESS_GOALS = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS'];
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LOCATIONS = ['GYM', 'HOME', 'BOTH'];

const generateBody = z.object({
    objective: z.enum(FITNESS_GOALS).optional(),
    level: z.enum(LEVELS).optional(),
    location: z.enum(LOCATIONS),
    days_per_week: z.number().int().min(2).max(6),
    available_equipment: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
    injuries: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
    session_duration_min: z.number().int().min(15).max(180).optional(),
    notes: z.string().trim().max(2000).optional(),
});

// Schema the model must return. Kept loose on exercise_id because
// invented exercises come back as null; we re-map ids ourselves.
const aiResponseSchema = z.object({
    routine: z.object({
        name: z.string().min(1).max(200),
        goal: z.enum(FITNESS_GOALS),
        location: z.enum(LOCATIONS),
        days_per_week: z.number().int().min(2).max(7),
    }),
    days: z.array(
        z.object({
            day_of_week: z.number().int().min(0).max(6),
            title: z.string().min(1).max(200),
            notes: z.string().nullable().optional(),
            exercises: z.array(
                z.object({
                    exercise_id: z.string().nullable().optional(),
                    exercise_name: z.string().min(1).max(200),
                    video_url: z.string().nullable().optional(),
                    sets: z.number().int().min(1).max(20),
                    reps: z.string().min(1).max(32),
                    rest_sec: z.number().int().min(0).max(600),
                    notes: z.string().nullable().optional(),
                })
            ).min(1).max(30),
        })
    ).min(1).max(7),
});

// ── Prompt builders ───────────────────────────────────────────────
const SYSTEM_PROMPT =
    'Eres un entrenador personal certificado que genera rutinas de entrenamiento personalizadas. ' +
    'Respondes SOLO con JSON válido siguiendo el esquema exacto proporcionado. ' +
    'Tu tono es profesional pero cercano, como un coach mexicano experimentado. ' +
    'Siempre respetas las lesiones del usuario y eliges ejercicios apropiados al nivel.';

function buildUserPrompt({
    days_per_week,
    objective,
    level,
    location,
    session_duration_min,
    available_equipment,
    injuries,
    notes,
    exerciseLibrary,
}) {
    const libJson = JSON.stringify(
        exerciseLibrary.map((e) => ({
            id: e.id,
            name: e.name,
            muscle_group: e.muscle_group,
            equipment: e.equipment,
            level: e.level,
        }))
    );
    const equipmentStr = (available_equipment && available_equipment.length > 0)
        ? available_equipment.join(', ')
        : '(ninguno/no aplica)';
    const injuriesStr = (injuries && injuries.length > 0)
        ? injuries.join(', ')
        : '(ninguna)';
    const notesStr = notes && notes.trim() ? notes.trim() : '(sin notas)';

    return `Genera una rutina semanal de ${days_per_week} días para este atleta.

PERFIL:
- Objetivo: ${objective}
- Nivel: ${level}
- Ubicación: ${location} (GYM = acceso completo a máquinas y pesos, HOME = solo lo que tenga en casa, BOTH = alterna)
- Duración por sesión: ${session_duration_min} minutos
- Equipo disponible en casa: ${equipmentStr}
- Lesiones/restricciones: ${injuriesStr}
- Notas: ${notesStr}

BIBLIOTECA DE EJERCICIOS DISPONIBLES (usa SOLO estos ejercicios cuando sea posible, o inventa variantes si es necesario):
${libJson}

REGLAS:
- Si hay lesiones, evita ejercicios que las empeoren
- Alterna grupos musculares (no entrenar pecho 2 días seguidos)
- Incluye 1 día de descanso mínimo si days_per_week < 7
- Ejercicios compuestos primero, aislamiento después
- Para BAJAR DE PESO: incluye cardio o circuitos HIIT al final
- Para HIPERTROFIA: 8-12 reps, descansos 60-90s
- Para FUERZA: 3-6 reps, descansos 2-3 min
- Para RESISTENCIA: 15+ reps o tiempo

SCHEMA JSON (respondes EXACTAMENTE esto, nada más):
{
  "routine": {
    "name": "string (ej 'Rutina pérdida de grasa 4 días')",
    "goal": "WEIGHT_LOSS | MUSCLE_GAIN | MAINTENANCE | STRENGTH | ENDURANCE | GENERAL_FITNESS",
    "location": "GYM | HOME | BOTH",
    "days_per_week": number
  },
  "days": [
    {
      "day_of_week": 0-6 (Mon=0),
      "title": "string (ej 'Empuje — pecho + hombros')",
      "notes": "string (tip del coach de 1 línea)",
      "exercises": [
        {
          "exercise_id": "id del Exercise si viene de la biblioteca, null si es inventado",
          "exercise_name": "string",
          "video_url": "string | null (del Exercise si tiene)",
          "sets": number,
          "reps": "string (ej '10' o '8-12' o '30s' o 'AMRAP')",
          "rest_sec": number,
          "notes": "string | null"
        }
      ]
    }
  ]
}`;
}

// ── Helpers ───────────────────────────────────────────────────────

// Merge user.fitness_profile JSON with the request body. Body wins.
function mergeProfile(body, fitnessProfile) {
    const fp = fitnessProfile && typeof fitnessProfile === 'object' ? fitnessProfile : {};
    return {
        objective: body.objective ?? fp.objective ?? fp.goal ?? 'GENERAL_FITNESS',
        level: body.level ?? fp.level ?? 'BEGINNER',
        location: body.location,
        days_per_week: body.days_per_week,
        available_equipment: body.available_equipment ?? fp.available_equipment ?? [],
        injuries: body.injuries ?? fp.injuries ?? [],
        session_duration_min: body.session_duration_min ?? fp.session_duration_min ?? 60,
        notes: body.notes ?? fp.notes ?? '',
    };
}

// Loads the exercise library for the workspace. For HOME, filter by
// equipment subset (exercise.equipment is a string[] on the model —
// we treat empty equipment as "bodyweight" always allowed).
async function loadExerciseLibrary(prisma, { workspace_id, location, available_equipment }) {
    const rows = await prisma.exercise.findMany({
        where: { workspace_id, is_active: true },
        orderBy: [{ muscle_group: 'asc' }, { name: 'asc' }],
        take: 500,
    });

    if (location !== 'HOME') return rows;

    const allowed = new Set(
        (available_equipment || [])
            .map((e) => String(e).toLowerCase())
            .concat(['bodyweight', 'none', ''])
    );
    return rows.filter((ex) => {
        const eq = (ex.equipment || []).map((e) => String(e).toLowerCase());
        if (eq.length === 0) return true; // bodyweight-friendly
        return eq.every((e) => allowed.has(e));
    });
}

// Serialize a routine with its nested days + exercises.
async function loadRoutineFull(prisma, routineId) {
    return prisma.routine.findUnique({
        where: { id: routineId },
        include: {
            days: {
                orderBy: { order_index: 'asc' },
                include: {
                    exercises: {
                        orderBy: { order_index: 'asc' },
                        include: { exercise: true },
                    },
                },
            },
        },
    });
}

// ═══════════════════════════════════════════════════════════════════
export default async function aiRoutinesRoutes(fastify) {
    const { prisma } = fastify;

    // ── POST /ai/routines/generate ────────────────────────────────
    fastify.post(
        '/generate',
        {
            preHandler: [fastify.authenticate],
            config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
        },
        async (req, reply) => {
            const parsed = generateBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const userId = req.user.sub || req.user.id;

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, workspace_id: true, fitness_profile: true },
            });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario no encontrado', 404);

            const merged = mergeProfile(parsed.data, user.fitness_profile);

            // 1. Load exercise library (filtered by equipment for HOME)
            const library = await loadExerciseLibrary(prisma, {
                workspace_id: user.workspace_id,
                location: merged.location,
                available_equipment: merged.available_equipment,
            });

            // 2. Build prompt + call OpenAI
            const userPrompt = buildUserPrompt({
                days_per_week: merged.days_per_week,
                objective: merged.objective,
                level: merged.level,
                location: merged.location,
                session_duration_min: merged.session_duration_min,
                available_equipment: merged.available_equipment,
                injuries: merged.injuries,
                notes: merged.notes,
                exerciseLibrary: library,
            });

            const { data, aiGenerationId, costUsd, durationMs } = await generateJSON({
                prisma,
                system: SYSTEM_PROMPT,
                user: userPrompt,
                schema: aiResponseSchema,
                kind: 'ROUTINE',
                workspace_id: user.workspace_id,
                user_id: user.id,
            });

            // 3. Re-map AI-returned exercise_ids to real Exercise rows.
            //    If the model hallucinated an id, null it out and fall
            //    back to exercise_name_snapshot.
            const libIds = new Set(library.map((e) => e.id));
            const libById = new Map(library.map((e) => [e.id, e]));

            // 4. Transaction: deactivate previous active routines +
            //    create the new one with its days/exercises.
            const routine = await prisma.$transaction(async (tx) => {
                await tx.routine.updateMany({
                    where: { user_id: user.id, is_active: true },
                    data: { is_active: false, ended_at: new Date() },
                });

                const newRoutine = await tx.routine.create({
                    data: {
                        workspace_id: user.workspace_id,
                        user_id: user.id,
                        name: data.routine.name,
                        goal: data.routine.goal,
                        location: data.routine.location,
                        days_per_week: data.routine.days_per_week,
                        source: 'AI_GENERATED',
                        ai_generation_id: aiGenerationId,
                        is_active: true,
                        started_at: new Date(),
                    },
                });

                for (let dIdx = 0; dIdx < data.days.length; dIdx++) {
                    const d = data.days[dIdx];
                    const day = await tx.routineDay.create({
                        data: {
                            routine_id: newRoutine.id,
                            day_of_week: d.day_of_week,
                            title: d.title,
                            notes: d.notes ?? null,
                            order_index: dIdx,
                        },
                    });
                    const exerciseRows = d.exercises.map((ex, eIdx) => {
                        const realId = ex.exercise_id && libIds.has(ex.exercise_id)
                            ? ex.exercise_id
                            : null;
                        const libRow = realId ? libById.get(realId) : null;
                        return {
                            routine_day_id: day.id,
                            exercise_id: realId,
                            exercise_name_snapshot: ex.exercise_name,
                            video_url: ex.video_url ?? libRow?.video_url ?? null,
                            sets: ex.sets,
                            reps: ex.reps,
                            rest_sec: ex.rest_sec,
                            order_index: eIdx,
                            notes: ex.notes ?? null,
                        };
                    });
                    if (exerciseRows.length > 0) {
                        await tx.routineExercise.createMany({ data: exerciseRows });
                    }
                }

                return newRoutine;
            });

            const full = await loadRoutineFull(prisma, routine.id);
            return reply.status(201).send({
                routine: full,
                ai: {
                    generation_id: aiGenerationId,
                    cost_usd: costUsd,
                    duration_ms: durationMs,
                },
            });
        }
    );

    // ── GET /ai/routines/me ──────────────────────────────────────
    fastify.get(
        '/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const routine = await prisma.routine.findFirst({
                where: { user_id: userId, is_active: true },
                orderBy: { created_at: 'desc' },
                include: {
                    days: {
                        orderBy: { order_index: 'asc' },
                        include: {
                            exercises: {
                                orderBy: { order_index: 'asc' },
                                include: { exercise: true },
                            },
                        },
                    },
                },
            });
            return { routine };
        }
    );

    // ── GET /ai/routines/me/history ──────────────────────────────
    fastify.get(
        '/me/history',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const routines = await prisma.routine.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                include: {
                    days: {
                        orderBy: { order_index: 'asc' },
                        include: {
                            exercises: {
                                orderBy: { order_index: 'asc' },
                            },
                        },
                    },
                },
                take: 50,
            });
            return { routines };
        }
    );
}
