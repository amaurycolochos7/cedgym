// ─────────────────────────────────────────────────────────────────
// Body measurements routes.
//
// Authenticated:
//   POST   /measurements                   (staff ≥ TRAINER OR self)
//   GET    /measurements/me
//   GET    /measurements/me/progress
//   POST   /measurements/me/photo          (multipart → MinIO)
//   DELETE /measurements/:id               (owner or admin)
//
// Staff:
//   GET    /admin/measurements/:userId    (TRAINER / ADMIN / SUPERADMIN)
//
// Notes:
// - Users may record their OWN measurements from the app
//   (self-weigh-in workflow). Recording for someone else requires
//   TRAINER+ so we can attribute via `taken_by`.
// - Photo upload uses a very light-weight multipart parser so we
//   don't have to add @fastify/multipart as a hard dependency. We
//   simply consume the raw body into a Buffer; the UI sends a single
//   file under field name `photo`. Content-Type is forwarded verbatim
//   to the storage backend.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { putObject } from '../lib/storage.js';

const numOpt = z.number().positive().optional();

const createSchema = z.object({
    user_id: z.string().cuid().optional(),    // omitted → self
    weight_kg: numOpt,
    body_fat_pct: z.number().min(0).max(100).optional(),
    muscle_mass_kg: numOpt,
    chest_cm: numOpt,
    waist_cm: numOpt,
    hip_cm: numOpt,
    arm_cm: numOpt,
    thigh_cm: numOpt,
    notes: z.string().trim().max(2000).optional(),
    photo_urls: z.array(z.string().url()).optional(),
    measured_at: z.string().datetime().optional(),
});

const STAFF_ROLES = ['TRAINER', 'ADMIN', 'SUPERADMIN'];

function isStaff(role) {
    return STAFF_ROLES.includes(role);
}

export default async function measurementsRoutes(fastify) {
    const { prisma } = fastify;

    // ── POST /measurements ─────────────────────────────────
    fastify.post(
        '/measurements',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = createSchema.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

            const actorId = req.user.sub || req.user.id;
            const actorRole = req.user.role;
            const targetId = parsed.data.user_id || actorId;

            if (targetId !== actorId && !isStaff(actorRole)) {
                throw err('FORBIDDEN', 'Solo entrenadores pueden medir a otros usuarios', 403);
            }

            // Strip user_id / measured_at (handled separately) before
            // dropping the rest into Prisma.
            const {
                user_id: _omit,
                measured_at,
                ...numeric
            } = parsed.data;

            const created = await prisma.bodyMeasurement.create({
                data: {
                    user_id: targetId,
                    taken_by: actorId !== targetId ? actorId : null,
                    measured_at: measured_at ? new Date(measured_at) : new Date(),
                    ...numeric,
                },
            });
            return { measurement: created };
        }
    );

    // ── GET /measurements/me ───────────────────────────────
    fastify.get(
        '/measurements/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const rows = await prisma.bodyMeasurement.findMany({
                where: { user_id: userId },
                orderBy: { measured_at: 'desc' },
                take: 200,
            });
            return { measurements: rows };
        }
    );

    // ── GET /measurements/me/progress ──────────────────────
    // Computes deltas between first and latest measurement for the
    // high-level progress widget on the dashboard.
    fastify.get(
        '/measurements/me/progress',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const [first, latest, count] = await Promise.all([
                prisma.bodyMeasurement.findFirst({
                    where: { user_id: userId },
                    orderBy: { measured_at: 'asc' },
                }),
                prisma.bodyMeasurement.findFirst({
                    where: { user_id: userId },
                    orderBy: { measured_at: 'desc' },
                }),
                prisma.bodyMeasurement.count({ where: { user_id: userId } }),
            ]);
            if (!first || !latest) {
                return { measurement_count: 0 };
            }
            const delta = (a, b) =>
                a != null && b != null ? Number((b - a).toFixed(2)) : null;
            return {
                measurement_count: count,
                first_measured_at: first.measured_at,
                latest_measured_at: latest.measured_at,
                weight_delta_kg: delta(first.weight_kg, latest.weight_kg),
                body_fat_delta_pct: delta(first.body_fat_pct, latest.body_fat_pct),
                muscle_mass_delta_kg: delta(first.muscle_mass_kg, latest.muscle_mass_kg),
                chest_delta_cm: delta(first.chest_cm, latest.chest_cm),
                waist_delta_cm: delta(first.waist_cm, latest.waist_cm),
                hip_delta_cm: delta(first.hip_cm, latest.hip_cm),
                arm_delta_cm: delta(first.arm_cm, latest.arm_cm),
                thigh_delta_cm: delta(first.thigh_cm, latest.thigh_cm),
                first,
                latest,
            };
        }
    );

    // ── POST /measurements/me/photo ────────────────────────
    // Expects: Content-Type: application/octet-stream (or image/*).
    // Appends the resulting URL to the user's most recent measurement.
    // Caller may pass `?measurement_id=` to target a specific row.
    fastify.post(
        '/measurements/me/photo',
        {
            preHandler: [fastify.authenticate],
            // Fastify's default body parser rejects octet-stream — give
            // it a pass-through so we can feed the Buffer into MinIO.
            bodyLimit: 10 * 1024 * 1024, // 10 MB
        },
        async (req, reply) => {
            const userId = req.user.sub || req.user.id;
            const ctype = req.headers['content-type'] || 'application/octet-stream';
            let body = req.body;
            // Fastify may give us a Buffer, a string, or null depending
            // on content-type. Normalize.
            if (!body) {
                throw err('NO_BODY', 'Falta el archivo', 400);
            }
            if (typeof body === 'string') body = Buffer.from(body, 'binary');
            if (!Buffer.isBuffer(body)) {
                // Object (e.g. JSON) — reject.
                throw err('BAD_CONTENT_TYPE', 'Envía la foto como binary stream', 400);
            }

            const measurementId = req.query?.measurement_id || null;
            const target = measurementId
                ? await prisma.bodyMeasurement.findFirst({
                      where: { id: measurementId, user_id: userId },
                  })
                : await prisma.bodyMeasurement.findFirst({
                      where: { user_id: userId },
                      orderBy: { measured_at: 'desc' },
                  });
            if (!target) throw err('NO_MEASUREMENT', 'Crea una medición antes de subir fotos', 404);

            const key = `measurements/${userId}/${target.id}/${Date.now()}.jpg`;
            const { url } = await putObject({ key, body, contentType: ctype });

            const updated = await prisma.bodyMeasurement.update({
                where: { id: target.id },
                data: { photo_urls: { set: [...(target.photo_urls || []), url] } },
            });

            return reply.send({ measurement: updated, url });
        }
    );

    // ── DELETE /measurements/:id ───────────────────────────
    fastify.delete(
        '/measurements/:id',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const row = await prisma.bodyMeasurement.findUnique({
                where: { id: req.params.id },
            });
            if (!row) throw err('NOT_FOUND', 'Medición no encontrada', 404);

            const userId = req.user.sub || req.user.id;
            const role = req.user.role;
            const isOwner = row.user_id === userId;
            const isAdmin = role === 'ADMIN' || role === 'SUPERADMIN';
            if (!isOwner && !isAdmin) {
                throw err('FORBIDDEN', 'No autorizado', 403);
            }
            await prisma.bodyMeasurement.delete({ where: { id: row.id } });
            return { success: true };
        }
    );

    // ── GET /admin/measurements/:userId ───────────────────
    fastify.get(
        '/admin/measurements/:userId',
        { preHandler: [fastify.authenticate, fastify.requireRole('TRAINER', 'ADMIN', 'SUPERADMIN')] },
        async (req) => {
            const rows = await prisma.bodyMeasurement.findMany({
                where: { user_id: req.params.userId },
                orderBy: { measured_at: 'desc' },
                take: 200,
            });
            return { measurements: rows };
        }
    );
}
