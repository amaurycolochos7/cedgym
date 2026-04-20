// ─────────────────────────────────────────────────────────────────
// Streak tracker for daily check-ins.
//
// Rules (per spec):
//   • Called once per check-in.
//   • If user already checked in today → no-op (idempotent).
//   • If last check-in was yesterday → current_streak_days += 1.
//   • Tolerance of 1 rest day: if last check-in was 2 days ago →
//     streak stays (but is NOT incremented today).
//   • If last check-in was ≥ 3 days ago → streak resets to 1.
//   • First-ever check-in → streak = 1.
//   • longest_streak_days updates whenever current exceeds it.
//
// Returns { current_streak_days, longest_streak_days, is_new_day,
//           incremented }.
//
// All date comparisons happen in UTC-day-boundaries via dayjs so DST
// doesn't corrupt counts. Timezone nuance: CED-GYM is a single-region
// business (Mexico), but we still normalize to UTC days — all billing
// and streaks use UTC-midnight boundaries for consistency with the
// Membership.expires_at field.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';

// Internal: number of whole UTC days between two Dates (a is earlier).
function dayDiff(a, b) {
    const dayA = dayjs(a).startOf('day');
    const dayB = dayjs(b).startOf('day');
    return dayB.diff(dayA, 'day');
}

export async function updateStreakOnCheckin(prisma, userId, now = new Date()) {
    // Upsert ensures UserProgress exists.
    const progress = await prisma.userProgress.upsert({
        where: { user_id: userId },
        update: {},
        create: { user_id: userId },
    });

    const last = progress.last_checkin_date;
    let current = progress.current_streak_days || 0;
    let longest = progress.longest_streak_days || 0;
    let incremented = false;
    let isNewDay = true;

    if (!last) {
        // First-ever check-in.
        current = 1;
        incremented = true;
    } else {
        const gap = dayDiff(last, now);
        if (gap <= 0) {
            // Same UTC day → no-op. Do NOT update last_checkin_date.
            isNewDay = false;
            incremented = false;
        } else if (gap === 1) {
            // Consecutive day → increment.
            current = current + 1;
            incremented = true;
        } else if (gap === 2) {
            // Tolerance: skipped one day but still within grace window.
            // Keep streak as-is; don't bump.
            incremented = false;
        } else {
            // Gap ≥ 3 → reset to 1 (today counts as the new day-1).
            current = 1;
            incremented = true;
        }
    }

    if (current > longest) longest = current;

    // Only write last_checkin_date when we're on a new UTC day.
    const updated = await prisma.userProgress.update({
        where: { user_id: userId },
        data: {
            current_streak_days: current,
            longest_streak_days: longest,
            ...(isNewDay ? { last_checkin_date: now } : {}),
        },
    });

    return {
        current_streak_days: updated.current_streak_days,
        longest_streak_days: updated.longest_streak_days,
        is_new_day: isNewDay,
        incremented,
    };
}

export default { updateStreakOnCheckin };
