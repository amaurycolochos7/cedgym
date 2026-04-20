// ─────────────────────────────────────────────────────────────────
// Admin: operational reports with CSV export.
//
//   GET /admin/reports/active-members
//   GET /admin/reports/inactive             (no check-in in N days)
//   GET /admin/reports/birthdays            (this month)
// ─────────────────────────────────────────────────────────────────
import dayjs from 'dayjs';

function toCsv(rows, columns) {
  const header = columns.map((c) => c.header).join(',');
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = typeof c.accessor === 'function' ? c.accessor(r) : r[c.accessor];
          const s = v == null ? '' : String(v);
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\n');
  return `${header}\n${body}`;
}

function respondCsv(reply, filename, rows, columns) {
  reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="${filename}.csv"`);
  return toCsv(rows, columns);
}

export default async function adminReportsRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] };

  fastify.get('/admin/reports/active-members', guard, async (req, reply) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    const items = await fastify.prisma.user.findMany({
      where: {
        workspace_id: workspaceId,
        status: 'ACTIVE',
        role: 'ATHLETE',
        membership: { status: 'ACTIVE' },
      },
      include: { membership: true },
      orderBy: { created_at: 'desc' },
    });

    const format = req.query?.format;
    if (format === 'csv') {
      return respondCsv(reply, 'active-members', items, [
        { header: 'Nombre', accessor: 'name' },
        { header: 'Email', accessor: 'email' },
        { header: 'Teléfono', accessor: 'phone' },
        { header: 'Plan', accessor: (r) => r.membership?.plan },
        { header: 'Vence', accessor: (r) => r.membership?.expires_at?.toISOString?.().slice(0, 10) },
      ]);
    }
    return { items: items.map(({ password_hash, ...u }) => u), total: items.length };
  });

  fastify.get('/admin/reports/inactive', guard, async (req, reply) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    const days = Number(req.query?.days || 30);
    const cutoff = dayjs().subtract(days, 'day').toDate();

    const users = await fastify.prisma.user.findMany({
      where: {
        workspace_id: workspaceId,
        role: 'ATHLETE',
        status: 'ACTIVE',
        check_ins: { none: { scanned_at: { gte: cutoff } } },
      },
      include: { membership: true },
      take: 500,
    });

    const format = req.query?.format;
    if (format === 'csv') {
      return respondCsv(reply, 'inactive-members', users, [
        { header: 'Nombre', accessor: 'name' },
        { header: 'Teléfono', accessor: 'phone' },
        { header: 'Plan', accessor: (r) => r.membership?.plan ?? 'Sin plan' },
      ]);
    }
    return { items: users.map(({ password_hash, ...u }) => u), total: users.length, days };
  });

  fastify.get('/admin/reports/birthdays', guard, async (req, reply) => {
    const workspaceId = req.user?.workspace_id ?? fastify.defaultWorkspaceId;
    const month = Number(req.query?.month || dayjs().month() + 1); // 1-12

    // Raw query on month of birth_date (Postgres EXTRACT).
    const users = await fastify.prisma.$queryRawUnsafe(
      `SELECT id, name, email, phone, birth_date
       FROM users
       WHERE workspace_id = $1 AND role = 'ATHLETE'
         AND birth_date IS NOT NULL
         AND EXTRACT(MONTH FROM birth_date) = $2
       ORDER BY EXTRACT(DAY FROM birth_date) ASC`,
      workspaceId,
      month
    );

    const format = req.query?.format;
    if (format === 'csv') {
      return respondCsv(reply, 'birthdays', users, [
        { header: 'Nombre', accessor: 'name' },
        { header: 'Teléfono', accessor: 'phone' },
        { header: 'Día', accessor: (r) => r.birth_date ? new Date(r.birth_date).getDate() : '' },
      ]);
    }
    return { items: users, total: users.length, month };
  });
}
