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
// Staff (RECEPTIONIST/TRAINER/ADMIN/SUPERADMIN):
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
import {
    rotateTokenForUser,
    getCurrentTokenForUser,
    validateToken,
    consumeToken,
    QR_TTL_SECONDS,
} from '../lib/qr.js';

// ─── Plan access windows (Fase 9) ──────────────────────────────
// Keys: 0=Sun .. 6=Sat (JS `getDay()` convention).
// Each entry is an array of [startHour, endHour) — hour-precision is enough.
const PLAN_WINDOWS = {
    STARTER: {
        // L-V (1..5): 06-10 + 19-22
        1: [[6, 10], [19, 22]],
        2: [[6, 10], [19, 22]],
        3: [[6, 10], [19, 22]],
        4: [[6, 10], [19, 22]],
        5: [[6, 10], [19, 22]],
    },
    PRO: {
        1: [[6, 22]],
        2: [[6, 22]],
        3: [[6, 22]],
        4: [[6, 22]],
        5: [[6, 22]],
        6: [[7, 14]], // sábado
    },
    ELITE: {
        // 24/7 — any hour of any day.
        0: [[0, 24]],
        1: [[0, 24]],
        2: [[0, 24]],
        3: [[0, 24]],
        4: [[0, 24]],
        5: [[0, 24]],
        6: [[0, 24]],
    },
};

function isWithinPlanWindow(plan, date = new Date()) {
    const windows = PLAN_WINDOWS[plan];
    if (!windows) return true; // unknown plan → don't block
    const dow = date.getDay();
    const slots = windows[dow];
    if (!slots || slots.length === 0) return false;
    const hour = date.getHours();
    return slots.some(([start, end]) => hour >= start && hour < end);
}

function nextWindowHint(plan, date = new Date()) {
    const windows = PLAN_WINDOWS[plan];
    if (!windows) return '';
    // Look ahead up to 7 days for the next open slot.
    for (let offset = 0; offset < 7; offset += 1) {
        const d = new Date(date);
        d.setDate(d.getDate() + offset);
        const slots = windows[d.getDay()];
        if (!slots) continue;
        for (const [start, end] of slots) {
            if (offset === 0 && date.getHours() >= end) continue;
            const hh = String(start).padStart(2, '0');
            const hhEnd = String(end).padStart(2, '0');
            const label = offset === 0 ? 'hoy' : dayjs(d).format('ddd DD/MM');
            return `${label} ${hh}:00–${hhEnd}:00`;
        }
    }
    return '';
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

            // 3. Plan-based access window
            if (!isWithinPlanWindow(membership.plan, now)) {
                return reply.status(403).send({
                    error: {
                        code: 'OUT_OF_HOURS',
                        message: `Tu plan ${membership.plan} no permite acceso en este horario`,
                        next_window: nextWindowHint(membership.plan, now),
                    },
                    statusCode: 403,
                });
            }

            // 4. Anti-double-scan (<10 min). Incluimos datos del socio en
            //    la respuesta DUPLICATE para que la UI de recepción
            //    pueda mostrar "Pedro González ya ingresó hace 4 min —
            //    [Permitir reingreso]" sin un segundo round-trip.
            const lockKey = `checkin:lock:${userId}`;
            const acquired = await redis.set(lockKey, '1', 'EX', 10 * 60, 'NX');
            if (acquired !== 'OK') {
                const ttl = await redis.ttl(lockKey);
                return reply.status(409).send({
                    error: {
                        code: 'DUPLICATE',
                        message: 'Ya hay un check-in reciente',
                        retry_after_sec: ttl,
                        user_id: user.id,
                        user_name: user.full_name || user.name,
                    },
                    statusCode: 409,
                });
            }

            // 5. Persist check-in
            const checkIn = await prisma.checkIn.create({
                data: {
                    workspace_id: workspaceId || user.workspace_id,
                    user_id: user.id,
                    method: 'QR',
                },
            });

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
                member: {
                    id: user.id,
                    name: user.full_name || user.name,
                    avatar_url: user.avatar_url || null,
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
                fastify.requireRole('RECEPTIONIST', 'TRAINER', 'ADMIN', 'SUPERADMIN'),
            ],
        },
        async (req) => {
            const parsed = manualBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
            const { user_id, method, override, reason } = parsed.data;
            const staffId = req.user.sub || req.user.id;

            const user = await prisma.user.findUnique({
                where: { id: user_id },
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
                fastify.requireRole('RECEPTIONIST', 'TRAINER', 'ADMIN', 'SUPERADMIN'),
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
            const workspace_id = staffWorkspace?.workspace_id || fastify.defaultWorkspaceId;

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
            const workspace_id = admin?.workspace_id || fastify.defaultWorkspaceId;

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
