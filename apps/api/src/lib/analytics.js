// ─────────────────────────────────────────────────────────────────
// Analytics helpers for the admin dashboard.
//
// Every function takes a workspaceId + options and returns a plain
// JSON payload — the route layer just caches + returns. We lean on
// raw SQL (`$queryRaw`) for GROUP BY / date_trunc because Prisma's
// aggregation API doesn't support them on Postgres without Preview
// features, and the performance gap is real on 100k+ rows.
//
// Date handling:
//   - `from` / `to` are Date objects or ISO strings; we normalize.
//   - Output timestamps come back as ISO strings.
//   - All queries use Postgres `date_trunc` with the workspace's
//     server timezone (assumed UTC in docker-compose).
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';

// ──────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────
function toDate(d, fallback) {
    if (!d) return fallback;
    if (d instanceof Date) return d;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? fallback : parsed;
}

function periodRange(period) {
    // period: '7d' | '30d' | '90d' | '3m' | '6m' | '12m' | 'mtd'
    const now = dayjs();
    switch (period) {
        case '7d':  return { from: now.subtract(7,  'day').toDate(),  to: now.toDate() };
        case '30d': return { from: now.subtract(30, 'day').toDate(),  to: now.toDate() };
        case '90d': return { from: now.subtract(90, 'day').toDate(),  to: now.toDate() };
        case '3m':  return { from: now.subtract(3,  'month').toDate(), to: now.toDate() };
        case '6m':  return { from: now.subtract(6,  'month').toDate(), to: now.toDate() };
        case '12m':
        case '1y':  return { from: now.subtract(12, 'month').toDate(), to: now.toDate() };
        case 'mtd': return { from: now.startOf('month').toDate(),       to: now.toDate() };
        default:    return { from: now.subtract(30, 'day').toDate(),   to: now.toDate() };
    }
}

// ──────────────────────────────────────────────────────────────
// Revenue by period (day / week / month)
// Returns APPROVED payments only.
// ──────────────────────────────────────────────────────────────
export async function revenueByPeriod(workspaceId, { from, to, groupBy = 'day' } = {}) {
    const fromDate = toDate(from, dayjs().subtract(30, 'day').toDate());
    const toDate_  = toDate(to,   new Date());
    const unit = ['day', 'week', 'month'].includes(groupBy) ? groupBy : 'day';

    const rows = await prisma.$queryRawUnsafe(
        `
        SELECT
          date_trunc($1, paid_at) AS bucket,
          SUM(amount)::bigint     AS revenue,
          COUNT(*)::bigint        AS payment_count
        FROM payments
        WHERE workspace_id = $2
          AND status = 'APPROVED'
          AND paid_at IS NOT NULL
          AND paid_at >= $3
          AND paid_at <  $4
        GROUP BY bucket
        ORDER BY bucket ASC
        `,
        unit, workspaceId, fromDate, toDate_
    );

    return {
        from: fromDate.toISOString(),
        to:   toDate_.toISOString(),
        group_by: unit,
        series: rows.map((r) => ({
            bucket: r.bucket instanceof Date ? r.bucket.toISOString() : r.bucket,
            revenue_mxn: Number(r.revenue || 0),
            payment_count: Number(r.payment_count || 0),
        })),
        total_revenue_mxn: rows.reduce((s, r) => s + Number(r.revenue || 0), 0),
    };
}

// ──────────────────────────────────────────────────────────────
// Retention: renewed vs expired in window.
//
// Definition:
//   - A membership's "renewal" = at least one APPROVED MEMBERSHIP
//     payment with reference ~ ':RENEW' within the window.
//   - Expired-in-window = membership.expires_at inside [from,to].
//   - Rate = renewals / expirations.
// ──────────────────────────────────────────────────────────────
export async function membershipRetention(workspaceId, period = '6m') {
    const { from, to } = periodRange(period);

    const [expiredRows, renewedRows] = await Promise.all([
        prisma.$queryRawUnsafe(
            `
            SELECT COUNT(*)::bigint AS n
            FROM memberships
            WHERE workspace_id = $1
              AND expires_at >= $2
              AND expires_at <  $3
            `,
            workspaceId, from, to
        ),
        prisma.$queryRawUnsafe(
            `
            SELECT COUNT(DISTINCT user_id)::bigint AS n
            FROM payments
            WHERE workspace_id = $1
              AND type = 'MEMBERSHIP'
              AND status = 'APPROVED'
              AND (reference LIKE '%:RENEW' OR reference ILIKE '%RENEW%')
              AND paid_at >= $2
              AND paid_at <  $3
            `,
            workspaceId, from, to
        ),
    ]);

    const expired = Number(expiredRows[0]?.n || 0);
    const renewed = Number(renewedRows[0]?.n || 0);
    const rate = expired === 0 ? 0 : renewed / expired;

    return {
        period,
        from: from.toISOString(),
        to: to.toISOString(),
        expired_count: expired,
        renewed_count: renewed,
        retention_rate: Number(rate.toFixed(4)),
    };
}

// ──────────────────────────────────────────────────────────────
// Heatmap day-of-week × hour-of-day.
// Returns a 7×24 matrix (rows = Monday..Sunday in ISO, 1..7).
// Postgres `dow` is 0=Sunday..6=Saturday — we shift to 1..7.
// ──────────────────────────────────────────────────────────────
export async function checkinsHeatmap(workspaceId, { days = 30 } = {}) {
    const since = dayjs().subtract(days, 'day').toDate();

    const rows = await prisma.$queryRawUnsafe(
        `
        SELECT
          ((EXTRACT(DOW FROM scanned_at)::int + 6) % 7) + 1 AS dow,  -- 1=Mon..7=Sun
          EXTRACT(HOUR FROM scanned_at)::int              AS hour,
          COUNT(*)::bigint                                 AS n
        FROM check_ins
        WHERE workspace_id = $1
          AND scanned_at >= $2
        GROUP BY dow, hour
        ORDER BY dow, hour
        `,
        workspaceId, since
    );

    // Build the dense 7×24 matrix (fill zeroes for empty slots).
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of rows) {
        const d = Number(r.dow) - 1;
        const h = Number(r.hour);
        if (d >= 0 && d < 7 && h >= 0 && h < 24) {
            matrix[d][h] = Number(r.n || 0);
        }
    }
    return {
        days,
        since: since.toISOString(),
        matrix,
        total: rows.reduce((s, r) => s + Number(r.n || 0), 0),
    };
}

// ──────────────────────────────────────────────────────────────
// Top sports by check-ins.
// We join check_ins → memberships (membership.sport) to get the
// "sport the user is training for". Users without a sport are
// grouped under 'UNSET'.
// ──────────────────────────────────────────────────────────────
export async function topSports(workspaceId, period = '30d') {
    const { from, to } = periodRange(period);

    const rows = await prisma.$queryRawUnsafe(
        `
        SELECT
          COALESCE(m.sport::text, 'UNSET') AS sport,
          COUNT(*)::bigint                 AS check_ins
        FROM check_ins c
        LEFT JOIN memberships m ON m.user_id = c.user_id
        WHERE c.workspace_id = $1
          AND c.scanned_at >= $2
          AND c.scanned_at <  $3
        GROUP BY sport
        ORDER BY check_ins DESC
        LIMIT 10
        `,
        workspaceId, from, to
    );

    return {
        period,
        from: from.toISOString(),
        to:   to.toISOString(),
        sports: rows.map((r) => ({
            sport: r.sport,
            check_ins: Number(r.check_ins || 0),
        })),
    };
}

// ──────────────────────────────────────────────────────────────
// Top coaches — ranked by unique athletes that bought a product
// they authored in the period (since we no longer track classes).
// ──────────────────────────────────────────────────────────────
export async function topCoaches(workspaceId, period = '30d') {
    const { from, to } = periodRange(period);

    const rows = await prisma.$queryRawUnsafe(
        `
        SELECT
          p.author_id                       AS trainer_id,
          COUNT(pp.id)::bigint              AS attendance,
          COUNT(DISTINCT pp.user_id)::bigint AS unique_members
        FROM product_purchases pp
        JOIN digital_products p ON p.id = pp.product_id
        WHERE p.workspace_id = $1
          AND pp.access_granted_at >= $2
          AND pp.access_granted_at <  $3
        GROUP BY p.author_id
        ORDER BY attendance DESC
        LIMIT 10
        `,
        workspaceId, from, to
    );

    if (rows.length === 0) {
        return { period, from: from.toISOString(), to: to.toISOString(), coaches: [] };
    }

    // Hydrate trainer names.
    const ids = rows.map((r) => r.trainer_id).filter(Boolean);
    const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, full_name: true, avatar_url: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
        period,
        from: from.toISOString(),
        to:   to.toISOString(),
        coaches: rows.map((r) => ({
            trainer_id: r.trainer_id,
            name: byId.get(r.trainer_id)?.full_name || byId.get(r.trainer_id)?.name || 'Desconocido',
            avatar_url: byId.get(r.trainer_id)?.avatar_url || null,
            attendance: Number(r.attendance || 0),
            unique_members: Number(r.unique_members || 0),
        })),
    };
}

// ──────────────────────────────────────────────────────────────
// Churn prediction — users with < 60% of "expected" check-ins.
//
// Heuristic:
//   expected = 12 check-ins per 30 days for active members
//              (≈ 3× per week; tweak as needed per gym).
// Only considers members with ACTIVE memberships so we don't
// alert on people who already canceled.
// ──────────────────────────────────────────────────────────────
export async function churnPrediction(workspaceId, { days = 30, threshold = 0.6, expected = 12 } = {}) {
    const since = dayjs().subtract(days, 'day').toDate();
    const minExpected = Math.ceil(expected * threshold);

    const rows = await prisma.$queryRawUnsafe(
        `
        SELECT
          u.id                      AS user_id,
          u.name                    AS name,
          u.full_name               AS full_name,
          u.email                   AS email,
          u.phone                   AS phone,
          m.plan::text              AS plan,
          m.expires_at              AS expires_at,
          COALESCE(c.n, 0)::bigint  AS check_ins
        FROM users u
        JOIN memberships m ON m.user_id = u.id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS n
          FROM check_ins
          WHERE workspace_id = $1 AND scanned_at >= $2
          GROUP BY user_id
        ) c ON c.user_id = u.id
        WHERE u.workspace_id = $1
          AND m.status = 'ACTIVE'
          AND COALESCE(c.n, 0) < $3
        ORDER BY check_ins ASC, u.name ASC
        LIMIT 200
        `,
        workspaceId, since, minExpected
    );

    return {
        days,
        expected_checkins: expected,
        threshold,
        risk_count: rows.length,
        users: rows.map((r) => ({
            user_id: r.user_id,
            name: r.full_name || r.name,
            email: r.email,
            phone: r.phone,
            plan: r.plan,
            expires_at: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at,
            check_ins: Number(r.check_ins || 0),
            checkin_ratio: Number((Number(r.check_ins || 0) / expected).toFixed(2)),
        })),
    };
}

// ──────────────────────────────────────────────────────────────
// Active members snapshot — membership.status=ACTIVE and not expired.
// ──────────────────────────────────────────────────────────────
export async function activeMembersCount(workspaceId) {
    const now = new Date();
    const count = await prisma.membership.count({
        where: {
            workspace_id: workspaceId,
            status: 'ACTIVE',
            expires_at: { gt: now },
        },
    });
    return { active_members: count };
}

// ──────────────────────────────────────────────────────────────
// Convenience: the overview KPI bundle.
// ──────────────────────────────────────────────────────────────
export async function overviewKpis(workspaceId) {
    const now = dayjs();
    const startOfMonth = now.startOf('month').toDate();
    const startOfDay   = now.startOf('day').toDate();
    const in7          = now.add(7, 'day').toDate();
    const in30         = now.add(30, 'day').toDate();

    const [
        { active_members },
        mtdAgg,
        checkinsToday,
        newMembersMtd,
        expiring7,
        expiring30,
    ] = await Promise.all([
        activeMembersCount(workspaceId),
        prisma.payment.aggregate({
            where: {
                workspace_id: workspaceId,
                status: 'APPROVED',
                paid_at: { gte: startOfMonth },
            },
            _sum: { amount: true },
            _count: true,
        }),
        prisma.checkIn.count({
            where: { workspace_id: workspaceId, scanned_at: { gte: startOfDay } },
        }),
        prisma.user.count({
            where: { workspace_id: workspaceId, created_at: { gte: startOfMonth } },
        }),
        prisma.membership.count({
            where: {
                workspace_id: workspaceId,
                status: 'ACTIVE',
                expires_at: { gte: new Date(), lte: in7 },
            },
        }),
        prisma.membership.count({
            where: {
                workspace_id: workspaceId,
                status: 'ACTIVE',
                expires_at: { gte: new Date(), lte: in30 },
            },
        }),
    ]);

    return {
        active_members,
        total_revenue_mtd: mtdAgg._sum.amount || 0,
        payments_mtd: mtdAgg._count || 0,
        checkins_today: checkinsToday,
        new_members_mtd: newMembersMtd,
        expiring_7d: expiring7,
        expiring_30d: expiring30,
        generated_at: new Date().toISOString(),
    };
}

export default {
    revenueByPeriod,
    membershipRetention,
    checkinsHeatmap,
    topSports,
    topCoaches,
    churnPrediction,
    activeMembersCount,
    overviewKpis,
};
