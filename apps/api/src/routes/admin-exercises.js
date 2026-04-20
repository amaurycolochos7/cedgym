// ─────────────────────────────────────────────────────────────────
// Admin: Exercise library CRUD + bulk-import + stats.
//
//   GET    /admin/exercises                 — list with filters
//   POST   /admin/exercises                 — create (auto-slug + uniqueness)
//   PATCH  /admin/exercises/:id             — partial update (workspace-scoped)
//   DELETE /admin/exercises/:id             — soft delete (is_active=false)
//   POST   /admin/exercises/bulk-import     — upsert array by (workspace_id, slug)
//   GET    /admin/exercises/stats           — counts by muscle_group & level
//
// All endpoints are workspace-scoped against req.user.workspace_id and
// guarded by authenticate + requireRole('ADMIN','SUPERADMIN').
//
// NOTE: this file is `.js` (not `.ts`) because the API autoloader in
// index.js filters on `.js` and the package is pure ESM with no TS
// toolchain. Swap extensions once the API migrates to TS.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import crypto from 'node:crypto';
import { err } from '../lib/errors.js';

const MUSCLE_GROUPS = [
  'CHEST', 'BACK', 'LEGS', 'SHOULDERS', 'ARMS', 'CORE', 'FULL_BODY', 'CARDIO',
];
const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

// ── Helpers ───────────────────────────────────────────────────────
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || crypto.randomBytes(4).toString('hex');
}

// Generate a slug that does not collide within `workspace_id`.
// Appends -2, -3, ... until free (skipping the row with id=excludeId,
// used during updates so a row isn't treated as a clash with itself).
async function uniqueSlug(prisma, workspace_id, base, excludeId = null) {
  let candidate = base;
  let n = 2;
  // Bounded loop to avoid runaway queries on a misbehaving DB.
  for (let i = 0; i < 50; i++) {
    const clash = await prisma.exercise.findFirst({
      where: {
        workspace_id,
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${n++}`;
  }
  // Fallback — extremely unlikely.
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

// ── Zod schemas ───────────────────────────────────────────────────
const cuid = z.string().min(1);

const createBody = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9][a-z0-9-]*$/, 'slug inválido').optional(),
  muscle_group: z.enum(MUSCLE_GROUPS),
  equipment: z.array(z.string().trim().min(1)).default([]),
  level: z.enum(LEVELS),
  video_url: z.string().url().optional().nullable(),
  thumbnail_url: z.string().url().optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  default_sets: z.number().int().min(1).max(20).default(3),
  default_reps: z.string().trim().min(1).max(40).default('10'),
  default_rest_sec: z.number().int().min(0).max(600).default(60),
  variant_easier_id: cuid.optional().nullable(),
  variant_harder_id: cuid.optional().nullable(),
  is_active: z.boolean().default(true),
});

const patchBody = createBody.partial();

const listQuery = z.object({
  muscle_group: z.enum(MUSCLE_GROUPS).optional(),
  level: z.enum(LEVELS).optional(),
  equipment: z.string().optional(), // CSV
  q: z.string().trim().min(1).optional(),
  is_active: z.union([z.literal('true'), z.literal('false')]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const bulkBody = z.object({
  exercises: z.array(z.any()).min(1).max(1000),
});

// Guard: variant_easier_id / variant_harder_id must live in the same
// workspace as the caller. Returns a normalized `{ id | null }` or
// throws a 400 error with a descriptive code.
async function assertVariantWorkspace(prisma, workspace_id, variantId, field) {
  if (!variantId) return null;
  const v = await prisma.exercise.findUnique({
    where: { id: variantId },
    select: { id: true, workspace_id: true },
  });
  if (!v) throw err('VARIANT_NOT_FOUND', `${field} no existe`, 400);
  if (v.workspace_id !== workspace_id) {
    throw err('VARIANT_WRONG_WORKSPACE', `${field} pertenece a otro workspace`, 400);
  }
  return v.id;
}

// ─────────────────────────────────────────────────────────────────
export default async function adminExercisesRoutes(fastify) {
  const { prisma } = fastify;
  const adminGuard = {
    preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')],
  };

  // ── GET /admin/exercises ────────────────────────────────────────
  fastify.get('/admin/exercises', adminGuard, async (req) => {
    const parsed = listQuery.safeParse(req.query || {});
    if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
    const { muscle_group, level, equipment, q, is_active, page, limit } = parsed.data;

    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

    const where = {
      workspace_id,
      ...(muscle_group && { muscle_group }),
      ...(level && { level }),
      // is_active defaults to true if not explicitly set.
      is_active: is_active === undefined ? true : is_active === 'true',
      ...(q && { name: { contains: q, mode: 'insensitive' } }),
      ...(equipment && {
        // ANY of the CSV-provided tags must intersect exercise.equipment[].
        equipment: { hasSome: equipment.split(',').map((s) => s.trim()).filter(Boolean) },
      }),
    };

    const [items, total] = await Promise.all([
      prisma.exercise.findMany({
        where,
        orderBy: [{ muscle_group: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.exercise.count({ where }),
    ]);
    return { items, total, page, limit };
  });

  // ── GET /admin/exercises/stats ──────────────────────────────────
  // NOTE: declared before `/:id` routes so the literal path wins.
  fastify.get('/admin/exercises/stats', adminGuard, async (req) => {
    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

    const where = { workspace_id, is_active: true };
    const [byMuscleRaw, byLevelRaw, total] = await Promise.all([
      prisma.exercise.groupBy({
        by: ['muscle_group'], where, _count: { _all: true },
      }),
      prisma.exercise.groupBy({
        by: ['level'], where, _count: { _all: true },
      }),
      prisma.exercise.count({ where }),
    ]);

    // Pre-seed every enum value at 0 so the UI doesn't need to handle
    // missing keys. Prisma only returns buckets that have rows.
    const by_muscle = Object.fromEntries(MUSCLE_GROUPS.map((k) => [k, 0]));
    for (const r of byMuscleRaw) by_muscle[r.muscle_group] = r._count._all;
    const by_level = Object.fromEntries(LEVELS.map((k) => [k, 0]));
    for (const r of byLevelRaw) by_level[r.level] = r._count._all;

    return { by_muscle, by_level, total };
  });

  // ── POST /admin/exercises ───────────────────────────────────────
  fastify.post('/admin/exercises', adminGuard, async (req, reply) => {
    const parsed = createBody.safeParse(req.body || {});
    if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
    const data = parsed.data;

    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

    const baseSlug = data.slug ? slugify(data.slug) : slugify(data.name);
    const slug = await uniqueSlug(prisma, workspace_id, baseSlug);

    // Cross-workspace variant guard (both fields are nullable).
    const easier = await assertVariantWorkspace(
      prisma, workspace_id, data.variant_easier_id, 'variant_easier_id',
    );
    const harder = await assertVariantWorkspace(
      prisma, workspace_id, data.variant_harder_id, 'variant_harder_id',
    );

    const created = await prisma.exercise.create({
      data: {
        workspace_id,
        name: data.name,
        slug,
        muscle_group: data.muscle_group,
        equipment: data.equipment,
        level: data.level,
        video_url: data.video_url ?? null,
        thumbnail_url: data.thumbnail_url ?? null,
        description: data.description ?? null,
        default_sets: data.default_sets,
        default_reps: data.default_reps,
        default_rest_sec: data.default_rest_sec,
        variant_easier_id: easier,
        variant_harder_id: harder,
        is_active: data.is_active,
      },
    });
    reply.code(201);
    return created;
  });

  // ── PATCH /admin/exercises/:id ──────────────────────────────────
  fastify.patch('/admin/exercises/:id', adminGuard, async (req) => {
    const parsed = patchBody.safeParse(req.body || {});
    if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
    const data = parsed.data;

    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    const existing = await prisma.exercise.findUnique({ where: { id: req.params.id } });
    if (!existing) throw err('NOT_FOUND', 'Ejercicio no encontrado', 404);
    if (existing.workspace_id !== workspace_id) {
      throw err('FORBIDDEN', 'Ejercicio pertenece a otro workspace', 403);
    }

    // Re-slugify only if caller sent a slug or renamed and no slug was set.
    let nextSlug = existing.slug;
    if (data.slug && data.slug !== existing.slug) {
      nextSlug = await uniqueSlug(prisma, workspace_id, slugify(data.slug), existing.id);
    }

    // Only validate variants that are actually being changed.
    const easier = data.variant_easier_id !== undefined
      ? await assertVariantWorkspace(prisma, workspace_id, data.variant_easier_id, 'variant_easier_id')
      : undefined;
    const harder = data.variant_harder_id !== undefined
      ? await assertVariantWorkspace(prisma, workspace_id, data.variant_harder_id, 'variant_harder_id')
      : undefined;

    const updated = await prisma.exercise.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slug !== undefined && { slug: nextSlug }),
        ...(data.muscle_group !== undefined && { muscle_group: data.muscle_group }),
        ...(data.equipment !== undefined && { equipment: data.equipment }),
        ...(data.level !== undefined && { level: data.level }),
        ...(data.video_url !== undefined && { video_url: data.video_url }),
        ...(data.thumbnail_url !== undefined && { thumbnail_url: data.thumbnail_url }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.default_sets !== undefined && { default_sets: data.default_sets }),
        ...(data.default_reps !== undefined && { default_reps: data.default_reps }),
        ...(data.default_rest_sec !== undefined && { default_rest_sec: data.default_rest_sec }),
        ...(easier !== undefined && { variant_easier_id: easier }),
        ...(harder !== undefined && { variant_harder_id: harder }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
      },
    });
    return updated;
  });

  // ── DELETE /admin/exercises/:id ─────────────────────────────────
  // Soft delete: flip is_active=false. Preserves FK refs from
  // RoutineExercise and variant links.
  fastify.delete('/admin/exercises/:id', adminGuard, async (req) => {
    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    const existing = await prisma.exercise.findUnique({ where: { id: req.params.id } });
    if (!existing) return { success: true };
    if (existing.workspace_id !== workspace_id) {
      throw err('FORBIDDEN', 'Ejercicio pertenece a otro workspace', 403);
    }
    await prisma.exercise.update({
      where: { id: existing.id },
      data: { is_active: false },
    });
    return { success: true };
  });

  // ── POST /admin/exercises/bulk-import ───────────────────────────
  // Upserts an array of exercises by (workspace_id, slug). The schema
  // lacks an explicit @@unique on that pair so we emulate upsert with
  // findFirst + update/create, guarded in per-item try/catch so a bad
  // row doesn't abort the rest.
  fastify.post('/admin/exercises/bulk-import', adminGuard, async (req) => {
    const parsed = bulkBody.safeParse(req.body || {});
    if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

    const workspace_id = req.user.workspace_id || fastify.defaultWorkspaceId;
    if (!workspace_id) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

    const errors = [];
    let created = 0;
    let updated = 0;

    for (let i = 0; i < parsed.data.exercises.length; i++) {
      const raw = parsed.data.exercises[i];
      try {
        const d = createBody.parse(raw);
        const slug = d.slug ? slugify(d.slug) : slugify(d.name);

        // Cross-workspace variant guard.
        const easier = await assertVariantWorkspace(
          prisma, workspace_id, d.variant_easier_id, 'variant_easier_id',
        );
        const harder = await assertVariantWorkspace(
          prisma, workspace_id, d.variant_harder_id, 'variant_harder_id',
        );

        const existing = await prisma.exercise.findFirst({
          where: { workspace_id, slug },
          select: { id: true },
        });

        const payload = {
          name: d.name,
          muscle_group: d.muscle_group,
          equipment: d.equipment,
          level: d.level,
          video_url: d.video_url ?? null,
          thumbnail_url: d.thumbnail_url ?? null,
          description: d.description ?? null,
          default_sets: d.default_sets,
          default_reps: d.default_reps,
          default_rest_sec: d.default_rest_sec,
          variant_easier_id: easier,
          variant_harder_id: harder,
          is_active: d.is_active,
        };

        if (existing) {
          await prisma.exercise.update({ where: { id: existing.id }, data: payload });
          updated++;
        } else {
          await prisma.exercise.create({ data: { workspace_id, slug, ...payload } });
          created++;
        }
      } catch (e) {
        errors.push({ index: i, error: e?.message || String(e) });
      }
    }

    return { created, updated, errors };
  });
}
