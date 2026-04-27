// ─────────────────────────────────────────────────────────────
// Tenant guard — central multi-tenant authorization helpers.
//
// Every endpoint that touches a tenant-scoped resource MUST go through
// one of these helpers. Goal: make cross-tenant access impossible by
// accident.
//
// Design contract:
//   • Always uses findFirst (NOT findUnique) when tenant scoping applies,
//     so the workspace_id filter is part of the match — never a post-check.
//   • Never falls back to fastify.defaultWorkspaceId. If the session does
//     not carry a workspace, the request is rejected.
//   • Cross-tenant mismatches return 404 (not 403) to avoid leaking the
//     existence of resources in other workspaces.
//   • SUPERADMIN is workspace-scoped, same as ADMIN. Cross-tenant access
//     is gated through canAccessCrossTenant() — currently always false.
//     When a PLATFORM_OWNER role is introduced, flip the switch in one
//     place (canAccessCrossTenant) and audit every cross-tenant action.
// ─────────────────────────────────────────────────────────────
import { err } from './errors.js';

// Roles — keep in sync with the Prisma enum.
export const ROLES = Object.freeze({
    SUPERADMIN: 'SUPERADMIN',
    ADMIN: 'ADMIN',
    RECEPTIONIST: 'RECEPTIONIST',
    ATHLETE: 'ATHLETE',
});

export const ADMIN_ROLES = Object.freeze([ROLES.ADMIN, ROLES.SUPERADMIN]);
export const STAFF_ROLES = Object.freeze([ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.RECEPTIONIST]);

// ─── assertWorkspaceAccess(req) ──────────────────────────────
// Returns the actor's workspace_id, or throws 403 if missing.
// IMPORTANT: never falls back to fastify.defaultWorkspaceId. A session
// without a workspace_id is a broken token and must not be silently
// granted access to "the system workspace".
export function assertWorkspaceAccess(req) {
    const wsId = req.user?.workspace_id;
    if (!wsId) {
        throw err('NO_WORKSPACE', 'Sesión sin workspace asignado', 403);
    }
    return wsId;
}

// ─── loadInWorkspace(prisma, model, where, workspaceId, options) ──
// Generic tenant-scoped lookup. Always uses findFirst with workspace_id
// merged into the where clause. Returns the row or null. Throws if the
// model does not exist on the Prisma client (catches typos early).
export async function loadInWorkspace(prisma, model, where, workspaceId, options = {}) {
    if (!workspaceId) {
        throw err('NO_WORKSPACE', 'workspaceId es requerido', 500);
    }
    const delegate = prisma[model];
    if (!delegate || typeof delegate.findFirst !== 'function') {
        throw err('BAD_MODEL', `Modelo Prisma '${model}' no existe`, 500);
    }
    return delegate.findFirst({
        where: { ...where, workspace_id: workspaceId },
        ...options,
    });
}

// ─── requireSameWorkspace(prisma, model, id, workspaceId, options) ──
// Asserts the resource exists AND belongs to the actor's workspace.
// Throws NOT_FOUND on miss (hides existence from other tenants).
// Returns the row.
//
// Use this when you NEED the resource to act on it (PATCH, DELETE, ...).
export async function requireSameWorkspace(prisma, model, id, workspaceId, options = {}) {
    const row = await loadInWorkspace(prisma, model, { id }, workspaceId, options);
    if (!row) {
        throw err('NOT_FOUND', 'Recurso no encontrado', 404);
    }
    return row;
}

// ─── assertOwnerOrWorkspaceRole(req, resource, allowedRoles?) ──
// Authorization check for resources that have BOTH user_id and workspace_id
// (Payment, BodyMeasurement, ProductPurchase, ...). Two paths:
//
//   1. Owner path: req.user.sub === resource.user_id ⇒ allowed.
//   2. Staff path: req.user.role in allowedRoles AND
//                  resource.workspace_id === req.user.workspace_id ⇒ allowed.
//
// Anything else throws:
//   • 401 if session is malformed
//   • 404 if resource is in a different workspace (hides existence)
//   • 403 if role is not in allowedRoles
//
// Returns 'owner' or 'staff' so callers can branch on the access mode
// (e.g., for audit logging).
export function assertOwnerOrWorkspaceRole(req, resource, allowedRoles = ADMIN_ROLES) {
    const actorId = req.user?.sub || req.user?.id;
    const actorRole = req.user?.role;
    const actorWorkspace = req.user?.workspace_id;

    if (!actorId || !actorRole || !actorWorkspace) {
        throw err('UNAUTHORIZED', 'Sesión inválida', 401);
    }
    if (!resource) {
        throw err('NOT_FOUND', 'Recurso no encontrado', 404);
    }

    // Owner path. user_id implies the row's workspace must equal that user's
    // workspace, which by invariant equals actor's workspace when they own it.
    if (resource.user_id && resource.user_id === actorId) {
        return 'owner';
    }

    // Staff path.
    const allowed = new Set(allowedRoles);
    if (!allowed.has(actorRole)) {
        throw err('FORBIDDEN', 'No autorizado', 403);
    }
    // Cross-tenant: hide existence.
    if (resource.workspace_id && resource.workspace_id !== actorWorkspace) {
        throw err('NOT_FOUND', 'Recurso no encontrado', 404);
    }
    return 'staff';
}

// ─── canAccessCrossTenant(role) ──────────────────────────────
// Single switch for cross-tenant access. Currently always false:
// SUPERADMIN is per-workspace, just like ADMIN.
//
// When a PLATFORM_OWNER role is introduced (operating across all
// workspaces — billing, support, fraud reviews), change ONLY this
// function. Every consumer is forced to call it explicitly, making
// cross-tenant access easy to audit grep-wise:
//
//     grep -rn "canAccessCrossTenant" apps/api/src
//
// Important: even when this returns true for a future role, every
// cross-tenant access MUST be wrapped in an audit log entry by the
// caller. The guard does not log on its own — keeping it pure.
export function canAccessCrossTenant(_role) {
    return false;
}

// ─── ensureUserInWorkspace(prisma, userId, workspaceId) ──────
// Convenience: assert that a user_id parameter (e.g., :userId path
// segment) belongs to the actor's workspace before touching their
// data. Throws NOT_FOUND on mismatch. Returns the user row (minimal
// projection — id + workspace_id) so callers can chain.
export async function ensureUserInWorkspace(prisma, userId, workspaceId) {
    if (!userId) throw err('BAD_PARAM', 'userId requerido', 400);
    const row = await prisma.user.findFirst({
        where: { id: userId, workspace_id: workspaceId },
        select: { id: true, workspace_id: true },
    });
    if (!row) {
        throw err('NOT_FOUND', 'Usuario no encontrado', 404);
    }
    return row;
}
