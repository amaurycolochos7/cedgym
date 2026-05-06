// ─────────────────────────────────────────────────────────────────
// Check-in + QR endpoints.
//
// Athlete (JWT):
//   GET  /checkins/me/qr-token
//   GET  /checkins/me/history
//
// Public scanner (no auth — a rotating QR is the only credential):
//   POST /checkins/scan
//
// Staff (RECEPTIONIST/ADMIN/SUPERADMIN):
//   POST /checkins/manual
//   GET  /checkins/today
//
// Admin:
//   GET  /admin/checkins
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import dayjs from 'dayjs';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { audit, auditCtx } from '../lib/audit.js';
import { assertWorkspaceAccess } from '../lib/tenant-guard.js';
import {
    rotateTokenForUser,
    getCurrentTokenForUser,
    validateToken,
    consumeToken,
    QR_TTL_SECONDS,
} from '../lib/qr.js';

// ─── Política de visitas por plan (2026-05) ────────────────────
//
// Reemplazo de la tabla anterior PLAN_WINDOWS basada en horarios
// AM/PM. La nueva política es de "visitas por día":
//
//   STARTER → 1 visita al día, sin restricción de hora del gym.
//   PRO     → ilimitadas.
//   ELITE   → ilimitadas.
//
// Re-entry: el socio puede salir y volver dentro de
// REENTRY_WINDOW_MIN minutos después de su scan más reciente
// SIN que cuente como nueva visita. Útil para "olvidé el casillero",
// "fui por agua al carro", etc. Aplica a todos los planes.
//
// Anti-double-scan: ANTI_DOUBLE_SCAN_SEC es el cooldown corto que
// bloquea silenciosamente double-taps accidentales (la cámara
// detecta el QR varias veces por segundo).
//
// Si recepción quiere forzar un reingreso fuera del límite diario
// (por ejemplo, atleta con plan Básico que regresa de tarde y la
// gerencia autoriza), el endpoint /checkins/manual con override:true
// salta esta política.
const DAILY_VISIT_LIMITS = {
    STARTER: 1,
    PRO: Infinity,
    ELITE: Infinity,
};
const REENTRY_WINDOW_MIN = 90;
const ANTI_DOUBLE_SCAN_SEC = 30;

// Cuenta cuántas "visitas" hubo hoy a partir de los CheckIn rows.
// Una visita = un scan + cualquier scan dentro de los siguientes
// REENTRY_WINDOW_MIN minutos. Asume `checkins` ordenado ascendente
// por scanned_at.
function countDailyVisits(checkins, windowMin = REENTRY_WINDOW_MIN) {
    if (!checkins || checkins.length === 0) return 0;
    let visits = 1;
    for (let i = 1; i < checkins.length; i += 1) {
        const minsBetween = dayjs(checkins[i].scanned_at).diff(
            checkins[i - 1].scanned_at,
            'minute',
        );
        if (minsBetween >= windowMin) visits += 1;
    }
    return visits;
}

// ─── Schemas ──────────────────────────────────────────────────
const scanBody = z.object({
    token: z.string().trim().min(16).max(80),
});

const manualBody = z.object({
    user_id: z.string().trim().min(1),
    method: z.enum(['MANUAL', 'BIOMETRIC']).default('MANUAL'),
    // Flag para permitir reingreso dentro del cooldown (solo staff logueado).
    // Cuando true, saltea el bloqueo DUPLICATE y registra en audit_log.
    override: z.boolean().optional(),
    reason: z.string().trim().max(200).optional(),
});

const historyQuery = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const todayQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

const adminListQuery = z.object({
    user_id: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    method: z.enum(['QR', 'MANUAL', 'BIOMETRIC']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ─── Helpers ──────────────────────────────────────────────────

// Upsert UserProgress streak + XP after a successful check-in.
// A streak continues if last_checkin_date is yesterday; resets if
// older. Same-day check-ins don't re-bump the streak.
async function bumpGamification(prisma, userId, scannedAt) {
    const today = dayjs(scannedAt).startOf('day');
    const yesterday = today.subtract(1, 'day');

    const progress = await prisma.userProgress.findUnique({ where: { user_id: userId } });

    let newStreak;
    let newLongest;
    if (!progress) {
        newStreak = 1;
        newLongest = 1;
    } else if (!progress.last_checkin_date) {
        newStreak = 1;
        newLongest = Math.max(1, progress.longest_streak_days || 0);
    } else {
        const last = dayjs(progress.last_checkin_date).startOf('day');
        if (last.isSame(today)) {
            // Same-day re-scan — no streak change.
            return { progress, bumped: false };
        }
        if (last.isSame(yesterday)) {
            newStreak = (progress.current_streak_days || 0) + 1;
        } else {
            newStreak = 1;
        }
        newLongest = Math.max(newStreak, progress.longest_streak_days || 0);
    }

    const updated = await prisma.userProgress.upsert({
        where: { user_id: userId },
        create: {
            user_id: userId,
            xp: 10,
            level: 1,
            current_streak_days: newStreak,
            longest_streak_days: newLongest,
            last_checkin_date: scannedAt,
            total_checkins: 1,
        },
        update: {
            xp: { increment: 10 },
            current_streak_days: newStreak,
            longest_streak_days: newLongest,
            last_checkin_date: scannedAt,
            total_checkins: { increment: 1 },
        },
    });
    return { progress: updated, bumped: true };
}

// ─────────────────────────────────────────────────────────────
export default async function checkinsRoutes(fastify) {
    const { prisma, redis } = fastify;

    // ─── GET /checkins/me/qr-token ──────────────────────────────
    fastify.get(
        '/checkins/me/qr-token',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, workspace_id: true },
            });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);
            const { token, expires_in } = await getCurrentTokenForUser(redis, user.workspace_id, user.id);
            return { token, expires_in, ttl_seconds: QR_TTL_SECONDS };
        }
    );

    // ─── GET /checkins/me/history ───────────────────────────────
    fastify.get(
        '/checkins/me/history',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = historyQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const userId = req.user.sub || req.user.id;
            const rows = await prisma.checkIn.findMany({
                where: { user_id: userId },
                orderBy: { scanned_at: 'desc' },
                take: parsed.data.limit,
            });
            return { check_ins: rows };
        }
    );

    // ─── POST /checkins/scan ────────────────────────────────────
    fastify.post(
        '/checkins/scan',
        {
            // Rate limit the scanner so a looping script can't burn it.
            config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
        },
        async (req, reply) => {
            const parsed = scanBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const { token } = parsed.data;

            // 1. Atomic consume — burns the token so a screenshot/copy
            //    cannot re-enter within its 90 s TTL. If the token was
            //    already used (or never existed) this returns null.
            const resolved = await consumeToken(redis, token);
            if (!resolved) {
                return reply.status(400).send({
                    error: { code: 'EXPIRED_QR', message: 'QR inválido, expirado o ya usado' },
                    statusCode: 400,
                });
            }
            const { userId, workspaceId } = resolved;

            // 2. Load user + membership in one round-trip.
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { membership: true },
            });
            if (!user) {
                return reply.status(404).send({
                    error: { code: 'USER_NOT_FOUND', message: 'Usuario no existe' },
                    statusCode: 404,
                });
            }
            if (user.status !== 'ACTIVE') {
                return reply.status(403).send({
                    error: { code: 'USER_INACTIVE', message: 'Cuenta suspendida o sin verificar' },
                    statusCode: 403,
                });
            }

            // Selfie gate — the receptionist needs the selfie to identify
            // the socio at the door, and the welcome onboarding makes the
            // socio upload it as part of their first-login flow. Block QR
            // entry until that's done so the system stays trustworthy.
            if (!user.selfie_url) {
                return reply.status(403).send({
                    error: {
                        code: 'SELFIE_MISSING',
                        message: 'El socio aún no ha subido su selfie. Pídele que complete su onboarding desde el link de WhatsApp.',
                        user_id: user.id,
                        user_name: user.full_name || user.name,
                    },
                    statusCode: 403,
                });
            }

            const membership = user.membership;
            if (!membership) {
                return reply.status(403).send({
                    error: { code: 'NO_MEMBERSHIP', message: 'El atleta no tiene membresía activa' },
                    statusCode: 403,
                });
            }
            const now = new Date();
            if (membership.status !== 'ACTIVE' || membership.expires_at < now) {
                return reply.status(403).send({
                    error: {
                        code: 'INACTIVE',
                        message: 'Membresía vencida o suspendida',
                        expires_at: membership.expires_at,
                    },
                    statusCode: 403,
                });
            }

            // 3. Anti-double-scan (cooldown ultra-corto). La cámara detecta
            //    el mismo QR ~10 fps mientras está delante; sin esto cada
            //    scan exitoso dispararía 5+ peticiones. Lock de 30s en Redis.
            const lockKey = `checkin:lock:${userId}`;
            const acquired = await redis.set(
                lockKey,
                '1',
                'EX',
                ANTI_DOUBLE_SCAN_SEC,
                'NX',
            );
            if (acquired !== 'OK') {
                return reply.status(409).send({
                    error: {
                        code: 'DUPLICATE_FAST',
                        message: 'Scan repetido — espera unos segundos.',
                        user_id: user.id,
                        user_name: user.full_name || user.name,
                    },
                    statusCode: 409,
                });
            }

            // 4. Política de visitas/día + re-entry. Trae los check-ins de
            //    hoy en orden ascendente para detectar re-entry y contar
            //    visitas reales (= scans separados >REENTRY_WINDOW_MIN).
            const startOfDay = dayjs(now).startOf('day').toDate();
            const todayCheckins = await prisma.checkIn.findMany({
                where: {
                    user_id: user.id,
                    scanned_at: { gte: startOfDay },
                },
                orderBy: { scanned_at: 'asc' },
            });

            const dailyLimit = DAILY_VISIT_LIMITS[membership.plan] ?? Infinity;
            const lastCheckin = todayCheckins[todayCheckins.length - 1] || null;
            const minsSinceLast = lastCheckin
                ? dayjs(now).diff(lastCheckin.scanned_at, 'minute')
                : Infinity;
            const isReentry =
                lastCheckin !== null && minsSinceLast < REENTRY_WINDOW_MIN;
            const visitsBefore = countDailyVisits(todayCheckins);

            // Solo bloqueamos si NO es re-entry (está más allá de la
            // ventana) y ya alcanzó/excedió el límite diario del plan.
            if (!isReentry && visitsBefore >= dailyLimit) {
                // Liberamos el lock que acabamos de tomar para que un
                // override manual de recepción no choque con TTL viejo.
                try {
                    await redis.del(lockKey);
                } catch {
                    /* noop */
                }
                return reply.status(403).send({
                    error: {
                        code: 'DAILY_LIMIT_REACHED',
                        message: `Tu plan ${membership.plan === 'STARTER' ? 'Básico' : membership.plan} solo permite ${dailyLimit} ${dailyLimit === 1 ? 'visita' : 'visitas'} al día. Vuelve mañana.`,
                        plan: membership.plan,
                        daily_limit: dailyLimit,
                        visits_today: visitsBefore,
                        last_checkin_at: lastCheckin.scanned_at,
                        user_id: user.id,
                        user_name: user.full_name || user.name,
                    },
                    statusCode: 403,
                });
            }

            // 5. Persist check-in (re-entry incluida — las contamos como
            //    rows pero la lógica de "visitas reales" usa la ventana
            //    de re-entry para no inflar el contador).
            const checkIn = await prisma.checkIn.create({
                data: {
                    workspace_id: workspaceId || user.workspace_id,
                    user_id: user.id,
                    method: 'QR',
                },
            });
            const visitNumber = isReentry ? visitsBefore : visitsBefore + 1;

            // 6. Gamification
            let streakDays = 0;
            try {
                const gam = await bumpGamification(prisma, user.id, checkIn.scanned_at);
                streakDays = gam.progress?.current_streak_days || 0;
            } catch (e) {
                req.log.warn({ err: e }, '[checkins/scan] gamification update failed');
            }

            // 7. Fire event (fire-and-forget)
            fireEvent('member.checked_in', {
                workspaceId: workspaceId || user.workspace_id,
                user_id: user.id,
                checkin_id: checkIn.id,
                method: 'QR',
            }).catch((e) => req.log.warn({ err: e }, '[checkins/scan] fireEvent failed'));

            return {
                success: true,
                check_in_id: checkIn.id,
                // Info de la visita para que la UI de recepción muestre
                // si fue re-entry, primer entrada, o si está cerca del
                // límite del plan ("2/Ilim hoy" / "1/1 hoy").
                visit: {
                    is_reentry: isReentry,
                    number: visitNumber,
                    daily_limit:
                        dailyLimit === Infinity ? null : dailyLimit,
                    mins_since_last: lastCheckin ? minsSinceLast : null,
                },
                member: {
                    id: user.id,
                    name: user.full_name || user.name,
                    avatar_url: user.avatar_url || null,
                    selfie_url: user.selfie_url || null,
                    plan: membership.plan,
                    expires_at: membership.expires_at,
                    current_streak_days: streakDays,
                },
            };
        }
    );

    // ─── POST /checkins/manual (staff) ──────────────────────────
    fastify.post(
        '/checkins/manual',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('RECEPTIONIST', 'ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const parsed = manualBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
            const { user_id, method, override, reason } = parsed.data;
            const staffId = req.user.sub || req.user.id;
            const staffWs = assertWorkspaceAccess(req);

            // Tenant guard: the staff member can only check in users from
            // their own workspace. Pre-fix receptionist_b could check in
            // athlete_a — creating a CheckIn in workspace_a, bumping
            // their gamification streak, and firing member.checked_in
            // in someone else's tenant.
            const user = await prisma.user.findFirst({
                where: { id: user_id, workspace_id: staffWs },
                include: { membership: true },
            });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            // Idempotency lock (shorter window — staff sometimes double-clicks)
            // Cuando override=true, el staff FUERZA el reingreso y reseteamos
            // el lock para el próximo ciclo — queda todo auditado.
            const lockKey = `checkin:lock:${user_id}`;
            if (override) {
                await redis.del(lockKey);
                await redis.set(lockKey, '1', 'EX', 5 * 60); // reset cooldown
            } else {
                const acquired = await redis.set(lockKey, '1', 'EX', 5 * 60, 'NX');
                if (acquired !== 'OK') {
                    throw err('DUPLICATE', 'Ya hay un check-in reciente', 409);
                }
            }

            const checkIn = await prisma.checkIn.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    method,
                    staff_id: staffId,
                },
            });

            // Audit para overrides — deja rastro de quién autorizó el reingreso.
            if (override) {
                audit(fastify, {
                    workspace_id: user.workspace_id,
                    actor_id: staffId,
                    action: 'checkin.override',
                    target_type: 'user',
                    target_id: user.id,
                    metadata: {
                        member_name: user.full_name || user.name,
                        reason: reason || null,
                        check_in_id: checkIn.id,
                    },
                    ...auditCtx(req),
                }).catch(() => {});
            }

            try {
                await bumpGamification(prisma, user.id, checkIn.scanned_at);
            } catch (e) {
                req.log.warn({ err: e }, '[checkins/manual] gamification failed');
            }

            fireEvent('member.checked_in', {
                workspaceId: user.workspace_id,
                user_id: user.id,
                checkin_id: checkIn.id,
                method,
                staff_id: staffId,
            }).catch((e) => req.log.warn({ err: e }, '[checkins/manual] fireEvent failed'));

            return { check_in: checkIn };
        }
    );

    // ─── GET /checkins/today (staff) ────────────────────────────
    fastify.get(
        '/checkins/today',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('RECEPTIONIST', 'ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const parsed = todayQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { page, limit } = parsed.data;

            const staffWorkspace = await prisma.user.findUnique({
                where: { id: req.user.sub || req.user.id },
                select: { workspace_id: true },
            });
            const workspace_id = assertWorkspaceAccess(req);

            const startOfDay = dayjs().startOf('day').toDate();
            const where = { workspace_id, scanned_at: { gte: startOfDay } };

            const [total, rows] = await Promise.all([
                prisma.checkIn.count({ where }),
                prisma.checkIn.findMany({
                    where,
                    orderBy: { scanned_at: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                    include: {
                        user: {
                            select: {
                                id: true, name: true, full_name: true,
                                avatar_url: true, phone: true, email: true,
                            },
                        },
                    },
                }),
            ]);

            return { total, page, limit, check_ins: rows };
        }
    );

    // ─── GET /admin/checkins ────────────────────────────────────
    fastify.get(
        '/admin/checkins',
        {
            preHandler: [
                fastify.authenticate,
                fastify.requireRole('ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const parsed = adminListQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { user_id, from, to, method, page, limit } = parsed.data;

            const admin = await prisma.user.findUnique({
                where: { id: req.user.sub || req.user.id },
                select: { workspace_id: true },
            });
            const workspace_id = assertWorkspaceAccess(req);

            const where = { workspace_id };
            if (user_id) where.user_id = user_id;
            if (method)  where.method  = method;
            if (from || to) {
                where.scanned_at = {};
                if (from) where.scanned_at.gte = new Date(from);
                if (to)   where.scanned_at.lte = new Date(to);
            }

            const [total, rows] = await Promise.all([
                prisma.checkIn.count({ where }),
                prisma.checkIn.findMany({
                    where,
                    orderBy: { scanned_at: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                    include: {
                        user: {
                            select: { id: true, name: true, full_name: true, email: true, phone: true },
                        },
                    },
                }),
            ]);

            return {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
                check_ins: rows,
            };
        }
    );
}
