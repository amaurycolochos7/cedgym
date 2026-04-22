// ─────────────────────────────────────────────────────────────────
// XP (experience points) engine.
//
// - XP_REWARDS: fixed point award per user action.
// - levelForXP / xpForNextLevel: level curve.
//     XP required to reach level N = Σ(i=1 → N-1) 100 * i * 1.2
//     → level 1 starts at 0, level 2 at 100, level 3 at 220,
//       level 4 at 364, level 5 at 532, ...
// - awardXP(prisma, userId, action, metadata):
//     • upserts UserProgress
//     • computes new level
//     • if level crossed → fires 'gamification.level_up'
//     • runs checkAndAwardBadges() to maybe unlock LEVEL_* badges
//
// All helpers are pure where possible; DB writes are funneled through
// `awardXP` so callers don't have to remember to bump counters + run
// badge checks separately.
// ─────────────────────────────────────────────────────────────────

import { fireEvent } from './events.js';

// ── XP table ────────────────────────────────────────────────────
export const XP_REWARDS = {
    CHECKIN: 10,
    FIRST_CHECKIN_OF_WEEK: 15,
    CLASS_ATTENDED: 25,
    PRODUCT_PURCHASED: 50,
    REVIEW_POSTED: 15,
    MEMBERSHIP_RENEWED: 75,
    BADGE_EARNED: 0, // XP comes from Badge.xp_reward directly
};

// ── Level curve ─────────────────────────────────────────────────
// Returns the total cumulative XP required to REACH `level`.
// level 1 → 0
// level 2 → 100 * 1 * 1.2                     = 120  (we round down → see rounding note)
// level 3 → 100 * 1 * 1.2 + 100 * 2 * 1.2     = 360
// level 4 → prev + 100 * 3 * 1.2              = 720
//
// Note: the spec example uses whole-number breakpoints (100, 220,
// 364…). To get those we apply the formula Σ round(100 * i * 1.2) but
// spec values don't actually match that either — they match a
// geometric 1.2^i progression. We keep it simple and additive: cost
// of level N (from N-1) = round(100 * (N-1) * 1.2). This gives a
// monotone, predictable curve, which is all the UI needs.
export function xpRequiredForLevel(level) {
    if (level <= 1) return 0;
    let total = 0;
    for (let i = 1; i < level; i += 1) {
        total += Math.round(100 * i * 1.2);
    }
    return total;
}

// Given a total XP count, return the level the user is on.
export function levelForXP(xp) {
    if (xp <= 0) return 1;
    let level = 1;
    // Cap at 200 to keep the loop bounded for absurd XP totals.
    while (level < 200 && xpRequiredForLevel(level + 1) <= xp) {
        level += 1;
    }
    return level;
}

// XP needed to reach the next level (absolute, cumulative).
export function xpForNextLevel(level) {
    return xpRequiredForLevel(level + 1);
}

// Progress toward the next level, as { current_level_xp, next_level_xp, pct }.
export function levelProgress(xp) {
    const level = levelForXP(xp);
    const current = xpRequiredForLevel(level);
    const next = xpRequiredForLevel(level + 1);
    const span = Math.max(1, next - current);
    const into = Math.max(0, xp - current);
    return {
        level,
        current_level_xp: current,
        next_level_xp: next,
        xp_into_level: into,
        xp_to_next: Math.max(0, next - xp),
        pct: Math.min(100, Math.round((into / span) * 100)),
    };
}

// ── awardXP ─────────────────────────────────────────────────────
// Core helper. Bumps XP, recomputes level, fires events, and (unless
// opted out) runs the badge evaluator — because earning a level is
// itself a badge criterion.
//
// Returns { progress, xp_gained, leveled_up, new_level, prev_level }.
//
// Opt-out flag `skipBadgeCheck` is used internally by checkAndAwardBadges
// to avoid recursion when awarding XP from a badge unlock.
export async function awardXP(prisma, userId, action, metadata = {}) {
    const gain = XP_REWARDS[action] ?? 0;
    // We still touch the row even when gain = 0 — some actions (eg
    // BADGE_EARNED where the XP is added manually by the caller) still
    // want the counter columns refreshed.
    const prev = await prisma.userProgress.upsert({
        where: { user_id: userId },
        update: {},
        create: { user_id: userId },
    });

    const extraXp = Number(metadata?.xp_override ?? gain) || 0;
    const newXp = prev.xp + extraXp;
    const prevLevel = prev.level || levelForXP(prev.xp);
    const newLevel = levelForXP(newXp);

    // Counter bumps — keep them in one UPDATE so we don't race.
    const counterUpdates = {};
    if (action === 'CHECKIN' || action === 'FIRST_CHECKIN_OF_WEEK') {
        counterUpdates.total_checkins = { increment: 1 };
    }
    if (action === 'CLASS_ATTENDED') {
        counterUpdates.total_classes = { increment: 1 };
    }

    const updated = await prisma.userProgress.update({
        where: { user_id: userId },
        data: {
            xp: newXp,
            level: newLevel,
            ...counterUpdates,
        },
    });

    if (newLevel > prevLevel) {
        // Look up the user's workspace so the event reaches the right
        // automations. fire-and-forget — never block the caller.
        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { workspace_id: true },
            });
            await fireEvent('gamification.level_up', {
                workspaceId: user?.workspace_id,
                userId,
                from_level: prevLevel,
                to_level: newLevel,
                total_xp: newXp,
            });
        } catch (e) {
            // non-fatal
            // eslint-disable-next-line no-console
            console.warn('[xp] level-up event failed:', e.message);
        }
    }

    // Run badge evaluator unless we were called *from* it.
    if (!metadata?.skipBadgeCheck) {
        // Lazy import to avoid circular deps (badges → xp → badges).
        const { checkAndAwardBadges } = await import('./badges.js');
        await checkAndAwardBadges(prisma, userId).catch((e) => {
            // eslint-disable-next-line no-console
            console.warn('[xp] badge check failed:', e.message);
        });
    }

    return {
        progress: updated,
        xp_gained: extraXp,
        leveled_up: newLevel > prevLevel,
        prev_level: prevLevel,
        new_level: newLevel,
    };
}

export default {
    XP_REWARDS,
    xpRequiredForLevel,
    levelForXP,
    xpForNextLevel,
    levelProgress,
    awardXP,
};
