// ─────────────────────────────────────────────────────────────
// Audit log helper — best-effort (never throws). Every sensitive
// auth action should call `audit(fastify, { ... })`. Writes are
// fire-and-forget: if the DB is down we log and move on, since
// failing the user's request because an audit row couldn't land
// is worse than missing one audit row.
// ─────────────────────────────────────────────────────────────

export async function audit(fastify, {
    workspace_id = null,
    actor_id = null,
    action,
    target_type = null,
    target_id = null,
    metadata = null,
    ip_address = null,
    user_agent = null,
}) {
    try {
        await fastify.prisma.auditLog.create({
            data: {
                workspace_id: workspace_id || fastify.defaultWorkspaceId || 'system',
                actor_id,
                action,
                target_type,
                target_id,
                metadata,
                ip_address,
                user_agent,
            },
        });
    } catch (e) {
        fastify.log.warn({ err: e, action }, '[audit] insert failed');
    }
}

// Pulls IP + UA straight off a Fastify request.
export function auditCtx(request) {
    return {
        ip_address: request.ip || request.headers['x-forwarded-for'] || null,
        user_agent: request.headers['user-agent'] || null,
    };
}
