// ─────────────────────────────────────────────────────────────────
// Group classes (ClassSchedule + ClassBooking).
//
// Authenticated (JWT):
//   GET    /classes                    — list (from, to, sport)
//   POST   /classes/:id/book           — book or waitlist
//   DELETE /classes/:id/booking        — cancel own booking
//   POST   /classes/:id/attendance     — staff: mark bookings ATTENDED/NO_SHOW
//   GET    /classes/me/upcoming        — next bookings
//   GET    /classes/me/history         — past bookings
//
// Admin / Staff:
//   POST /admin/classes                — create (optional weekly repetition)
//   PATCH /admin/classes/:id
//   POST /admin/classes/:id/cancel     — cancel class + notify all bookings
//
// Rules:
//   • booking requires membership status=ACTIVE
//   • booking respects `min_plan` (STARTER < PRO < ELITE)
//   • when class is full → status=WAITLIST with queue position
//   • cancel < 2h before start → counts as NO_SHOW, not CANCELED
//   • 3 NO_SHOW in rolling 30 days → redis ban (noshow:ban:{userId}, 7d)
//     blocks new bookings
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import dayjs from 'dayjs';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';

// ─── Config ──────────────────────────────────────────────────────
const NOSHOW_THRESHOLD = 3;
const NOSHOW_WINDOW_DAYS = 30;
const NOSHOW_BAN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const CANCEL_MIN_HOURS = 2; // cancel < 2h → no-show

const PLAN_RANK = { STARTER: 1, PRO: 2, ELITE: 3 };

// ─── Schemas ─────────────────────────────────────────────────────
const listQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    sport: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

const attendanceBody = z.object({
    records: z.array(z.object({
        booking_id: z.string(),
        status: z.enum(['ATTENDED', 'NO_SHOW']),
    })).min(1),
});

const createClassBody = z.object({
    name: z.string().trim().min(2).max(200),
    sport: z.enum([
        'FOOTBALL', 'BOXING', 'MMA', 'POWERLIFTING', 'CROSSFIT',
        'WEIGHTLIFTING', 'GENERAL_FITNESS', 'RUNNING', 'NUTRITION', 'OTHER',
    ]),
    trainer_id: z.string().min(1),
    starts_at: z.string(),
    duration_min: z.number().int().min(10).max(300),
    capacity: z.number().int().min(1).max(500),
    location: z.string().min(1),
    min_plan: z.enum(['STARTER', 'PRO', 'ELITE']).nullable().optional(),
    // Weekly repetition (optional): number of *additional* weeks to replicate
    repeat_weeks: z.number().int().min(0).max(52).optional().default(0),
});

const patchClassBody = z.object({
    name: z.string().trim().min(2).max(200).optional(),
    trainer_id: z.string().optional(),
    starts_at: z.string().optional(),
    duration_min: z.number().int().min(10).max(300).optional(),
    capacity: z.number().int().min(1).max(500).optional(),
    location: z.string().optional(),
    min_plan: z.enum(['STARTER', 'PRO', 'ELITE']).nullable().optional(),
});

const cancelClassBody = z.object({
    reason: z.string().trim().max(500).optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────
function isStaffRole(role) {
    return role === 'RECEPTIONIST' || role === 'TRAINER' || role === 'ADMIN' || role === 'SUPERADMIN';
}

async function checkNoShowBan(fastify, userId) {
    const { redis, prisma } = fastify;
    // Fast path: redis ban key.
    try {
        const banned = await redis.get(`noshow:ban:${userId}`);
        if (banned) return { banned: true, until: 'redis', source: 'cache' };
    } catch (e) {
        // redis down — fall through to DB count.
        fastify.log.warn({ err: e }, '[classes] redis get failed, falling back to DB');
    }
    // Slow path: count NO_SHOW in last 30 days.
    const since = dayjs().subtract(NOSHOW_WINDOW_DAYS, 'day').toDate();
    const count = await prisma.classBooking.count({
        where: {
            user_id: userId,
            status: 'NO_SHOW',
            booked_at: { gte: since },
        },
    });
    if (count >= NOSHOW_THRESHOLD) {
        // Re-set the ban key (defense-in-depth).
        try {
            await redis.set(`noshow:ban:${userId}`, '1', 'EX', NOSHOW_BAN_TTL_SEC);
        } catch {}
        return { banned: true, count, source: 'db' };
    }
    return { banned: false, count };
}

// Promote the first WAITLIST booking for a class to CONFIRMED (best-effort).
async function promoteWaitlist(fastify, classId) {
    const { prisma } = fastify;
    const next = await prisma.classBooking.findFirst({
        where: { class_id: classId, status: 'WAITLIST' },
        orderBy: { booked_at: 'asc' },
    });
    if (!next) return null;
    const updated = await prisma.classBooking.update({
        where: { id: next.id },
        data: { status: 'CONFIRMED' },
    });
    return updated;
}

// ─────────────────────────────────────────────────────────────────
export default async function classesRoutes(fastify) {
    const { prisma, redis } = fastify;

    // ─── GET /classes ─────────────────────────────────────────────
    fastify.get(
        '/classes',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = listQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { from, to, sport, page, limit } = parsed.data;

            const where = {};
            if (sport) where.sport = sport;
            if (from || to) {
                where.starts_at = {};
                if (from) where.starts_at.gte = new Date(from);
                if (to) where.starts_at.lte = new Date(to);
            } else {
                // Default: from now → next 14 days.
                where.starts_at = {
                    gte: new Date(),
                    lte: dayjs().add(14, 'day').toDate(),
                };
            }

            const [total, rows] = await Promise.all([
                prisma.classSchedule.count({ where }),
                prisma.classSchedule.findMany({
                    where,
                    orderBy: { starts_at: 'asc' },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
            ]);

            // Decorate with available spots.
            const classes = rows.map((c) => ({
                ...c,
                spots_available: Math.max(0, c.capacity - c.booked),
                full: c.booked >= c.capacity,
            }));

            return {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
                classes,
            };
        }
    );

    // ─── POST /classes/:id/book ───────────────────────────────────
    fastify.post(
        '/classes/:id/book',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const classId = req.params.id;
            const userId = req.user.sub || req.user.id;

            // 1. No-show ban?
            const ban = await checkNoShowBan(fastify, userId);
            if (ban.banned) {
                throw err(
                    'NOSHOW_BAN',
                    'Tienes 3 o más ausencias en los últimos 30 días. Tu acceso a reservas está bloqueado 7 días.',
                    403
                );
            }

            // 2. Class exists?
            const klass = await prisma.classSchedule.findUnique({ where: { id: classId } });
            if (!klass) throw err('CLASS_NOT_FOUND', 'Clase no encontrada', 404);
            if (dayjs(klass.starts_at).isBefore(dayjs())) {
                throw err('CLASS_STARTED', 'La clase ya empezó', 400);
            }

            // 3. Membership + plan gate.
            const membership = await prisma.membership.findUnique({ where: { user_id: userId } });
            if (!membership) throw err('NO_MEMBERSHIP', 'Necesitas una membresía activa', 403);
            if (membership.status !== 'ACTIVE') {
                throw err('MEMBERSHIP_NOT_ACTIVE', 'Tu membresía no está activa', 403);
            }
            if (klass.min_plan) {
                if ((PLAN_RANK[membership.plan] || 0) < (PLAN_RANK[klass.min_plan] || 0)) {
                    throw err(
                        'PLAN_INSUFFICIENT',
                        `Esta clase requiere plan ${klass.min_plan} o superior`,
                        403
                    );
                }
            }

            // 4. Existing booking?
            const existing = await prisma.classBooking.findUnique({
                where: { class_id_user_id: { class_id: classId, user_id: userId } },
            });
            if (existing && existing.status !== 'CANCELED') {
                throw err('ALREADY_BOOKED', 'Ya tienes una reserva para esta clase', 409);
            }

            // 5. Capacity gate → CONFIRMED or WAITLIST.
            //
            // We do this in a transaction to avoid oversubscribing under race.
            // If the booking was previously CANCELED we update it rather than
            // creating a new row (the @@unique would otherwise fail).
            const { booking, waitlistPosition } = await prisma.$transaction(async (tx) => {
                const fresh = await tx.classSchedule.findUnique({ where: { id: classId } });
                if (!fresh) throw err('CLASS_NOT_FOUND', 'Clase no encontrada', 404);

                const status = fresh.booked >= fresh.capacity ? 'WAITLIST' : 'CONFIRMED';

                const saved = existing
                    ? await tx.classBooking.update({
                        where: { id: existing.id },
                        data: { status, booked_at: new Date(), canceled_at: null, attended_at: null },
                    })
                    : await tx.classBooking.create({
                        data: { class_id: classId, user_id: userId, status },
                    });

                if (status === 'CONFIRMED') {
                    await tx.classSchedule.update({
                        where: { id: classId },
                        data: { booked: { increment: 1 } },
                    });
                }

                let waitlistPosition = null;
                if (status === 'WAITLIST') {
                    waitlistPosition = await tx.classBooking.count({
                        where: { class_id: classId, status: 'WAITLIST', booked_at: { lte: saved.booked_at } },
                    });
                }

                return { booking: saved, waitlistPosition };
            });

            // 6. Event fire (fire-and-forget).
            await fireEvent('class.booked', {
                workspaceId: klass.workspace_id,
                userId,
                classId,
                bookingId: booking.id,
                status: booking.status,
                classStartsAt: klass.starts_at,
            });

            return {
                booking,
                waitlist_position: waitlistPosition,
            };
        }
    );

    // ─── DELETE /classes/:id/booking ──────────────────────────────
    fastify.delete(
        '/classes/:id/booking',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const classId = req.params.id;
            const userId = req.user.sub || req.user.id;

            const klass = await prisma.classSchedule.findUnique({ where: { id: classId } });
            if (!klass) throw err('CLASS_NOT_FOUND', 'Clase no encontrada', 404);

            const booking = await prisma.classBooking.findUnique({
                where: { class_id_user_id: { class_id: classId, user_id: userId } },
            });
            if (!booking || ['CANCELED', 'NO_SHOW', 'ATTENDED'].includes(booking.status)) {
                throw err('BOOKING_NOT_FOUND', 'Sin reserva activa para cancelar', 404);
            }

            const hoursUntilClass = dayjs(klass.starts_at).diff(dayjs(), 'hour', true);
            const lateCancel = hoursUntilClass < CANCEL_MIN_HOURS;
            const wasConfirmed = booking.status === 'CONFIRMED';

            let promoted = null;
            let noShowBan = false;

            await prisma.$transaction(async (tx) => {
                // Late cancel → NO_SHOW (still frees the slot).
                // On-time cancel → CANCELED.
                const newStatus = lateCancel ? 'NO_SHOW' : 'CANCELED';
                await tx.classBooking.update({
                    where: { id: booking.id },
                    data: {
                        status: newStatus,
                        canceled_at: new Date(),
                    },
                });

                if (wasConfirmed) {
                    await tx.classSchedule.update({
                        where: { id: classId },
                        data: { booked: { decrement: 1 } },
                    });
                }
            });

            // Promote first waitlist (outside the tx is fine — worst case two users
            // both get CONFIRMED if booked<capacity still holds).
            if (wasConfirmed) {
                promoted = await promoteWaitlist(fastify, classId);
                if (promoted) {
                    await prisma.classSchedule.update({
                        where: { id: classId },
                        data: { booked: { increment: 1 } },
                    });
                    await fireEvent('class.cancellation_alert', {
                        workspaceId: klass.workspace_id,
                        userId: promoted.user_id,
                        classId,
                        bookingId: promoted.id,
                        promotedFromWaitlist: true,
                        classStartsAt: klass.starts_at,
                    });
                }
            }

            // No-show ban check (only after late cancel, since that counts).
            if (lateCancel) {
                const since = dayjs().subtract(NOSHOW_WINDOW_DAYS, 'day').toDate();
                const count = await prisma.classBooking.count({
                    where: { user_id: userId, status: 'NO_SHOW', booked_at: { gte: since } },
                });
                if (count >= NOSHOW_THRESHOLD) {
                    try {
                        await redis.set(`noshow:ban:${userId}`, '1', 'EX', NOSHOW_BAN_TTL_SEC);
                        noShowBan = true;
                    } catch (e) {
                        fastify.log.warn({ err: e }, '[classes] could not set noshow ban');
                    }
                }
            }

            return {
                canceled: true,
                late_cancel: lateCancel,
                counted_as_no_show: lateCancel,
                no_show_ban: noShowBan,
                promoted_waitlist_user_id: promoted ? promoted.user_id : null,
            };
        }
    );

    // ─── POST /classes/:id/attendance ─────────────────────────────
    fastify.post(
        '/classes/:id/attendance',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            if (!isStaffRole(req.user.role)) {
                throw err('FORBIDDEN', 'Acción solo para staff', 403);
            }

            const parsed = attendanceBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

            const classId = req.params.id;
            const updated = [];
            const bansTriggered = [];

            for (const rec of parsed.data.records) {
                const b = await prisma.classBooking.findUnique({ where: { id: rec.booking_id } });
                if (!b || b.class_id !== classId) continue;
                const row = await prisma.classBooking.update({
                    where: { id: b.id },
                    data: {
                        status: rec.status,
                        attended_at: rec.status === 'ATTENDED' ? new Date() : null,
                    },
                });
                updated.push(row);

                if (rec.status === 'NO_SHOW') {
                    const since = dayjs().subtract(NOSHOW_WINDOW_DAYS, 'day').toDate();
                    const count = await prisma.classBooking.count({
                        where: { user_id: b.user_id, status: 'NO_SHOW', booked_at: { gte: since } },
                    });
                    if (count >= NOSHOW_THRESHOLD) {
                        try {
                            await redis.set(`noshow:ban:${b.user_id}`, '1', 'EX', NOSHOW_BAN_TTL_SEC);
                            bansTriggered.push(b.user_id);
                        } catch {}
                    }
                }
            }

            return {
                updated_count: updated.length,
                updated,
                ban_triggered_user_ids: bansTriggered,
            };
        }
    );

    // ─── GET /classes/me/upcoming ─────────────────────────────────
    fastify.get(
        '/classes/me/upcoming',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const bookings = await prisma.classBooking.findMany({
                where: {
                    user_id: userId,
                    status: { in: ['CONFIRMED', 'WAITLIST'] },
                    class: { starts_at: { gte: new Date() } },
                },
                include: { class: true },
                orderBy: { class: { starts_at: 'asc' } },
            });
            return { bookings };
        }
    );

    // ─── GET /classes/me/history ──────────────────────────────────
    fastify.get(
        '/classes/me/history',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const bookings = await prisma.classBooking.findMany({
                where: {
                    user_id: userId,
                    OR: [
                        { status: { in: ['CANCELED', 'NO_SHOW', 'ATTENDED'] } },
                        { class: { starts_at: { lt: new Date() } } },
                    ],
                },
                include: { class: true },
                orderBy: { booked_at: 'desc' },
                take: 100,
            });
            return { bookings };
        }
    );

    // ═════════════════════════════════════════════════════════════
    // Admin / Staff
    // ═════════════════════════════════════════════════════════════

    const adminGuard = {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')],
    };

    // ─── POST /admin/classes ──────────────────────────────────────
    //
    // Optional weekly repetition: when `repeat_weeks > 0` we clone the
    // class N times, advancing starts_at by 7 days each iteration.
    fastify.post('/admin/classes', adminGuard, async (req) => {
        const parsed = createClassBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const data = parsed.data;

        const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
        if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

        const baseStart = new Date(data.starts_at);
        const repeats = data.repeat_weeks || 0;
        const occurrences = [baseStart];
        for (let i = 1; i <= repeats; i++) {
            occurrences.push(dayjs(baseStart).add(i, 'week').toDate());
        }

        const created = [];
        for (const startsAt of occurrences) {
            const row = await prisma.classSchedule.create({
                data: {
                    workspace_id,
                    name: data.name,
                    sport: data.sport,
                    trainer_id: data.trainer_id,
                    starts_at: startsAt,
                    duration_min: data.duration_min,
                    capacity: data.capacity,
                    location: data.location,
                    min_plan: data.min_plan || null,
                },
            });
            created.push(row);
        }

        return { created_count: created.length, classes: created };
    });

    // ─── PATCH /admin/classes/:id ─────────────────────────────────
    fastify.patch('/admin/classes/:id', adminGuard, async (req) => {
        const parsed = patchClassBody.safeParse(req.body || {});
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const data = { ...parsed.data };
        if (data.starts_at) data.starts_at = new Date(data.starts_at);

        const klass = await prisma.classSchedule.update({
            where: { id: req.params.id },
            data,
        });
        return { class: klass };
    });

    // ─── POST /admin/classes/:id/cancel ───────────────────────────
    fastify.post('/admin/classes/:id/cancel', adminGuard, async (req) => {
        const parsed = cancelClassBody.safeParse(req.body || {});
        const reason = parsed.success ? parsed.data.reason : null;

        const classId = req.params.id;
        const klass = await prisma.classSchedule.findUnique({ where: { id: classId } });
        if (!klass) throw err('CLASS_NOT_FOUND', 'Clase no encontrada', 404);

        const bookings = await prisma.classBooking.findMany({
            where: {
                class_id: classId,
                status: { in: ['CONFIRMED', 'WAITLIST'] },
            },
        });

        await prisma.$transaction([
            prisma.classBooking.updateMany({
                where: { class_id: classId, status: { in: ['CONFIRMED', 'WAITLIST'] } },
                data: { status: 'CANCELED', canceled_at: new Date() },
            }),
            prisma.classSchedule.update({
                where: { id: classId },
                data: { booked: 0 },
            }),
        ]);

        for (const b of bookings) {
            await fireEvent('class.cancellation_alert', {
                workspaceId: klass.workspace_id,
                userId: b.user_id,
                classId,
                bookingId: b.id,
                reason: reason || 'Clase cancelada por el gimnasio',
                canceledByAdmin: true,
                classStartsAt: klass.starts_at,
            });
        }

        return {
            class_id: classId,
            affected_bookings: bookings.length,
            reason,
        };
    });
}
