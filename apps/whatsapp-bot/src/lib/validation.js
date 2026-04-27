// ─── Lightweight input validators for the bot's HTTP surface ──────
//
// We keep these here (instead of pulling Zod) to keep the bot lean —
// it only needs a handful of format checks. The goal is rejecting
// obviously-malformed identifiers and phone numbers before they hit
// Prisma or whatsapp-web.js.

// Prisma's `cuid()` default emits 25-char ids starting with 'c'
// (e.g. `cmo6gnzie0000veq8ljnlmd1m`). Older rows or migrated data
// may differ in length, so we accept a broader alphanumeric range
// rather than pinning exactly 25 chars.
const WORKSPACE_ID_RE = /^[a-z0-9]{16,40}$/i;
export function isValidWorkspaceId(s) {
    return typeof s === 'string' && WORKSPACE_ID_RE.test(s);
}

// E.164-ish: leading optional '+' followed by 8-15 digits. Loose
// because some routes accept national-only formats.
const PHONE_RE = /^\+?\d{8,15}$/;
export function isValidPhone(s) {
    return typeof s === 'string' && PHONE_RE.test(s);
}
