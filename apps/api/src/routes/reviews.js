// ─────────────────────────────────────────────────────────────────
// Product reviews.
//
// Public:
//   GET  /products/:id/reviews
//
// Authenticated (JWT):
//   POST   /products/:id/reviews               — only if the user owns the product
//
// Admin / author:
//   DELETE /products/:id/reviews/:reviewId     — admin or the review's author
//
// Every mutation recomputes product.rating_avg + rating_count in the
// same transaction so the product shape stays consistent.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';

const createBody = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
});

const listQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

function isAdminRole(role) {
    return role === 'ADMIN' || role === 'SUPERADMIN';
}

// Recompute rating_avg + rating_count for a product. Run inside a tx.
async function recomputeRating(tx, productId) {
    const agg = await tx.productReview.aggregate({
        where: { product_id: productId },
        _avg: { rating: true },
        _count: { id: true },
    });
    await tx.digitalProduct.update({
        where: { id: productId },
        data: {
            rating_avg: agg._avg.rating || 0,
            rating_count: agg._count.id || 0,
        },
    });
}

export default async function reviewsRoutes(fastify) {
    const { prisma } = fastify;

    // ─── GET /products/:id/reviews ────────────────────────────────
    fastify.get('/products/:id/reviews', async (req) => {
        const parsed = listQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const { page, limit } = parsed.data;

        const productId = req.params.id;
        const product = await prisma.digitalProduct.findUnique({ where: { id: productId } });
        if (!product) throw err('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);

        const [total, rows] = await Promise.all([
            prisma.productReview.count({ where: { product_id: productId } }),
            prisma.productReview.findMany({
                where: { product_id: productId },
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: { select: { id: true, name: true, avatar_url: true } },
                },
            }),
        ]);

        return {
            total,
            page,
            limit,
            pages: Math.max(1, Math.ceil(total / limit)),
            reviews: rows,
            rating_avg: product.rating_avg,
            rating_count: product.rating_count,
        };
    });

    // ─── POST /products/:id/reviews ───────────────────────────────
    fastify.post(
        '/products/:id/reviews',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = createBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
            const { rating, comment } = parsed.data;

            const productId = req.params.id;
            const userId = req.user.sub || req.user.id;

            const product = await prisma.digitalProduct.findUnique({ where: { id: productId } });
            if (!product) throw err('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);

            // Must own the product.
            const purchase = await prisma.productPurchase.findUnique({
                where: { user_id_product_id: { user_id: userId, product_id: productId } },
            });
            if (!purchase) {
                throw err('NOT_OWNED', 'Solo puedes reseñar productos que compraste', 403);
            }

            // Upsert so users can update their own review, then recompute.
            const review = await prisma.$transaction(async (tx) => {
                const r = await tx.productReview.upsert({
                    where: { product_id_user_id: { product_id: productId, user_id: userId } },
                    update: { rating, comment: comment || null },
                    create: { product_id: productId, user_id: userId, rating, comment: comment || null },
                });
                await recomputeRating(tx, productId);
                return r;
            });

            return { review };
        }
    );

    // ─── DELETE /products/:id/reviews/:reviewId ───────────────────
    fastify.delete(
        '/products/:id/reviews/:reviewId',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const { id: productId, reviewId } = req.params;
            const userId = req.user.sub || req.user.id;

            const review = await prisma.productReview.findUnique({ where: { id: reviewId } });
            if (!review || review.product_id !== productId) {
                throw err('REVIEW_NOT_FOUND', 'Reseña no encontrada', 404);
            }
            if (review.user_id !== userId && !isAdminRole(req.user.role)) {
                throw err('FORBIDDEN', 'Solo el autor del review o un admin', 403);
            }

            await prisma.$transaction(async (tx) => {
                await tx.productReview.delete({ where: { id: reviewId } });
                await recomputeRating(tx, productId);
            });

            return { deleted: true };
        }
    );
}
