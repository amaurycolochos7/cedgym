// ─────────────────────────────────────────────────────────────────
// Per-workspace KV settings — admin-editable runtime config.
//
// Backed by the `workspace_settings` table. Callers should go
// through this module so the set of valid keys stays discoverable
// in one place.
//
// Keys in use today:
//
//   • plan.overrides            → {
//       [code: 'STARTER'|'PRO'|'ELITE']: {
//         monthly_price_mxn?:   number,
//         quarterly_price_mxn?: number,
//         annual_price_mxn?:    number,
//         enabled?:             boolean,
//       }
//     }
//     Admin-configurable overrides that stack on top of the
//     in-code PLAN_CATALOG (lib/memberships.js). Anything left
//     null/undefined falls back to the catalog default.
//
//   • meal_plan_addon.price_mxn → integer. Overrides the
//     default $499 for the one-time meal-plan add-on.
//
// ─────────────────────────────────────────────────────────────────

export const SETTING_KEYS = Object.freeze({
    PLAN_OVERRIDES: 'plan.overrides',
    MEAL_PLAN_ADDON_PRICE: 'meal_plan_addon.price_mxn',
});

// Read a single setting. Returns `defaultValue` when the row is
// missing or the stored JSON is explicitly null. Callers pass in
// the default from their own domain (e.g. the hardcoded catalog
// price) so we never return an ambiguous null from here.
export async function getWorkspaceSetting(prisma, workspaceId, key, defaultValue = null) {
    if (!workspaceId || !key) return defaultValue;
    const row = await prisma.workspaceSetting.findUnique({
        where: { workspace_id_key: { workspace_id: workspaceId, key } },
    });
    if (!row) return defaultValue;
    // Prisma's Json column hands us the parsed value directly. A
    // row whose value is literal `null` shouldn't shadow the
    // default — callers can explicitly delete the row to reset.
    return row.value ?? defaultValue;
}

// Upsert. `value` must be a JSON-serialisable thing. `updatedBy`
// is optional (user id) for auditability — shows up in the
// workspace_settings row but we don't mirror into audit_logs
// from here (that's the caller's responsibility when it matters).
export async function setWorkspaceSetting(prisma, workspaceId, key, value, updatedBy = null) {
    if (!workspaceId || !key) {
        throw new Error('setWorkspaceSetting requires workspaceId and key');
    }
    return prisma.workspaceSetting.upsert({
        where: { workspace_id_key: { workspace_id: workspaceId, key } },
        create: { workspace_id: workspaceId, key, value, updated_by: updatedBy },
        update: { value, updated_by: updatedBy },
    });
}

// Bulk read — preferred when a caller needs several keys at once
// (e.g. `getPublicPlanCatalog` wants both the plan overrides and
// the add-on price). Single round-trip, returns { key: value } map.
export async function getWorkspaceSettings(prisma, workspaceId, keys) {
    if (!workspaceId || !Array.isArray(keys) || keys.length === 0) return {};
    const rows = await prisma.workspaceSetting.findMany({
        where: { workspace_id: workspaceId, key: { in: keys } },
    });
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
}

export default {
    SETTING_KEYS,
    getWorkspaceSetting,
    setWorkspaceSetting,
    getWorkspaceSettings,
};
