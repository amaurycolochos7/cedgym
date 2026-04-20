// ─────────────────────────────────────────────────────────────────
// Freeze — additional membership-freeze endpoints.
//
// routes/memberships.js already owns POST /memberships/freeze (user
// initiates a freeze). This file adds the surrounding operations:
//
// Authenticated:
//   GET /memberships/me/freezes      → history for the logged-in user
//
// Admin (ADMIN / SUPERADMIN):
//   POST /admin/memberships/:id/unfreeze   → end a freeze early &
//                                            shrink the extended expiry
//   GET  /admin/memberships/frozen         → lists memberships with an
//                                            active freeze window
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { z } from 'zod';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';

export default async function freezeRoutes(fastify) {
    const { prisma } = fastify;

    // ── GET /memberships/me/freezes ─────────────────────────
    fastify.get(
        '/memberships/me/freezes',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const membership = await prisma.membership.findUnique({
                where: { user_id: userId },
            });
            if (!membership) {
                return { freezes: [], days_used_this_year: 0, quota: 30 };
            }
            const yearAgo = dayjs().subtract(1, 'year').toDate();
            const freezes = await prisma.membershipFreeze.findMany({
                where: { membership_id: membership.id },
                orderBy: { starts_at: 'desc' },
            });
            const daysUsed = freezes
                .filter((f) => f.created_at >= yearAgo)
                .reduce((s, f) => s + (f.days_frozen || 0), 0);
            return {
                freezes,
                days_used_this_year: daysUsed,
                quota: 30,
                remaining: Math.max(0, 30 - daysUsed),
            };
        }
    );

    // ── POST /admin/memberships/:id/unfreeze ────────────────
    // Params: :id is the Membership id.
    // Body (optional): { freeze_id: '...' } to target a specific active
    // freeze. If omitted we pick the most recent in-progress freeze.
    //
    // Behavior: we set the freeze's ends_at to now, recompute the
    // "days actually used", then shrink the membership's expires_at
    // by the delta between the originally granted days and the
    // actually used days.
    const unfreezeBody = z.object({ freeze_id: z.string().cuid().optional() });
    fastify.post(
        '/admin/memberships/:id/unfreeze',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req) => {
            const parsed = unfreezeBody.safeParse(req.body || {});
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

            const membershipId = req.params.id;
            const membership = await prisma.membership.findUnique({
                where: { id: membershipId },
            });
            if (!membership) throw err('NOT_FOUND', 'Membresía no encontrada', 404);

            // Locate the freeze to reverse.
            const freeze = parsed.data.freeze_id
                ? await prisma.membershipFreeze.findUnique({
                      where: { id: parsed.data.freeze_id },
                  })
                : await prisma.membershipFreeze.findFirst({
                      where: {
                          membership_id: membershipId,
                          ends_at: { gte: new Date() },
                      },
                      orderBy: { starts_at: 'desc' },
                  });
            if (!freeze) throw err('NO_ACTIVE_FREEZE', 'Sin congelamiento activo', 404);

            const now = new Date();
            const originalDays = freeze.days_frozen;
            const actualDays = Math.max(
                0,
                dayjs(now).diff(dayjs(freeze.starts_at), 'day')
            );
            const shrinkDays = Math.max(0, originalDays - actualDays);

            const [updatedFreeze, updatedMembership] = await prisma.$transaction([
                prisma.membershipFreeze.update({
                    where: { id: freeze.id },
                    data: { ends_at: now, days_frozen: actualDays },
                }),
                prisma.membership.update({
                    where: { id: membershipId },
                    data: {
                        expires_at: dayjs(membership.expires_at)
                            .subtract(shrinkDays, 'day')
                            .toDate(),
                    },
                }),
            ]);

            await fireEvent('membership.unfrozen', {
                workspaceId: membership.workspace_id,
                userId: membership.user_id,
                membershipId,
                freezeId: freeze.id,
                days_actually_used: actualDays,
                admin_id: req.user.sub,
            });

            return { freeze: updatedFreeze, membership: updatedMembership };
        }
    );

    // ── GET /admin/memberships/frozen ──────────────────────
    fastify.get(
        '/admin/memberships/frozen',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async () => {
            const now = new Date();
            // Active freezes = rows where now is within [starts_at, ends_at].
            const freezes = await prisma.membershipFreeze.findMany({
                where: {
                    starts_at: { lte: now },
                    ends_at: { gte: now },
                },
                orderBy: { starts_at: 'desc' },
                include: { membership: true },
            });

            const userIds = freezes.map((f) => f.user_id);
            const users = userIds.length
                ? await prisma.user.findMany({
                      where: { id: { in: userIds } },
                      select: { id: true, name: true, email: true, phone: true, full_name: true },
                  })
                : [];
            const byId = new Map(users.map((u) => [u.id, u]));

            return {
                frozen: freezes.map((f) => ({
                    freeze: f,
                    membership: f.membership,
                    user: byId.get(f.user_id) || null,
                })),
                count: freezes.length,
            };
        }
    );
}
