// ─────────────────────────────────────────────────────────────────
// Marketplace — digital products (routines, nutrition plans, ebooks).
//
// Public:
//   GET  /products                  — list (published only) with filters
//   GET  /products/:slug            — detail + reviews preview
//
// Authenticated (JWT):
//   POST /products/:id/purchase             — checkout (MP preference)
//   GET  /products/me/purchases             — "my routines"
//   GET  /products/me/purchases/:id         — viewer (content + ephemeral URLs)
//   POST /products/me/purchases/:id/download — watermarked PDF
//
// Authors (ADMIN+):
//   POST  /products                 — create (published=false, needs approval)
//   PATCH /products/:id             — only author or admin
//   GET   /products/me/authored     — my products as author
//   GET   /products/me/sales        — my sales, payouts, ratings
//
// Admin:
//   GET  /admin/products            — ?published=false etc. (moderation queue)
//   POST /admin/products/:id/approve
//   POST /admin/products/:id/reject
//   POST /admin/products/:id/feature
//   POST /admin/products/:id/unfeature
//   GET  /admin/payouts             — per-trainer pending payouts summary
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import crypto from 'node:crypto';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { createPreference } from '../lib/mercadopago.js';
import { generateRoutinePDF } from '../lib/pdf.js';

// ─── Schemas ─────────────────────────────────────────────────────
const listQuery = z.object({
    type: z.enum(['ROUTINE', 'NUTRITION_PLAN', 'EBOOK', 'VIDEO_COURSE', 'BUNDLE']).optional(),
    sport: z.string().optional(),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).optional(),
    price_min: z.coerce.number().int().min(0).optional(),
    price_max: z.coerce.number().int().min(0).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});

const reviewsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

const createProductBody = z.object({
    type: z.enum(['ROUTINE', 'NUTRITION_PLAN', 'EBOOK', 'VIDEO_COURSE', 'BUNDLE']),
    title: z.string().trim().min(3).max(200),
    slug: z.string().trim().min(3).max(200).regex(/^[a-z0-9][a-z0-9-]*$/, 'slug inválido').optional(),
    description: z.string().min(10).max(5000),
    cover_url: z.string().url().optional(),
    sport: z.enum([
        'FOOTBALL', 'BOXING', 'MMA', 'POWERLIFTING', 'CROSSFIT',
        'WEIGHTLIFTING', 'GENERAL_FITNESS', 'RUNNING', 'NUTRITION', 'OTHER',
    ]).optional(),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).default('ALL_LEVELS'),
    duration_weeks: z.number().int().min(1).max(104).optional(),
    price_mxn: z.number().int().min(0),
    sale_price_mxn: z.number().int().min(0).nullable().optional(),
    content: z.any(), // JSON — weeks/days/exercises etc.
    pdf_url: z.string().url().optional(),
    video_urls: z.array(z.string().url()).optional(),
});

const patchProductBody = createProductBody.partial();

const rejectBody = z.object({
    reason: z.string().trim().min(3).max(500),
});

// ─── Helpers ─────────────────────────────────────────────────────
function isAdminRole(role) {
    return role === 'ADMIN' || role === 'SUPERADMIN';
}

function isTrainerOrAbove(role) {
    return role === 'ADMIN' || role === 'SUPERADMIN';
}

function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || crypto.randomBytes(4).toString('hex');
}

function effectivePrice(p) {
    return p.sale_price_mxn != null ? p.sale_price_mxn : p.price_mxn;
}

function apiPublicUrl() { return process.env.API_PUBLIC_URL || 'http://localhost:3001'; }
function webappPublicUrl() { return process.env.WEBAPP_PUBLIC_URL || 'http://localhost:3000'; }

// Strips sensitive fields from a product before exposing to non-owners.
function publicProductShape(p, { includeContent = false } = {}) {
    const base = {
        id: p.id,
        type: p.type,
        title: p.title,
        slug: p.slug,
        description: p.description,
        cover_url: p.cover_url,
        sport: p.sport,
        level: p.level,
        duration_weeks: p.duration_weeks,
        price_mxn: p.price_mxn,
        sale_price_mxn: p.sale_price_mxn,
        effective_price_mxn: effectivePrice(p),
        author_id: p.author_id,
        rating_avg: p.rating_avg,
        rating_count: p.rating_count,
        sales_count: p.sales_count,
        featured: p.featured,
        published: p.published,
        created_at: p.created_at,
    };
    if (includeContent) {
        base.content = p.content;
        base.pdf_url = p.pdf_url;
        base.video_urls = p.video_urls;
    }
    return base;
}

// ─────────────────────────────────────────────────────────────────
export default async function productsRoutes(fastify) {
    const { prisma } = fastify;

    // ─── GET /products (public) ───────────────────────────────────
    fastify.get('/products', async (req) => {
        const parsed = listQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const { type, sport, level, price_min, price_max, search, page, limit } = parsed.data;

        const where = { published: true };
        if (type) where.type = type;
        if (sport) where.sport = sport;
        if (level) where.level = level;
        if (price_min != null || price_max != null) {
            where.price_mxn = {};
            if (price_min != null) where.price_mxn.gte = price_min;
            if (price_max != null) where.price_mxn.lte = price_max;
        }
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [total, rows] = await Promise.all([
            prisma.digitalProduct.count({ where }),
            prisma.digitalProduct.findMany({
                where,
                orderBy: [
                    { featured: 'desc' },
                    { rating_avg: 'desc' },
                    { sales_count: 'desc' },
                ],
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    author: { select: { id: true, name: true, full_name: true, avatar_url: true } },
                },
            }),
        ]);

        return {
            total,
            page,
            limit,
            pages: Math.max(1, Math.ceil(total / limit)),
            products: rows.map((p) => ({
                ...publicProductShape(p),
                author: p.author,
            })),
        };
    });

    // ─── GET /products/:slug (public) ─────────────────────────────
    fastify.get('/products/:slug', async (req) => {
        const product = await prisma.digitalProduct.findFirst({
            where: { slug: req.params.slug, published: true },
            include: {
                author: {
                    select: { id: true, name: true, full_name: true, avatar_url: true },
                },
            },
        });
        if (!product) throw err('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);

        const reviews = await prisma.productReview.findMany({
            where: { product_id: product.id },
            orderBy: { created_at: 'desc' },
            take: 5,
            include: {
                user: { select: { id: true, name: true, avatar_url: true } },
            },
        });

        return {
            product: {
                ...publicProductShape(product),
                author: product.author,
            },
            reviews,
        };
    });

    // ─── POST /products/:id/purchase ──────────────────────────────
    fastify.post(
        '/products/:id/purchase',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const productId = req.params.id;
            const userId = req.user.sub || req.user.id;

            const product = await prisma.digitalProduct.findUnique({ where: { id: productId } });
            if (!product) throw err('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);
            if (!product.published) throw err('PRODUCT_UNAVAILABLE', 'Producto no disponible', 400);

            // Already owned?
            const existingPurchase = await prisma.productPurchase.findUnique({
                where: { user_id_product_id: { user_id: userId, product_id: productId } },
            });
            if (existingPurchase) {
                throw err('ALREADY_OWNED', 'Ya compraste este producto', 409);
            }

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            const amount = effectivePrice(product);

            const payment = await prisma.payment.create({
                data: {
                    workspace_id: product.workspace_id,
                    user_id: userId,
                    amount,
                    type: 'DIGITAL_PRODUCT',
                    reference: product.id,
                    description: `Marketplace: ${product.title}`,
                    status: 'PENDING',
                    metadata: {
                        product_id: product.id,
                        product_slug: product.slug,
                        product_title: product.title,
                        author_id: product.author_id,
                    },
                },
            });

            const mpPref = await createPreference({
                userId: user.id,
                type: 'DIGITAL_PRODUCT',
                reference: product.id,
                items: [{
                    id: product.id,
                    title: product.title,
                    quantity: 1,
                    unit_price: amount,
                }],
                payer: { email: user.email, name: user.full_name || user.name },
                back_urls: {
                    success: `${webappPublicUrl()}/marketplace/success?payment=${payment.id}`,
                    failure: `${webappPublicUrl()}/marketplace/failed?payment=${payment.id}`,
                    pending: `${webappPublicUrl()}/marketplace/pending?payment=${payment.id}`,
                },
                notification_url: `${apiPublicUrl()}/webhooks/mercadopago`,
                external_reference: payment.id,
                metadata: {
                    product_id: product.id,
                    workspace_id: product.workspace_id,
                },
            });

            await prisma.payment.update({
                where: { id: payment.id },
                data: { mp_preference_id: mpPref.preferenceId },
            });

            return {
                payment_id: payment.id,
                amount,
                init_point: mpPref.init_point,
                sandbox_init_point: mpPref.sandbox_init_point,
            };
        }
    );

    // ─── GET /products/me/purchases ───────────────────────────────
    fastify.get(
        '/products/me/purchases',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const purchases = await prisma.productPurchase.findMany({
                where: { user_id: userId },
                orderBy: { access_granted_at: 'desc' },
                include: { product: true },
            });
            return {
                purchases: purchases.map((pp) => ({
                    id: pp.id,
                    access_granted_at: pp.access_granted_at,
                    expires_at: pp.expires_at,
                    downloaded_times: pp.downloaded_times,
                    price_paid_mxn: pp.price_paid_mxn,
                    product: publicProductShape(pp.product),
                })),
            };
        }
    );

    // ─── GET /products/me/purchases/:id ───────────────────────────
    //
    // Viewer — returns full content + URLs with a short-lived token in
    // the querystring so the frontend can embed PDFs/videos without
    // the URL being shareable forever.
    fastify.get(
        '/products/me/purchases/:id',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const purchase = await prisma.productPurchase.findUnique({
                where: { id: req.params.id },
                include: { product: true },
            });
            if (!purchase) throw err('NOT_FOUND', 'Compra no encontrada', 404);
            if (purchase.user_id !== userId) throw err('FORBIDDEN', 'No autorizado', 403);

            // Ephemeral token: 5-min HMAC over productId+userId+ts. The token
            // itself isn't used to gate downloads (JWT still gates the route)
            // but is appended to URLs so CDN cache keys don't leak across users.
            const ts = Date.now();
            const secret = process.env.JWT_SECRET || 'dev';
            const token = crypto
                .createHmac('sha256', secret)
                .update(`${purchase.id}:${userId}:${ts}`)
                .digest('hex')
                .slice(0, 32);

            const p = purchase.product;
            return {
                purchase: {
                    id: purchase.id,
                    access_granted_at: purchase.access_granted_at,
                    downloaded_times: purchase.downloaded_times,
                },
                product: publicProductShape(p, { includeContent: true }),
                access_token: token,
                expires_in_sec: 300,
                download_endpoint: `/products/me/purchases/${purchase.id}/download`,
            };
        }
    );

    // ─── POST /products/me/purchases/:id/download ─────────────────
    //
    // Generates a watermarked PDF ({email} | {timestamp}), increments
    // downloaded_times, returns the URL (or data URL in dev).
    fastify.post(
        '/products/me/purchases/:id/download',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const purchase = await prisma.productPurchase.findUnique({
                where: { id: req.params.id },
                include: { product: true },
            });
            if (!purchase) throw err('NOT_FOUND', 'Compra no encontrada', 404);
            if (purchase.user_id !== userId) throw err('FORBIDDEN', 'No autorizado', 403);

            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) throw err('USER_NOT_FOUND', 'Usuario inexistente', 404);

            const pdf = await generateRoutinePDF(purchase.product, user);

            const updated = await prisma.productPurchase.update({
                where: { id: purchase.id },
                data: { downloaded_times: { increment: 1 } },
            });

            return {
                url: pdf.url,
                key: pdf.key,
                storage: pdf.storage,
                downloaded_times: updated.downloaded_times,
            };
        }
    );

    // ═════════════════════════════════════════════════════════════
    // Authors (ADMIN+)
    // ═════════════════════════════════════════════════════════════

    // ─── POST /products ───────────────────────────────────────────
    fastify.post(
        '/products',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            if (!isTrainerOrAbove(req.user.role)) {
                throw err('FORBIDDEN', 'Solo entrenadores pueden crear productos', 403);
            }
            const parsed = createProductBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
            const data = parsed.data;

            const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
            if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

            // Slug: explicit, or derived from title. Must be unique per workspace.
            let slug = data.slug || slugify(data.title);
            // De-dup: append short random suffix on conflict.
            for (let i = 0; i < 5; i++) {
                const clash = await prisma.digitalProduct.findUnique({
                    where: { workspace_id_slug: { workspace_id, slug } },
                });
                if (!clash) break;
                slug = `${slugify(data.title)}-${crypto.randomBytes(2).toString('hex')}`;
            }

            const product = await prisma.digitalProduct.create({
                data: {
                    workspace_id,
                    author_id: req.user.sub || req.user.id,
                    type: data.type,
                    title: data.title,
                    slug,
                    description: data.description,
                    cover_url: data.cover_url || null,
                    sport: data.sport || null,
                    level: data.level,
                    duration_weeks: data.duration_weeks || null,
                    price_mxn: data.price_mxn,
                    sale_price_mxn: data.sale_price_mxn ?? null,
                    content: data.content || {},
                    pdf_url: data.pdf_url || null,
                    video_urls: data.video_urls || [],
                    published: false, // always unpublished on create — admin approves
                },
            });

            return { product };
        }
    );

    // ─── PATCH /products/:id ──────────────────────────────────────
    //
    // Authors edit their own; admins edit anyone's. If the product was
    // already published, editing sets `published=false` again so it
    // goes back through approval (unless an admin made the edit).
    fastify.patch(
        '/products/:id',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = patchProductBody.safeParse(req.body || {});
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

            const product = await prisma.digitalProduct.findUnique({ where: { id: req.params.id } });
            if (!product) throw err('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);

            const userId = req.user.sub || req.user.id;
            const isAuthor = product.author_id === userId;
            const isAdmin = isAdminRole(req.user.role);
            if (!isAuthor && !isAdmin) {
                throw err('FORBIDDEN', 'Solo el autor o un admin puede editar', 403);
            }

            const data = { ...parsed.data };
            // If author edits a live product → back to approval queue.
            if (!isAdmin && product.published) {
                data.published = false;
            }

            const updated = await prisma.digitalProduct.update({
                where: { id: product.id },
                data,
            });
            return { product: updated };
        }
    );

    // ─── GET /products/me/authored ────────────────────────────────
    fastify.get(
        '/products/me/authored',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            if (!isTrainerOrAbove(req.user.role)) {
                throw err('FORBIDDEN', 'Solo entrenadores', 403);
            }
            const userId = req.user.sub || req.user.id;
            const products = await prisma.digitalProduct.findMany({
                where: { author_id: userId },
                orderBy: { created_at: 'desc' },
            });
            return { products };
        }
    );

    // ─── GET /products/me/sales ───────────────────────────────────
    fastify.get(
        '/products/me/sales',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            if (!isTrainerOrAbove(req.user.role)) {
                throw err('FORBIDDEN', 'Solo entrenadores', 403);
            }
            const userId = req.user.sub || req.user.id;

            // All purchases of products I authored.
            const purchases = await prisma.productPurchase.findMany({
                where: { product: { author_id: userId } },
                include: {
                    product: true,
                    user: { select: { id: true, name: true, full_name: true, email: true } },
                },
                orderBy: { access_granted_at: 'desc' },
            });

            const totals = purchases.reduce(
                (acc, p) => {
                    acc.gross_mxn += p.price_paid_mxn;
                    acc.my_payout_mxn += p.author_payout_mxn;
                    acc.gym_revenue_mxn += p.gym_revenue_mxn;
                    return acc;
                },
                { gross_mxn: 0, my_payout_mxn: 0, gym_revenue_mxn: 0 }
            );

            // Ratings by product.
            const products = await prisma.digitalProduct.findMany({
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
                totals,
                sales: purchases.map((p) => ({
                    purchase_id: p.id,
                    product: {
                        id: p.product.id,
                        title: p.product.title,
                        slug: p.product.slug,
                    },
                    user: p.user,
                    price_paid_mxn: p.price_paid_mxn,
                    author_payout_mxn: p.author_payout_mxn,
                    purchased_at: p.access_granted_at,
                })),
                products_summary: products,
            };
        }
    );

    // ═════════════════════════════════════════════════════════════
    // Admin
    // ═════════════════════════════════════════════════════════════

    const adminGuard = {
        preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')],
    };

    const adminListQuery = z.object({
        published: z.enum(['true', 'false']).optional(),
        featured: z.enum(['true', 'false']).optional(),
        author_id: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    });

    // ─── GET /admin/products ──────────────────────────────────────
    fastify.get('/admin/products', adminGuard, async (req) => {
        const parsed = adminListQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const { published, featured, author_id, page, limit } = parsed.data;
        const where = {};
        if (published != null) where.published = published === 'true';
        if (featured != null) where.featured = featured === 'true';
        if (author_id) where.author_id = author_id;

        const [total, rows] = await Promise.all([
            prisma.digitalProduct.count({ where }),
            prisma.digitalProduct.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    author: { select: { id: true, name: true, full_name: true, email: true } },
                },
            }),
        ]);

        return {
            total,
            page,
            limit,
            pages: Math.max(1, Math.ceil(total / limit)),
            products: rows,
        };
    });

    // ─── POST /admin/products/:id/approve ─────────────────────────
    fastify.post('/admin/products/:id/approve', adminGuard, async (req) => {
        const product = await prisma.digitalProduct.update({
            where: { id: req.params.id },
            data: { published: true },
        });
        await fireEvent('product.approved', {
            workspaceId: product.workspace_id,
            productId: product.id,
            authorId: product.author_id,
            title: product.title,
        });
        return { product };
    });

    // ─── POST /admin/products/:id/reject ──────────────────────────
    fastify.post('/admin/products/:id/reject', adminGuard, async (req) => {
        const parsed = rejectBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const product = await prisma.digitalProduct.update({
            where: { id: req.params.id },
            data: { published: false },
        });
        await fireEvent('product.rejected', {
            workspaceId: product.workspace_id,
            productId: product.id,
            authorId: product.author_id,
            title: product.title,
            reason: parsed.data.reason,
        });
        return { product, reason: parsed.data.reason };
    });

    // ─── POST /admin/products/:id/feature ─────────────────────────
    fastify.post('/admin/products/:id/feature', adminGuard, async (req) => {
        const product = await prisma.digitalProduct.update({
            where: { id: req.params.id },
            data: { featured: true },
        });
        return { product };
    });

    fastify.post('/admin/products/:id/unfeature', adminGuard, async (req) => {
        const product = await prisma.digitalProduct.update({
            where: { id: req.params.id },
            data: { featured: false },
        });
        return { product };
    });

    // ─── GET /admin/payouts ───────────────────────────────────────
    //
    // Summary per trainer of accumulated payouts. "Pending" = all
    // purchases for now (we don't persist a paid_at on payouts yet;
    // when the payout pipeline lands we'll add a column and filter
    // here). Returns one row per author.
    fastify.get('/admin/payouts', adminGuard, async (req) => {
        const rows = await prisma.productPurchase.groupBy({
            by: ['product_id'],
            _sum: {
                author_payout_mxn: true,
                gym_revenue_mxn: true,
                price_paid_mxn: true,
            },
            _count: { id: true },
        });

        if (!rows.length) return { payouts: [] };

        const productIds = rows.map((r) => r.product_id);
        const products = await prisma.digitalProduct.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true,
                title: true,
                author_id: true,
                author: { select: { id: true, name: true, full_name: true, email: true } },
            },
        });
        const byId = new Map(products.map((p) => [p.id, p]));

        // Aggregate per author.
        const byAuthor = new Map();
        for (const r of rows) {
            const product = byId.get(r.product_id);
            if (!product) continue;
            const authorId = product.author_id;
            if (!byAuthor.has(authorId)) {
                byAuthor.set(authorId, {
                    author: product.author,
                    products: [],
                    total_payout_mxn: 0,
                    total_gym_revenue_mxn: 0,
                    total_gross_mxn: 0,
                    total_sales: 0,
                });
            }
            const entry = byAuthor.get(authorId);
            entry.products.push({
                product_id: product.id,
                title: product.title,
                sales: r._count.id,
                payout_mxn: r._sum.author_payout_mxn || 0,
            });
            entry.total_payout_mxn += r._sum.author_payout_mxn || 0;
            entry.total_gym_revenue_mxn += r._sum.gym_revenue_mxn || 0;
            entry.total_gross_mxn += r._sum.price_paid_mxn || 0;
            entry.total_sales += r._count.id;
        }

        return {
            payouts: [...byAuthor.values()].sort(
                (a, b) => b.total_payout_mxn - a.total_payout_mxn
            ),
        };
    });
}
