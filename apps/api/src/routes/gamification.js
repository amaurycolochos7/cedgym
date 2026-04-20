// ─────────────────────────────────────────────────────────────────
// Gamification routes.
//
// Authenticated:
//   GET  /gamification/me
//   GET  /gamification/badges
//   GET  /gamification/leaderboard
//   POST /gamification/checkin-hook   (internal — wraps awardXP +
//                                       streak + badge eval)
//
// Also exports `onCheckinCompleted(prisma, userId)` so the checkins
// track can call the hook directly without HTTP overhead.
// ─────────────────────────────────────────────────────────────────

import { awardXP, levelProgress, XP_REWARDS } from '../lib/xp.js';
import { updateStreakOnCheckin } from '../lib/streak.js';
import { checkAndAwardBadges, BADGE_RULES, badgeProgress } from '../lib/badges.js';
import { err } from '../lib/errors.js';

// ── Shared hook ─────────────────────────────────────────────────
// The one place the "a user just checked in" side-effects live.
// Called from:
//   • POST /gamification/checkin-hook (when a different process
//     wants to trigger gamification without a full check-in row).
//   • Directly imported by routes/checkins.js (other track).
//
// Returns a summary the caller can inline into its own response.
export async function onCheckinCompleted(prisma, userId) {
    // 1. Weekly first check-in → bonus XP. We treat Monday as the
    //    start of the ISO week for consistency with the rest of the
    //    backend's weekly rollups.
    const startOfWeek = new Date();
    const day = startOfWeek.getDay(); // 0=Sun, 1=Mon
    const mondayOffset = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(startOfWeek.getDate() + mondayOffset);
    startOfWeek.setHours(0, 0, 0, 0);

    const checkinsThisWeek = await prisma.checkIn.count({
        where: { user_id: userId, scanned_at: { gte: startOfWeek } },
    });
    const isFirstOfWeek = checkinsThisWeek <= 1;

    // 2. Award XP (CHECKIN or FIRST_CHECKIN_OF_WEEK, not both).
    const xpAction = isFirstOfWeek ? 'FIRST_CHECKIN_OF_WEEK' : 'CHECKIN';
    const xpResult = await awardXP(prisma, userId, xpAction, {
        // Skip auto badge eval — we run it ourselves below after
        // the streak bump so STREAK_* badges see the new streak.
        skipBadgeCheck: true,
    });

    // 3. Streak math.
    const streakResult = await updateStreakOnCheckin(prisma, userId);

    // 4. Badge evaluator, now that totals + streak are current.
    const badgeResult = await checkAndAwardBadges(prisma, userId);

    return {
        xp: xpResult,
        streak: streakResult,
        badges_unlocked: badgeResult.unlocked.map((b) => b.code),
    };
}

// ─────────────────────────────────────────────────────────────────
export default async function gamificationRoutes(fastify) {
    const { prisma } = fastify;

    // ── GET /gamification/me ─────────────────────────────────
    fastify.get(
        '/gamification/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;

            const progress = await prisma.userProgress.upsert({
                where: { user_id: userId },
                update: {},
                create: { user_id: userId },
            });

            const earnedRows = await prisma.userBadge.findMany({
                where: { user_id: userId },
                include: { badge: true },
                orderBy: { earned_at: 'desc' },
            });
            const earnedIds = new Set(earnedRows.map((r) => r.badge_id));

            // Pre-load a context so we can compute progress against
            // the locked badges for the UI's progress bars.
            const purchasesCount = await prisma.productPurchase.count({
                where: { user_id: userId },
            });
            const ctx = { progress, purchases_count: purchasesCount };

            const allBadges = await prisma.badge.findMany({
                where: { code: { in: BADGE_RULES.map((r) => r.code) } },
            });

            const locked = [];
            for (const badge of allBadges) {
                if (earnedIds.has(badge.id)) continue;
                const progressBar = badgeProgress(badge.code, ctx);
                locked.push({
                    badge,
                    progress: progressBar,
                    pct: progressBar
                        ? Math.min(100, Math.round((progressBar.current / Math.max(1, progressBar.target)) * 100))
                        : 0,
                });
            }
            // Show the closest-to-unlocked locked badges first.
            locked.sort((a, b) => b.pct - a.pct);

            return {
                progress,
                level: levelProgress(progress.xp),
                earned: earnedRows.map((r) => ({
                    badge: r.badge,
                    earned_at: r.earned_at,
                })),
                next_badges: locked.slice(0, 10),
            };
        }
    );

    // ── GET /gamification/badges ─────────────────────────────
    fastify.get(
        '/gamification/badges',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const [allBadges, owned] = await Promise.all([
                prisma.badge.findMany({ orderBy: { rarity: 'asc' } }),
                prisma.userBadge.findMany({ where: { user_id: userId } }),
            ]);
            const ownedIds = new Set(owned.map((ub) => ub.badge_id));
            const earnedAtById = new Map(owned.map((ub) => [ub.badge_id, ub.earned_at]));
            return {
                badges: allBadges.map((b) => ({
                    ...b,
                    earned: ownedIds.has(b.id),
                    earned_at: earnedAtById.get(b.id) || null,
                })),
            };
        }
    );

    // ── GET /gamification/leaderboard ────────────────────────
    // Top 50 users by XP within the same workspace as the caller.
    // Also returns the caller's rank even if they're outside the
    // top 50.
    fastify.get(
        '/gamification/leaderboard',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const me = await prisma.user.findUnique({
                where: { id: userId },
                select: { workspace_id: true },
            });
            if (!me) throw err('USER_NOT_FOUND', 'Usuario no encontrado', 404);

            // Join progress → user to filter by workspace.
            // Prisma doesn't let us order UserProgress by a joined field
            // unless we fetch both, so we do two queries and stitch.
            const top = await prisma.userProgress.findMany({
                orderBy: { xp: 'desc' },
                take: 200, // over-fetch so we can filter by workspace
            });
            const userIds = top.map((p) => p.user_id);
            const users = await prisma.user.findMany({
                where: { id: { in: userIds }, workspace_id: me.workspace_id },
                select: { id: true, name: true, full_name: true, avatar_url: true },
            });
            const userMap = new Map(users.map((u) => [u.id, u]));

            const board = top
                .filter((p) => userMap.has(p.user_id))
                .slice(0, 50)
                .map((p, idx) => ({
                    rank: idx + 1,
                    user: userMap.get(p.user_id),
                    xp: p.xp,
                    level: p.level,
                    current_streak_days: p.current_streak_days,
                }));

            // Caller's global rank (within workspace).
            const mineProgress = await prisma.userProgress.findUnique({
                where: { user_id: userId },
            });
            let myRank = null;
            if (mineProgress) {
                // Count users in same workspace with more XP.
                const higherRows = await prisma.userProgress.findMany({
                    where: { xp: { gt: mineProgress.xp } },
                    select: { user_id: true },
                });
                const higherIds = higherRows.map((r) => r.user_id);
                let higherInWs = 0;
                if (higherIds.length) {
                    higherInWs = await prisma.user.count({
                        where: { id: { in: higherIds }, workspace_id: me.workspace_id },
                    });
                }
                myRank = higherInWs + 1;
            }

            return {
                leaderboard: board,
                my_rank: myRank,
                my_progress: mineProgress,
            };
        }
    );

    // ── POST /gamification/checkin-hook ─────────────────────
    // Internal. Mainly for manual/test triggering; the real
    // integration point is `onCheckinCompleted()` above, which
    // routes/checkins.js imports directly.
    fastify.post(
        '/gamification/checkin-hook',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const result = await onCheckinCompleted(prisma, userId);
            return { success: true, ...result };
        }
    );

    // Expose the XP table so the UI can show "You'll earn X for Y".
    fastify.get('/gamification/xp-rewards', async () => ({ rewards: XP_REWARDS }));
}
