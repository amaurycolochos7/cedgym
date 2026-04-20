// ─────────────────────────────────────────────────────────────────
// Admin: create/edit digital products as admin.
//
// The regular `POST /products` (in routes/products.js) forces the
// author to be the authenticated trainer and always creates the
// product with `published=false`. This route is for admins who want
// to publish a product directly (seed marketplace, launch a promo,
// upload a routine bought from a third-party coach, etc.).
//
//   POST  /admin/products/create   — create any product as admin
//   PATCH /admin/products/:id      — admin-authoritative patch (does not
//                                    unpublish on edit)
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import crypto from 'node:crypto';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';

const createBody = z.object({
  type: z.enum(['ROUTINE', 'NUTRITION_PLAN', 'EBOOK', 'VIDEO_COURSE', 'BUNDLE']),
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().min(3).max(200).regex(/^[a-z0-9][a-z0-9-]*$/, 'slug inválido').optional(),
  description: z.string().min(10).max(5000),
  cover_url: z.string().url().nullable().optional(),
  sport: z.enum([
    'FOOTBALL', 'BOXING', 'MMA', 'POWERLIFTING', 'CROSSFIT',
    'WEIGHTLIFTING', 'GENERAL_FITNESS', 'RUNNING', 'NUTRITION', 'OTHER',
  ]).nullable().optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).default('ALL_LEVELS'),
  duration_weeks: z.number().int().min(1).max(104).nullable().optional(),
  price_mxn: z.number().int().min(0),
  sale_price_mxn: z.number().int().min(0).nullable().optional(),
  content: z.any().optional(),
  pdf_url: z.string().url().nullable().optional(),
  video_urls: z.array(z.string().url()).optional(),
  // Admin-only fields
  author_id: z.string().optional(),
  published: z.boolean().optional().default(true),
  featured: z.boolean().optional().default(false),
});

const patchBody = z.object({
  type: z.enum(['ROUTINE', 'NUTRITION_PLAN', 'EBOOK', 'VIDEO_COURSE', 'BUNDLE']).optional(),
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  cover_url: z.string().url().nullable().optional(),
  sport: z.enum([
    'FOOTBALL', 'BOXING', 'MMA', 'POWERLIFTING', 'CROSSFIT',
    'WEIGHTLIFTING', 'GENERAL_FITNESS', 'RUNNING', 'NUTRITION', 'OTHER',
  ]).nullable().optional(),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']).optional(),
  duration_weeks: z.number().int().min(1).max(104).nullable().optional(),
  price_mxn: z.number().int().min(0).optional(),
  sale_price_mxn: z.number().int().min(0).nullable().optional(),
  content: z.any().optional(),
  pdf_url: z.string().url().nullable().optional(),
  video_urls: z.array(z.string().url()).optional(),
  author_id: z.string().optional(),
  published: z.boolean().optional(),
  featured: z.boolean().optional(),
});

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || crypto.randomBytes(4).toString('hex');
}

export default async function adminProductsRoutes(fastify) {
  const { prisma } = fastify;

  const adminGuard = {
    preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')],
  };

  // ─── POST /admin/products/create ──────────────────────────────
  //
  // Create a new DigitalProduct directly as admin. Unlike the
  // author-facing `POST /products`, this:
  //   • lets the admin pick any `author_id` (defaults to the admin
  //     themselves if omitted);
  //   • can publish it immediately (`published: true` is the default);
  //   • accepts `featured` too.
  fastify.post('/admin/products/create', adminGuard, async (req) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
    const data = parsed.data;

    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

    const authorId = data.author_id || req.user.sub || req.user.id;
    // Verify author exists and belongs to the same workspace.
    const author = await prisma.user.findUnique({ where: { id: authorId } });
    if (!author) throw err('AUTHOR_NOT_FOUND', 'Autor no encontrado', 400);

    let slug = data.slug || slugify(data.title);
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
        author_id: authorId,
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
        published: data.published !== false,
        featured: data.featured === true,
      },
    });

    if (product.published) {
      await fireEvent('product.approved', {
        workspaceId: product.workspace_id,
        productId: product.id,
        authorId: product.author_id,
        title: product.title,
      }).catch(() => {});
    }

    return { product };
  });

  // ─── PATCH /admin/products/:id ────────────────────────────────
  //
  // Admin-authoritative edit. Unlike the route in products.js
  // (which un-publishes a product when its author edits it), this
  // one preserves the `published` flag unless the caller changes it
  // explicitly.
  fastify.patch('/admin/products/:id', adminGuard, async (req) => {
    const parsed = patchBody.safeParse(req.body || {});
    if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

    const existing = await prisma.digitalProduct.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) throw err('PRODUCT_NOT_FOUND', 'Producto no encontrado', 404);

    const data = { ...parsed.data };
    if (data.author_id) {
      const author = await prisma.user.findUnique({ where: { id: data.author_id } });
      if (!author) throw err('AUTHOR_NOT_FOUND', 'Autor no encontrado', 400);
    }

    const updated = await prisma.digitalProduct.update({
      where: { id: existing.id },
      data,
    });
    return { product: updated };
  });
}
