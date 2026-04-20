// ─────────────────────────────────────────────────────────────────
// Referral program routes.
//
// Public:
//   POST /referrals/apply            { code } → { valid, referrer_name, reward_referred_mxn }
//
// Authenticated (JWT):
//   GET  /referrals/me               { code, referrals[], total_credit_mxn }
//   GET  /referrals/leaderboard
//
// Admin:
//   GET  /admin/referrals
//
// Also exports:
//   • createReferralOnRegister(prisma, redis, referredUserId, code, workspaceId)
//     → called by auth.register right after the user is created.
//   • confirmReferralOnFirstPayment(prisma, redis, userId, paymentId)
//     → called by the MP webhook (or payments track) on the user's
//       first approved payment.
//   • getReferrerCredit(redis, referrerId) → helper for other tracks
//     to spend accumulated credit at checkout.
//
// Rewards are configurable via env:
//   REFERRAL_REFERRER_REWARD_MXN   (default 200) — accumulates in Redis.
//   REFERRAL_REFERRED_DISCOUNT_PCT (default 10)  — applied at checkout.
// ─────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import dayjs from 'dayjs';
import { z } from 'zod';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import { awardXP } from '../lib/xp.js';

const REWARD_REFERRER_MXN = Number(process.env.REFERRAL_REFERRER_REWARD_MXN || 200);
// Stored as "mxn equivalent percent point" (10 000 = 10 %) per spec —
// the referred user gets a 10 % discount on their first payment, we
// store the raw percent as a sentinel.
const REFERRED_DISCOUNT_PCT_STORED = Number(process.env.REFERRAL_REFERRED_DISCOUNT_MXN || 10000);

// Redis key helpers. We keep code→userId lookups symmetric so both
// lookups (by user and by code) are O(1).
const redisKeyForUserCode = (userId) => `referral:code:${userId}`;
const redisKeyForCodeLookup = (code) => `referral:lookup:${code.toUpperCase()}`;
const redisKeyForCredit = (userId) => `credit:${userId}`;

// ── Code generation ────────────────────────────────────────────
// Format: CED-{USERNAME}-{4HEX}. Username is the slug-safe prefix of
// `user.name` upper-cased. We append 4 hex chars of a SHA-256(userId)
// for uniqueness so two users with the same name don't clash.
function generateCode(userId, name) {
    const base = (name || 'USER')
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10) || 'USER';
    const hash = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 4).toUpperCase();
    return `CED-${base}-${hash}`;
}

// Resolve (or create) the referral code for a user and cache it.
// Note the TWO Redis entries — we need to look up in both directions.
export async function ensureReferralCode(prisma, redis, userId) {
    try {
        const cached = await redis.get(redisKeyForUserCode(userId));
        if (cached) return cached;
    } catch { /* redis down → fall through */ }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true },
    });
    if (!user) throw err('USER_NOT_FOUND', 'Usuario no encontrado', 404);

    const code = generateCode(user.id, user.name);
    try {
        await redis.set(redisKeyForUserCode(userId), code);
        await redis.set(redisKeyForCodeLookup(code), userId);
    } catch { /* cache-miss is recoverable */ }
    return code;
}

// Reverse lookup: code → referrer user row. Used by /referrals/apply
// and createReferralOnRegister. Redis first; if empty, we scan the
// user table. (We don't want to require Redis to be 100 % reliable.)
async function resolveReferrerByCode(prisma, redis, code) {
    if (!code) return null;
    const upper = code.trim().toUpperCase();
    try {
        const userId = await redis.get(redisKeyForCodeLookup(upper));
        if (userId) {
            return prisma.user.findUnique({ where: { id: userId } });
        }
    } catch { /* fall through */ }

    // Fallback: brute-force regenerate for every user in the last 90
    // days. Bounded and only hit on cold cache — we repopulate Redis
    // when we find a match.
    const candidates = await prisma.user.findMany({
        where: { created_at: { gte: dayjs().subtract(90, 'day').toDate() } },
        select: { id: true, name: true },
        take: 5000,
    });
    for (const u of candidates) {
        if (generateCode(u.id, u.name) === upper) {
            try {
                await redis.set(redisKeyForCodeLookup(upper), u.id);
                await redis.set(redisKeyForUserCode(u.id), upper);
            } catch { /* ignore */ }
            return prisma.user.findUnique({ where: { id: u.id } });
        }
    }
    return null;
}

// ── Integration hooks ──────────────────────────────────────────

// Called by auth registration once the user exists + is activated.
// Creates a PENDING Referral row. Safe to call with a bad / empty code;
// returns null in that case.
export async function createReferralOnRegister(prisma, redis, referredUserId, code) {
    if (!code) return null;
    const referrer = await resolveReferrerByCode(prisma, redis, code);
    if (!referrer) return null;
    if (referrer.id === referredUserId) return null; // can't refer yourself

    const referred = await prisma.user.findUnique({
        where: { id: referredUserId },
        select: { id: true, workspace_id: true },
    });
    if (!referred) return null;

    try {
        return await prisma.referral.create({
            data: {
                workspace_id: referred.workspace_id,
                referrer_id: referrer.id,
                referred_id: referredUserId,
                code_used: code.trim().toUpperCase(),
                reward_referrer_mxn: REWARD_REFERRER_MXN,
                reward_referred_mxn: REFERRED_DISCOUNT_PCT_STORED,
                status: 'PENDING',
            },
        });
    } catch (e) {
        // Unique constraint on referred_id → user can only be referred
        // once. Silently no-op.
        if (e?.code === 'P2002') return null;
        throw e;
    }
}

// Bumps the referrer's Redis credit balance atomically.
async function addCredit(redis, referrerId, amountMxn) {
    try {
        const key = redisKeyForCredit(referrerId);
        await redis.incrby(key, amountMxn);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[referrals] credit increment failed:', e.message);
    }
}

export async function getReferrerCredit(redis, userId) {
    try {
        const v = await redis.get(redisKeyForCredit(userId));
        return v ? Number(v) : 0;
    } catch {
        return 0;
    }
}

// Called by webhooks.js on the user's first APPROVED payment.
// Looks up whether this user was referred, flips the referral to
// CONFIRMED, pays out the referrer (credit + XP), and fires the
// reward_granted event.
export async function confirmReferralOnFirstPayment(prisma, redis, userId, paymentId) {
    const referral = await prisma.referral.findUnique({
        where: { referred_id: userId },
    });
    if (!referral) return null;
    if (referral.status !== 'PENDING') return referral;

    // Only the *first* approved payment qualifies. Cheaper to count
    // approved payments than to fetch the first one by date.
    const approvedCount = await prisma.payment.count({
        where: { user_id: userId, status: 'APPROVED' },
    });
    if (approvedCount === 0) return referral;

    const updated = await prisma.referral.update({
        where: { id: referral.id },
        data: {
            status: 'CONFIRMED',
            first_payment_at: new Date(),
            reward_paid_at: new Date(),
        },
    });

    await addCredit(redis, referral.referrer_id, referral.reward_referrer_mxn);
    await awardXP(prisma, referral.referrer_id, 'REFERRAL_CONFIRMED').catch(() => {});

    await fireEvent('referral.reward_granted', {
        workspaceId: referral.workspace_id,
        referrerId: referral.referrer_id,
        referredId: referral.referred_id,
        referralId: referral.id,
        paymentId,
        reward_mxn: referral.reward_referrer_mxn,
    });

    return updated;
}

// ─────────────────────────────────────────────────────────────────
export default async function referralsRoutes(fastify) {
    const { prisma, redis } = fastify;

    // ── GET /referrals/me ──────────────────────────────────────
    fastify.get(
        '/referrals/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const code = await ensureReferralCode(prisma, redis, userId);

            const referrals = await prisma.referral.findMany({
                where: { referrer_id: userId },
                include: {
                    referred: {
                        select: { id: true, name: true, full_name: true, avatar_url: true },
                    },
                },
                orderBy: { created_at: 'desc' },
            });
            const totalCredit = await getReferrerCredit(redis, userId);

            return {
                code,
                reward_referrer_mxn: REWARD_REFERRER_MXN,
                reward_referred_discount: REFERRED_DISCOUNT_PCT_STORED,
                referrals,
                total_credit_mxn: totalCredit,
            };
        }
    );

    // ── POST /referrals/apply (public) ─────────────────────────
    // Called by the frontend BEFORE registration so it can preview
    // the discount. Returns only public info on the referrer.
    const applyBody = z.object({ code: z.string().trim().min(3).max(64) });
    fastify.post(
        '/referrals/apply',
        { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
        async (req, reply) => {
            const parsed = applyBody.safeParse(req.body);
            if (!parsed.success) {
                throw err('BAD_BODY', parsed.error.message, 400);
            }
            const referrer = await resolveReferrerByCode(prisma, redis, parsed.data.code);
            if (!referrer) {
                return reply.send({ valid: false });
            }
            return reply.send({
                valid: true,
                referrer_name: referrer.full_name || referrer.name,
                reward_referred_mxn: REFERRED_DISCOUNT_PCT_STORED,
                discount_type: 'PERCENT_FIRST_PAYMENT',
                discount_value: 10,
            });
        }
    );

    // ── GET /referrals/leaderboard ─────────────────────────────
    // Top referrers for the current calendar month, scoped to the
    // caller's workspace.
    fastify.get(
        '/referrals/leaderboard',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const me = await prisma.user.findUnique({
                where: { id: userId },
                select: { workspace_id: true },
            });
            if (!me) throw err('USER_NOT_FOUND', 'Usuario no encontrado', 404);

            const since = dayjs().startOf('month').toDate();
            const referrals = await prisma.referral.findMany({
                where: {
                    workspace_id: me.workspace_id,
                    status: { in: ['CONFIRMED', 'REWARDED'] },
                    created_at: { gte: since },
                },
                select: { referrer_id: true },
            });

            // Tally per-referrer.
            const counts = new Map();
            for (const r of referrals) {
                counts.set(r.referrer_id, (counts.get(r.referrer_id) || 0) + 1);
            }
            const topIds = [...counts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20);

            const users = await prisma.user.findMany({
                where: { id: { in: topIds.map(([id]) => id) } },
                select: { id: true, name: true, full_name: true, avatar_url: true },
            });
            const byId = new Map(users.map((u) => [u.id, u]));

            return {
                leaderboard: topIds.map(([id, count], idx) => ({
                    rank: idx + 1,
                    user: byId.get(id) || { id, name: 'Usuario' },
                    referrals_count: count,
                })),
            };
        }
    );

    // ── GET /admin/referrals ───────────────────────────────────
    fastify.get(
        '/admin/referrals',
        { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] },
        async (req) => {
            const querySchema = z.object({
                status: z.enum(['PENDING', 'CONFIRMED', 'REWARDED', 'EXPIRED']).optional(),
                page: z.coerce.number().int().min(1).default(1),
                limit: z.coerce.number().int().min(1).max(100).default(50),
            });
            const parsed = querySchema.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { status, page, limit } = parsed.data;
            const where = {};
            if (status) where.status = status;

            const [total, rows] = await Promise.all([
                prisma.referral.count({ where }),
                prisma.referral.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                    include: {
                        referrer: {
                            select: { id: true, name: true, email: true, phone: true },
                        },
                        referred: {
                            select: { id: true, name: true, email: true, phone: true },
                        },
                    },
                }),
            ]);
            return {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
                referrals: rows,
            };
        }
    );
}
