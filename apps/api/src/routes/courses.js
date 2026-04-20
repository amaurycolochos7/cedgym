// ─────────────────────────────────────────────────────────────────
// Courses routes — programmed courses (multi-session, capacity-bound).
//
// Public:
//   GET  /courses                — list published (filter sport, level, trainer_id)
//   GET  /courses/:id            — detail
//
// Authenticated (JWT):
//   POST /courses/:id/enroll     — create Payment + MP preference
//   GET  /courses/me/enrolled    — courses the user paid for
//
// Admin (ADMIN / SUPERADMIN):
//   POST   /admin/courses
//   PATCH  /admin/courses/:id
//   DELETE /admin/courses/:id
//   POST   /admin/courses/:id/publish
//   POST   /admin/courses/:id/unpublish
//   GET    /admin/courses/:id/enrollments
//
// The actual enrollment increment happens in the MP webhook
// (routes/webhooks.js — enrollInCourse) after payment is APPROVED.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { createPreference } from '../lib/mercadopago.js';

// ─── Validation schemas ──────────────────────────────────────────
const listQuery = z.object({
    sport: z.string().optional(),
    level: z.string().optional(),
    trainer_id: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createBody = z.object({
    name: z.string().trim().min(2).max(200),
    description: z.string().optional(),
    sport: z.enum([
        'FOOTBALL', 'BOXING', 'MMA', 'POWERLIFTING', 'CROSSFIT',
        'WEIGHTLIFTING', 'GENERAL_FITNESS', 'RUNNING', 'NUTRITION', 'OTHER',
    ]),
    trainer_id: z.string().min(1),
    capacity: z.number().int().min(1).max(500),
    price_mxn: z.number().int().min(0),
    starts_at: z.string(),
    ends_at: z.string(),
    schedule: z.any().optional(), // free-form JSON (days, times, etc.)
});

const patchBody = createBody.partial();

// ─── Helpers ─────────────────────────────────────────────────────
function apiPublicUrl() {
    return process.env.API_PUBLIC_URL || 'http://localhost:3001';
}
function webappPublicUrl() {
    return process.env.WEBAPP_PUBLIC_URL || 'http://localhost:3000';
}

// ─────────────────────────────────────────────────────────────────
export default async function coursesRoutes(fastify) {
    const { prisma } = fastify;

    // ─── GET /courses (public) ────────────────────────────────────
    fastify.get('/courses', async (req) => {
        const parsed = listQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const { sport, trainer_id, page, limit } = parsed.data;

        const where = { published: true };
        if (sport) where.sport = sport;
        if (trainer_id) where.trainer_id = trainer_id;

        const [total, rows] = await Promise.all([
            prisma.course.count({ where }),
            prisma.course.findMany({
                where,
                orderBy: { starts_at: 'asc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        return {
            total,
            page,
            limit,
            pages: Math.max(1, Math.ceil(total / limit)),
            courses: rows,
        };
    });

    // ─── GET /courses/:id (public) ────────────────────────────────
    fastify.get('/courses/:id', async (req) => {
        const course = await prisma.course.findUnique({
            where: { id: req.params.id },
        });
        if (!course) throw err('COURSE_NOT_FOUND', 'Curso no encontrado', 404);
        if (!course.published) throw err('COURSE_NOT_PUBLISHED', 'Curso no disponible', 404);
        return { course };
    });

    // ─── POST /courses/:id/enroll ─────────────────────────────────
    fastify.post(
        '/courses/:id/enroll',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const course = await prisma.course.findUnique({ where: { id: req.params.id } });
            if (!course) throw err('COURSE_NOT_FOUND', 'Curso no encontrado', 404);
            if (!course.published) throw err('COURSE_NOT_PUBLISHED', 'Curso no disponible', 400);
            if (course.enrolled >= course.capacity) {
                throw err('COURSE_FULL', 'Curso lleno', 409);
            }

            const userId = req.user.sub || req.user.id;
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            // Guard: already paid & approved?
            const existing = await prisma.payment.findFirst({
                where: {
                    user_id: userId,
                    type: 'COURSE',
                    reference: course.id,
                    status: 'APPROVED',
                },
            });
            if (existing) {
                throw err('ALREADY_ENROLLED', 'Ya estás inscrito en este curso', 409);
            }

            // Create Payment PENDING first so we have an id for external_reference.
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: course.workspace_id,
                    user_id: user.id,
                    amount: course.price_mxn,
                    type: 'COURSE',
                    reference: course.id,
                    description: `Inscripción curso: ${course.name}`,
                    status: 'PENDING',
                    metadata: {
                        course_id: course.id,
                        course_name: course.name,
                    },
                },
            });

            const mpPref = await createPreference({
                userId: user.id,
                type: 'COURSE',
                reference: course.id,
                items: [
                    {
                        id: course.id,
                        title: `Curso: ${course.name}`,
                        quantity: 1,
                        unit_price: course.price_mxn,
                    },
                ],
                payer: { email: user.email, name: user.full_name || user.name },
                back_urls: {
                    success: `${webappPublicUrl()}/courses/success?payment=${payment.id}`,
                    failure: `${webappPublicUrl()}/courses/failed?payment=${payment.id}`,
                    pending: `${webappPublicUrl()}/courses/pending?payment=${payment.id}`,
                },
                notification_url: `${apiPublicUrl()}/webhooks/mercadopago`,
                external_reference: payment.id,
                metadata: {
                    course_id: course.id,
                    workspace_id: course.workspace_id,
                },
            });

            await prisma.payment.update({
                where: { id: payment.id },
                data: { mp_preference_id: mpPref.preferenceId },
            });

            return {
                payment_id: payment.id,
                init_point: mpPref.init_point,
                sandbox_init_point: mpPref.sandbox_init_point,
            };
        }
    );

    // ─── GET /courses/me/enrolled ─────────────────────────────────
    fastify.get(
        '/courses/me/enrolled',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            // A user is "enrolled" if they have an APPROVED course payment.
            const payments = await prisma.payment.findMany({
                where: {
                    user_id: userId,
                    type: 'COURSE',
                    status: 'APPROVED',
                },
                orderBy: { paid_at: 'desc' },
            });
            const courseIds = [...new Set(payments.map((p) => p.reference).filter(Boolean))];
            const courses = courseIds.length
                ? await prisma.course.findMany({ where: { id: { in: courseIds } } })
                : [];
            // Zip with payment info for convenience.
            const byCourse = new Map(courses.map((c) => [c.id, c]));
            const enrolled = payments
                .filter((p) => byCourse.has(p.reference))
                .map((p) => ({
                    course: byCourse.get(p.reference),
                    payment_id: p.id,
                    paid_at: p.paid_at,
                }));
            return { enrolled };
        }
    );

    // ═════════════════════════════════════════════════════════════
    // Admin
    // ═════════════════════════════════════════════════════════════

    const adminGuard = { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] };

    // ─── POST /admin/courses ──────────────────────────────────────
    fastify.post('/admin/courses', adminGuard, async (req) => {
        const parsed = createBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const data = parsed.data;

        const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
        if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

        const course = await prisma.course.create({
            data: {
                workspace_id,
                name: data.name,
                description: data.description || null,
                sport: data.sport,
                trainer_id: data.trainer_id,
                capacity: data.capacity,
                price_mxn: data.price_mxn,
                starts_at: new Date(data.starts_at),
                ends_at: new Date(data.ends_at),
                schedule: data.schedule || {},
                published: false,
            },
        });
        return { course };
    });

    // ─── PATCH /admin/courses/:id ─────────────────────────────────
    fastify.patch('/admin/courses/:id', adminGuard, async (req) => {
        const parsed = patchBody.safeParse(req.body || {});
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const data = { ...parsed.data };
        if (data.starts_at) data.starts_at = new Date(data.starts_at);
        if (data.ends_at) data.ends_at = new Date(data.ends_at);

        const course = await prisma.course.update({
            where: { id: req.params.id },
            data,
        });
        return { course };
    });

    // ─── DELETE /admin/courses/:id ────────────────────────────────
    fastify.delete('/admin/courses/:id', adminGuard, async (req) => {
        await prisma.course.delete({ where: { id: req.params.id } });
        return { deleted: true };
    });

    // ─── POST /admin/courses/:id/publish ──────────────────────────
    fastify.post('/admin/courses/:id/publish', adminGuard, async (req) => {
        const course = await prisma.course.update({
            where: { id: req.params.id },
            data: { published: true },
        });
        return { course };
    });

    // ─── POST /admin/courses/:id/unpublish ────────────────────────
    fastify.post('/admin/courses/:id/unpublish', adminGuard, async (req) => {
        const course = await prisma.course.update({
            where: { id: req.params.id },
            data: { published: false },
        });
        return { course };
    });

    // ─── GET /admin/courses/:id/enrollments ───────────────────────
    fastify.get('/admin/courses/:id/enrollments', adminGuard, async (req) => {
        const courseId = req.params.id;
        const payments = await prisma.payment.findMany({
            where: {
                type: 'COURSE',
                reference: courseId,
                status: 'APPROVED',
            },
            orderBy: { paid_at: 'asc' },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        full_name: true,
                        email: true,
                        phone: true,
                    },
                },
            },
        });
        return {
            course_id: courseId,
            total: payments.length,
            enrollments: payments.map((p) => ({
                user: p.user,
                payment_id: p.id,
                amount_mxn: p.amount,
                paid_at: p.paid_at,
            })),
        };
    });
}
