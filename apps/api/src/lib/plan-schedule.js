// ─────────────────────────────────────────────────────────────────
// Per-plan gym access schedule.
//
// STARTER → split shift morning + evening, no weekends.
// PRO     → all weekdays 06-22, Saturday morning.
// ELITE   → 24/7, no restrictions.
//
// The check-in track imports `isWithinPlanHours(plan, date?)` to
// decide whether to accept or reject a QR scan. A `nextWindow()`
// helper is provided so the frontend can show "Tu gym abre en …".
//
// Windows are stored in the gym's local timezone. We hard-code
// America/Mexico_City — this monorepo is single-region.
// ─────────────────────────────────────────────────────────────────

const GYM_TZ = process.env.GYM_TIMEZONE || 'America/Mexico_City';

// Day-of-week keys used in PLAN_SCHEDULES. Sunday = 0.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const PLAN_SCHEDULES = {
    STARTER: {
        mon: [{ start: '06:00', end: '10:00' }, { start: '19:00', end: '22:00' }],
        tue: [{ start: '06:00', end: '10:00' }, { start: '19:00', end: '22:00' }],
        wed: [{ start: '06:00', end: '10:00' }, { start: '19:00', end: '22:00' }],
        thu: [{ start: '06:00', end: '10:00' }, { start: '19:00', end: '22:00' }],
        fri: [{ start: '06:00', end: '10:00' }, { start: '19:00', end: '22:00' }],
        sat: [],
        sun: [],
    },
    PRO: {
        mon: [{ start: '06:00', end: '22:00' }],
        tue: [{ start: '06:00', end: '22:00' }],
        wed: [{ start: '06:00', end: '22:00' }],
        thu: [{ start: '06:00', end: '22:00' }],
        fri: [{ start: '06:00', end: '22:00' }],
        sat: [{ start: '07:00', end: '14:00' }],
        sun: [],
    },
    ELITE: 'ALL',
};

// Extracts (hour, minute, dayKey) from `date` in the gym timezone.
// Uses Intl so we don't need a tz library here.
function localPartsFor(date) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: GYM_TZ,
        hour12: false,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const weekday = get('weekday') || 'Mon';
    // Intl returns "Mon", "Tue", etc → lowercase 3-letter already
    // matches DAY_KEYS after .toLowerCase().
    const dayKey = weekday.slice(0, 3).toLowerCase();
    const hour = Number(get('hour') || 0);
    const minute = Number(get('minute') || 0);
    return { dayKey, hour, minute };
}

function hhmmToMin(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

// Public: does this plan allow the gym at `date` (default: now)?
export function isWithinPlanHours(plan, date = new Date()) {
    const schedule = PLAN_SCHEDULES[plan];
    if (!schedule) return false;
    if (schedule === 'ALL') return true;

    const { dayKey, hour, minute } = localPartsFor(date);
    const windows = schedule[dayKey] || [];
    const nowMin = hour * 60 + minute;
    return windows.some((w) => {
        const startMin = hhmmToMin(w.start);
        const endMin = hhmmToMin(w.end);
        return nowMin >= startMin && nowMin < endMin;
    });
}

// Public: when's the next allowed window starting from `date`?
// Returns null for ELITE (always open) or if no window exists in the
// next 7 days. Used by the UI to say "Tu gym abre en 3h".
export function nextAllowedWindow(plan, date = new Date()) {
    const schedule = PLAN_SCHEDULES[plan];
    if (!schedule) return null;
    if (schedule === 'ALL') return null;

    const { dayKey, hour, minute } = localPartsFor(date);
    const nowMin = hour * 60 + minute;
    const startIdx = DAY_KEYS.indexOf(dayKey);

    for (let offset = 0; offset < 7; offset += 1) {
        const probeDay = DAY_KEYS[(startIdx + offset) % 7];
        const windows = schedule[probeDay] || [];
        for (const w of windows) {
            const startMin = hhmmToMin(w.start);
            if (offset === 0 && startMin <= nowMin) continue;
            return {
                day: probeDay,
                day_offset: offset,
                start: w.start,
                end: w.end,
                minutes_until: offset === 0
                    ? startMin - nowMin
                    : (24 - hour) * 60 - minute + (offset - 1) * 24 * 60 + startMin,
            };
        }
    }
    return null;
}

export default {
    PLAN_SCHEDULES,
    isWithinPlanHours,
    nextAllowedWindow,
};
