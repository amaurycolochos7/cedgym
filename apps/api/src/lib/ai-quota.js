// ─────────────────────────────────────────────────────────────────
// AI quota enforcement per membership plan.
//
// Policy (per 30-day sub-period anchored to membership.starts_at):
//   STARTER  → 1 rutina / 0 planes alimenticios
//   PRO      → ∞ rutinas / 1 plan alimenticio
//   ÉLITE    → ∞ rutinas / ∞ planes alimenticios
//
// A user without an ACTIVE membership cannot generate anything.
// ─────────────────────────────────────────────────────────────────

import { err } from './errors.js';
import { getPlanByCode } from './memberships.js';

const DAY_MS = 86_400_000;

const ACTIVE_STATUSES = new Set(['ACTIVE', 'TRIAL']);

// Compute the start of the current 30-day sub-period within the
// membership's billing cycle. For monthly plans this equals
// `starts_at`. For quarterly/annual it walks forward in 30-day
// chunks until it covers "now".
function currentPeriodStart(membership, now = new Date()) {
    const start = new Date(membership.starts_at).getTime();
    const daysSince = Math.floor((now.getTime() - start) / DAY_MS);
    const periodsElapsed = Math.max(0, Math.floor(daysSince / 30));
    return new Date(start + periodsElapsed * 30 * DAY_MS);
}

function periodEnd(periodStart) {
    return new Date(periodStart.getTime() + 30 * DAY_MS);
}

function daysRemainingInPeriod(periodStart, now = new Date()) {
    const end = periodEnd(periodStart);
    const diff = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
    return diff > 0 ? diff : 0;
}

// Returns the active membership row or null. Keeping the shape thin
// on purpose — callers only need plan + starts_at + status.
async function loadActiveMembership(prisma, userId) {
    const m = await prisma.membership.findUnique({
        where: { user_id: userId },
        select: {
            id: true,
            plan: true,
            status: true,
            starts_at: true,
            expires_at: true,
        },
    });
    if (!m) return null;
    if (!ACTIVE_STATUSES.has(m.status)) return null;
    if (m.expires_at && new Date(m.expires_at).getTime() < Date.now()) return null;
    return m;
}

// Counts successful AI-generated rows in the current period.
async function countInPeriod(prisma, { userId, kind, periodStart }) {
    if (kind === 'ROUTINE') {
        return prisma.routine.count({
            where: {
                user_id: userId,
                source: 'AI_GENERATED',
                created_at: { gte: periodStart },
            },
        });
    }
    if (kind === 'MEAL_PLAN') {
        return prisma.mealPlan.count({
            where: {
                user_id: userId,
                source: 'AI_GENERATED',
                created_at: { gte: periodStart },
            },
        });
    }
    throw new Error(`Unknown quota kind: ${kind}`);
}

function limitFor(plan, kind) {
    if (!plan) return 0;
    if (kind === 'ROUTINE') return plan.ai_routines_per_month ?? null;
    if (kind === 'MEAL_PLAN') return plan.ai_meal_plans_per_month ?? null;
    return 0;
}

// Returns a summary of the user's AI quota for both kinds.
// Shape:
//   {
//     plan: 'STARTER' | 'PRO' | 'ELITE' | null,
//     has_active_membership: boolean,
//     period_ends_at: ISO | null,
//     days_until_renewal: number,
//     routine:    { used, limit, allowed, unlimited },
//     meal_plan:  { used, limit, allowed, unlimited },
//   }
export async function getUserAIQuota(prisma, userId) {
    const membership = await loadActiveMembership(prisma, userId);
    if (!membership) {
        return {
            plan: null,
            has_active_membership: false,
            period_ends_at: null,
            days_until_renewal: 0,
            routine: { used: 0, limit: 0, allowed: false, unlimited: false },
            meal_plan: { used: 0, limit: 0, allowed: false, unlimited: false },
        };
    }

    const plan = getPlanByCode(membership.plan);
    const periodStart = currentPeriodStart(membership);
    const [routinesUsed, mealsUsed] = await Promise.all([
        countInPeriod(prisma, { userId, kind: 'ROUTINE', periodStart }),
        countInPeriod(prisma, { userId, kind: 'MEAL_PLAN', periodStart }),
    ]);

    const routineLimit = limitFor(plan, 'ROUTINE');
    const mealLimit = limitFor(plan, 'MEAL_PLAN');

    return {
        plan: membership.plan,
        has_active_membership: true,
        period_ends_at: periodEnd(periodStart).toISOString(),
        days_until_renewal: daysRemainingInPeriod(periodStart),
        routine: {
            used: routinesUsed,
            limit: routineLimit,
            allowed: routineLimit === null ? true : routinesUsed < routineLimit,
            unlimited: routineLimit === null,
        },
        meal_plan: {
            used: mealsUsed,
            limit: mealLimit,
            allowed: mealLimit === null ? true : mealsUsed < mealLimit,
            unlimited: mealLimit === null,
        },
    };
}

// Throws a structured error if the user cannot generate `kind`.
// Called at the top of POST /ai/routines/generate and /ai/meal-plans/generate.
export async function assertAIQuota(prisma, userId, kind) {
    const quota = await getUserAIQuota(prisma, userId);

    if (!quota.has_active_membership) {
        throw err(
            'MEMBERSHIP_REQUIRED',
            'Necesitas una membresía activa para generar con IA.',
            403,
            { kind }
        );
    }

    const slot = kind === 'ROUTINE' ? quota.routine : quota.meal_plan;

    if (slot.limit === 0) {
        throw err(
            'FEATURE_NOT_IN_PLAN',
            kind === 'ROUTINE'
                ? 'Tu plan no incluye generación de rutinas con IA.'
                : 'Tu plan no incluye plan alimenticio con IA. Mejora a PRO o Élite.',
            403,
            { kind, plan: quota.plan }
        );
    }

    if (!slot.allowed) {
        throw err(
            'QUOTA_EXCEEDED',
            kind === 'ROUTINE'
                ? `Ya usaste tus ${slot.limit} rutina(s) de este periodo. Se renueva en ${quota.days_until_renewal} día(s).`
                : `Ya usaste tus ${slot.limit} plan(es) alimenticio(s) de este periodo. Se renueva en ${quota.days_until_renewal} día(s).`,
            403,
            {
                kind,
                plan: quota.plan,
                used: slot.used,
                limit: slot.limit,
                days_until_renewal: quota.days_until_renewal,
            }
        );
    }

    return quota;
}
