// ─────────────────────────────────────────────────────────────────
// Badge evaluator.
//
// checkAndAwardBadges(prisma, userId) runs AFTER any gamification-
// relevant action (check-in, purchase, level-up, review) and awards
// every badge whose criteria are met but which the user doesn't
// already own.
//
// Awarding = create UserBadge + add Badge.xp_reward to UserProgress
// + fire 'gamification.badge_unlocked'.
//
// Badge definitions are looked up dynamically from the `badges`
// table by `code`; seeding those rows lives in seed.js / admin flow.
// Missing rows are skipped gracefully — the UI only shows what
// exists.
// ─────────────────────────────────────────────────────────────────

import { fireEvent } from './events.js';

// Master list of built-in badge criteria. Keep codes in sync with
// whatever seed.js inserts into the `badges` table.
export const BADGE_RULES = [
    // First-timers
    { code: 'FIRST_CHECKIN', predicate: (ctx) => ctx.progress.total_checkins >= 1 },
    { code: 'FIRST_PURCHASE', predicate: (ctx) => ctx.purchases_count >= 1 },

    // Streaks
    { code: 'STREAK_7', predicate: (ctx) => ctx.progress.current_streak_days >= 7 },
    { code: 'STREAK_30', predicate: (ctx) => ctx.progress.current_streak_days >= 30 },
    { code: 'STREAK_90', predicate: (ctx) => ctx.progress.current_streak_days >= 90 },

    // Check-in volume
    { code: 'CHECKIN_100', predicate: (ctx) => ctx.progress.total_checkins >= 100 },
    { code: 'CHECKIN_500', predicate: (ctx) => ctx.progress.total_checkins >= 500 },

    // Levels
    { code: 'LEVEL_10', predicate: (ctx) => ctx.progress.level >= 10 },
    { code: 'LEVEL_25', predicate: (ctx) => ctx.progress.level >= 25 },
    { code: 'LEVEL_50', predicate: (ctx) => ctx.progress.level >= 50 },

    // Classes
    { code: 'CLASSES_10', predicate: (ctx) => ctx.progress.total_classes >= 10 },
];

// Describe progress toward a badge the user hasn't yet earned. Used
// by GET /gamification/me to render "X / Y" progress bars. Returns
// null for badges we don't know how to measure.
export function badgeProgress(code, ctx) {
    const p = ctx.progress;
    switch (code) {
        case 'FIRST_CHECKIN':
            return { current: p.total_checkins, target: 1 };
        case 'FIRST_PURCHASE':
            return { current: ctx.purchases_count || 0, target: 1 };
        case 'STREAK_7':
            return { current: p.current_streak_days, target: 7 };
        case 'STREAK_30':
            return { current: p.current_streak_days, target: 30 };
        case 'STREAK_90':
            return { current: p.current_streak_days, target: 90 };
        case 'CHECKIN_100':
            return { current: p.total_checkins, target: 100 };
        case 'CHECKIN_500':
            return { current: p.total_checkins, target: 500 };
        case 'LEVEL_10':
            return { current: p.level, target: 10 };
        case 'LEVEL_25':
            return { current: p.level, target: 25 };
        case 'LEVEL_50':
            return { current: p.level, target: 50 };
        case 'CLASSES_10':
            return { current: p.total_classes, target: 10 };
        default:
            return null;
    }
}

// Fetches everything we need to evaluate every rule in one shot so
// we don't N+1 the DB on every check-in.
async function buildContext(prisma, userId) {
    const progress = await prisma.userProgress.upsert({
        where: { user_id: userId },
        update: {},
        create: { user_id: userId },
    });
    const [purchasesCount, user] = await Promise.all([
        prisma.productPurchase.count({ where: { user_id: userId } }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { workspace_id: true },
        }),
    ]);
    return {
        progress,
        purchases_count: purchasesCount,
        workspace_id: user?.workspace_id || null,
    };
}

// Main entry point. Safe to call repeatedly — idempotent thanks to
// the (user_id, badge_id) unique index.
export async function checkAndAwardBadges(prisma, userId) {
    const ctx = await buildContext(prisma, userId);

    // Resolve codes → Badge rows once.
    const codes = BADGE_RULES.map((r) => r.code);
    const badges = await prisma.badge.findMany({ where: { code: { in: codes } } });
    const byCode = new Map(badges.map((b) => [b.code, b]));

    // Fetch which badges this user already has so we skip them.
    const owned = await prisma.userBadge.findMany({
        where: { user_id: userId },
        select: { badge_id: true },
    });
    const ownedIds = new Set(owned.map((ub) => ub.badge_id));

    const unlocked = [];
    for (const rule of BADGE_RULES) {
        const badge = byCode.get(rule.code);
        if (!badge) continue; // not seeded — skip silently
        if (ownedIds.has(badge.id)) continue;
        if (!rule.predicate(ctx)) continue;

        // Award. Use createMany with skipDuplicates so parallel callers
        // (e.g. two hooks racing) never trip the unique constraint.
        try {
            await prisma.userBadge.create({
                data: { user_id: userId, badge_id: badge.id },
            });
        } catch (e) {
            // Race: another caller inserted first → ignore.
            if (e?.code !== 'P2002') throw e;
            continue;
        }

        // Add the badge's XP reward to the user's progress. We bypass
        // awardXP's badge-check loop via skipBadgeCheck to prevent
        // recursion — earning a badge could push the user over a
        // LEVEL_* threshold which would queue another check, but
        // awardXP runs that check for us once it finishes.
        if (badge.xp_reward > 0) {
            const { awardXP } = await import('./xp.js');
            await awardXP(prisma, userId, 'BADGE_EARNED', {
                xp_override: badge.xp_reward,
                skipBadgeCheck: true,
                badge_code: badge.code,
            });
        }

        await fireEvent('gamification.badge_unlocked', {
            workspaceId: ctx.workspace_id,
            userId,
            badge_code: badge.code,
            badge_id: badge.id,
            xp_reward: badge.xp_reward,
        });

        unlocked.push(badge);
    }

    // After awarding XP from badges the level may have moved — run
    // one more pass for LEVEL_* thresholds. Bounded: we never loop
    // more than once because the rules are monotone.
    if (unlocked.some((b) => b.xp_reward > 0)) {
        const after = await buildContext(prisma, userId);
        for (const rule of BADGE_RULES) {
            const badge = byCode.get(rule.code);
            if (!badge) continue;
            const already = await prisma.userBadge.findFirst({
                where: { user_id: userId, badge_id: badge.id },
            });
            if (already) continue;
            if (!rule.predicate(after)) continue;
            try {
                await prisma.userBadge.create({
                    data: { user_id: userId, badge_id: badge.id },
                });
                unlocked.push(badge);
                await fireEvent('gamification.badge_unlocked', {
                    workspaceId: after.workspace_id,
                    userId,
                    badge_code: badge.code,
                    badge_id: badge.id,
                    xp_reward: badge.xp_reward,
                });
            } catch (e) {
                if (e?.code !== 'P2002') throw e;
            }
        }
    }

    return { unlocked };
}

export default { checkAndAwardBadges, BADGE_RULES, badgeProgress };
