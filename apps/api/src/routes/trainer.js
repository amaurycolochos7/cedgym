// ─────────────────────────────────────────────────────────────────
// Trainer portal — aggregated endpoints used by /trainer/* pages in
// the web app.
//
// All routes here require a JWT and TRAINER / ADMIN / SUPERADMIN role.
// Authors-only resources live in routes/products.js (/products/me/*).
//
//   GET  /trainer/me/dashboard          — KPIs for the dashboard
//   GET  /trainer/me/classes            — classes I teach (?from=&to=)
//   GET  /trainer/me/classes/:id        — detail + bookings/attendance
//   GET  /trainer/me/sales              — my product sales (?from=&to=&product_id=)
//   GET  /trainer/me/athletes           — unique athletes (products + classes)
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import dayjs from 'dayjs';
import { err } from '../lib/errors.js';

// ─── Schemas ─────────────────────────────────────────────────────
const rangeQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
});

const salesQuery = rangeQuery.extend({
    product_id: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────
export default async function trainerRoutes(fastify) {
    const { prisma } = fastify;

    const guard = {
        preHandler: [
            fastify.authenticate,
            fastify.requireRole('TRAINER', 'ADMIN', 'SUPERADMIN'),
        ],
    };

    // ─── GET /trainer/me/dashboard ────────────────────────────────
    fastify.get('/trainer/me/dashboard', guard, async (req) => {
        const userId = req.user.sub || req.user.id;

        const [publishedCount, mtdSales, pendingPayout, products, last30Raw, upcoming] =
            await Promise.all([
                prisma.digitalProduct.count({
                    where: { author_id: userId, published: true },
                }),
                prisma.productPurchase.aggregate({
                    where: {
                        product: { author_id: userId },
                        access_granted_at: { gte: dayjs().startOf('month').toDate() },
                    },
                    _count: { id: true },
                    _sum: { price_paid_mxn: true, author_payout_mxn: true },
                }),
                prisma.productPurchase.aggregate({
                    where: { product: { author_id: userId } },
                    _sum: { author_payout_mxn: true },
                }),
                prisma.digitalProduct.findMany({
                    where: { author_id: userId },
                    select: { id: true },
                }),
                prisma.productPurchase.findMany({
                    where: {
                        product: { author_id: userId },
                        access_granted_at: { gte: dayjs().subtract(30, 'day').toDate() },
                    },
                    select: { access_granted_at: true, price_paid_mxn: true },
                }),
                prisma.classSchedule.findMany({
                    where: {
                        trainer_id: userId,
                        starts_at: { gte: new Date() },
                    },
                    orderBy: { starts_at: 'asc' },
                    take: 6,
                }),
            ]);

        // Unique athletes ever (from purchases + class bookings).
        const productIds = products.map((p) => p.id);
        const [purchaseUsers, bookingUsers] = await Promise.all([
            productIds.length
                ? prisma.productPurchase.findMany({
                      where: { product_id: { in: productIds } },
                      select: { user_id: true },
                      distinct: ['user_id'],
                  })
                : Promise.resolve([]),
            prisma.classBooking.findMany({
                where: {
                    class: { trainer_id: userId },
                    status: { in: ['CONFIRMED', 'ATTENDED'] },
                },
                select: { user_id: true },
                distinct: ['user_id'],
            }),
        ]);
        const athletesSet = new Set([
            ...purchaseUsers.map((u) => u.user_id),
            ...bookingUsers.map((u) => u.user_id),
        ]);

        // Build a 30-day bucketed series (YYYY-MM-DD → {amount,count}).
        const byDay = new Map();
        for (let i = 29; i >= 0; i--) {
            const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
            byDay.set(d, { day: d, amount_mxn: 0, count: 0 });
        }
        for (const row of last30Raw) {
            const d = dayjs(row.access_granted_at).format('YYYY-MM-DD');
            const entry = byDay.get(d);
            if (entry) {
                entry.amount_mxn += row.price_paid_mxn || 0;
                entry.count += 1;
            }
        }

        return {
            published_products: publishedCount,
            sales_mtd: mtdSales._count.id || 0,
            sales_mtd_mxn: mtdSales._sum.price_paid_mxn || 0,
            pending_payout_mxn: pendingPayout._sum.author_payout_mxn || 0,
            athletes_count: athletesSet.size,
            sales_last_30_days: Array.from(byDay.values()),
            upcoming_classes: upcoming.map((c) => ({
                id: c.id,
                name: c.name,
                starts_at: c.starts_at,
                location: c.location,
                capacity: c.capacity,
                booked: c.booked,
            })),
        };
    });

    // ─── GET /trainer/me/classes ──────────────────────────────────
    fastify.get('/trainer/me/classes', guard, async (req) => {
        const parsed = rangeQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const { from, to } = parsed.data;
        const userId = req.user.sub || req.user.id;

        const where = { trainer_id: userId };
        if (from || to) {
            where.starts_at = {};
            if (from) where.starts_at.gte = new Date(from);
            if (to) where.starts_at.lte = new Date(to);
        } else {
            // Default: 2 weeks back → 4 weeks ahead.
            where.starts_at = {
                gte: dayjs().subtract(14, 'day').toDate(),
                lte: dayjs().add(28, 'day').toDate(),
            };
        }

        const rows = await prisma.classSchedule.findMany({
            where,
            orderBy: { starts_at: 'asc' },
        });

        return {
            classes: rows.map((c) => ({
                id: c.id,
                name: c.name,
                sport: c.sport,
                starts_at: c.starts_at,
                duration_min: c.duration_min,
                capacity: c.capacity,
                booked: c.booked,
                location: c.location,
            })),
        };
    });

    // ─── GET /trainer/me/classes/:id ──────────────────────────────
    fastify.get('/trainer/me/classes/:id', guard, async (req) => {
        const userId = req.user.sub || req.user.id;
        const klass = await prisma.classSchedule.findUnique({
            where: { id: req.params.id },
        });
        if (!klass) throw err('CLASS_NOT_FOUND', 'Clase no encontrada', 404);

        const isAdmin =
            req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN';
        if (!isAdmin && klass.trainer_id !== userId) {
            throw err('FORBIDDEN', 'Esta clase no te pertenece', 403);
        }

        const bookings = await prisma.classBooking.findMany({
            where: { class_id: klass.id },
            orderBy: { booked_at: 'asc' },
        });

        // Hydrate user info.
        const userIds = [...new Set(bookings.map((b) => b.user_id))];
        const users = userIds.length
            ? await prisma.user.findMany({
                  where: { id: { in: userIds } },
                  select: {
                      id: true,
                      name: true,
                      full_name: true,
                      avatar_url: true,
                  },
              })
            : [];
        const byUser = new Map(users.map((u) => [u.id, u]));

        return {
            class: {
                id: klass.id,
                name: klass.name,
                sport: klass.sport,
                starts_at: klass.starts_at,
                duration_min: klass.duration_min,
                capacity: klass.capacity,
                booked: klass.booked,
                location: klass.location,
                bookings: bookings.map((b) => {
                    const u = byUser.get(b.user_id);
                    return {
                        id: b.id,
                        user_id: b.user_id,
                        user_name: u?.full_name || u?.name || 'Atleta',
                        user_avatar: u?.avatar_url || null,
                        status: b.status,
                        attended_at: b.attended_at,
                    };
                }),
            },
        };
    });

    // ─── GET /trainer/me/sales ────────────────────────────────────
    //
    // Detailed sales for *my* products. "Pending payout" = everything
    // not yet flagged paid. We don't yet persist a `paid_at` column on
    // the payout pipeline, so for now `paid_payout_mxn` stays at 0 and
    // `pending_payout_mxn` equals the lifetime payout. Once the payout
    // ledger lands we filter here and this number starts decrementing.
    fastify.get('/trainer/me/sales', guard, async (req) => {
        const parsed = salesQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const { from, to, product_id } = parsed.data;
        const userId = req.user.sub || req.user.id;

        const purchaseWhere = {
            product: { author_id: userId },
        };
        if (product_id) purchaseWhere.product_id = product_id;
        if (from || to) {
            purchaseWhere.access_granted_at = {};
            if (from) purchaseWhere.access_granted_at.gte = new Date(from);
            if (to) purchaseWhere.access_granted_at.lte = new Date(to);
        }

        const purchases = await prisma.productPurchase.findMany({
            where: purchaseWhere,
            orderBy: { access_granted_at: 'desc' },
            include: {
                product: { select: { id: true, title: true, slug: true } },
                user: {
                    select: {
                        id: true,
                        name: true,
                        full_name: true,
                        email: true,
                    },
                },
            },
        });

        const totals = purchases.reduce(
            (acc, p) => {
                acc.gross_mxn += p.price_paid_mxn || 0;
                acc.my_payout_mxn += p.author_payout_mxn || 0;
                acc.gym_revenue_mxn += p.gym_revenue_mxn || 0;
                return acc;
            },
            { gross_mxn: 0, my_payout_mxn: 0, gym_revenue_mxn: 0 },
        );

        const products_summary = await prisma.digitalProduct.findMany({
            where: { author_id: userId },
            select: {
                id: true,
                title: true,
                rating_avg: true,
                rating_count: true,
                sales_count: true,
            },
        });

        return {
            totals: {
                ...totals,
                // No payout ledger yet — all payout is pending.
                pending_payout_mxn: totals.my_payout_mxn,
                paid_payout_mxn: 0,
            },
            sales: purchases.map((p) => ({
                purchase_id: p.id,
                product: p.product,
                user: p.user,
                price_paid_mxn: p.price_paid_mxn,
                author_payout_mxn: p.author_payout_mxn,
                purchased_at: p.access_granted_at,
                status: 'PAID',
            })),
            products_summary,
        };
    });

    // ─── GET /trainer/me/athletes ─────────────────────────────────
    //
    // Unique athletes who either bought a product I authored or are
    // booked to a class I teach. Result marks the source.
    fastify.get('/trainer/me/athletes', guard, async (req) => {
        const userId = req.user.sub || req.user.id;

        const [purchases, bookings] = await Promise.all([
            prisma.productPurchase.findMany({
                where: { product: { author_id: userId } },
                select: {
                    user_id: true,
                    price_paid_mxn: true,
                    access_granted_at: true,
                },
                orderBy: { access_granted_at: 'desc' },
            }),
            prisma.classBooking.findMany({
                where: {
                    class: { trainer_id: userId },
                    status: { in: ['CONFIRMED', 'ATTENDED', 'WAITLIST'] },
                },
                select: {
                    user_id: true,
                    booked_at: true,
                },
                orderBy: { booked_at: 'desc' },
            }),
        ]);

        const agg = new Map();
        for (const p of purchases) {
            const e = agg.get(p.user_id) || {
                user_id: p.user_id,
                fromProducts: false,
                fromClasses: false,
                total_spent_mxn: 0,
                last_interaction_at: null,
            };
            e.fromProducts = true;
            e.total_spent_mxn += p.price_paid_mxn || 0;
            if (!e.last_interaction_at || p.access_granted_at > e.last_interaction_at) {
                e.last_interaction_at = p.access_granted_at;
            }
            agg.set(p.user_id, e);
        }
        for (const b of bookings) {
            const e = agg.get(b.user_id) || {
                user_id: b.user_id,
                fromProducts: false,
                fromClasses: false,
                total_spent_mxn: 0,
                last_interaction_at: null,
            };
            e.fromClasses = true;
            if (!e.last_interaction_at || b.booked_at > e.last_interaction_at) {
                e.last_interaction_at = b.booked_at;
            }
            agg.set(b.user_id, e);
        }

        const ids = [...agg.keys()];
        if (!ids.length) return { athletes: [] };

        const users = await prisma.user.findMany({
            where: { id: { in: ids } },
            select: {
                id: true,
                name: true,
                full_name: true,
                email: true,
                phone: true,
                avatar_url: true,
            },
        });

        const athletes = users
            .map((u) => {
                const a = agg.get(u.id);
                const source =
                    a.fromProducts && a.fromClasses
                        ? 'both'
                        : a.fromProducts
                          ? 'product'
                          : 'class';
                return {
                    id: u.id,
                    name: u.name,
                    full_name: u.full_name,
                    email: u.email,
                    phone: u.phone,
                    avatar_url: u.avatar_url,
                    source,
                    last_interaction_at: a.last_interaction_at,
                    total_spent_mxn: a.total_spent_mxn,
                };
            })
            .sort((x, y) => {
                const xt = x.last_interaction_at
                    ? new Date(x.last_interaction_at).getTime()
                    : 0;
                const yt = y.last_interaction_at
                    ? new Date(y.last_interaction_at).getTime()
                    : 0;
                return yt - xt;
            });

        return { athletes };
    });
}
