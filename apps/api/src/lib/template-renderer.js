// ─────────────────────────────────────────────────────────────────
// Template renderer.
//
// Resolves `{variable}` placeholders in a MessageTemplate body into
// real values pulled from the event context + referenced DB rows.
//
// The context passed from fireEvent() is typically sparse:
//   { user_id, workspace_id, membership_id?, product_id?, ... }
// so the renderer is responsible for hydrating whatever the template
// asks for. We only query what's referenced — no wasteful fetches.
//
// Safety:
//   - Unknown variables → empty string (never leak "{whatever}" into
//     a WhatsApp message).
//   - All interpolated values are coerced to string.
//   - We never execute the template body — no `eval`, no regex
//     backrefs beyond the literal `{key}` capture.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';

const VAR_RE = /\{([a-z_][a-z0-9_]*)\}/gi;

function formatMXN(amountPesos) {
    if (amountPesos == null || isNaN(Number(amountPesos))) return '';
    // Payments are in pesos (int) per the schema, so just format.
    return Number(amountPesos).toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0,
    });
}

function webappUrl() {
    return process.env.WEBAPP_PUBLIC_URL || 'http://localhost:3000';
}

function apiUrl() {
    return process.env.API_PUBLIC_URL || 'http://localhost:3001';
}

// Lazy hydrator: only fetches a table if a variable in this group
// actually appears in the template.
function groupReferenced(body, keys) {
    return keys.some((k) => body.includes(`{${k}}`));
}

// Builds the full variable dictionary for a given context. Any key
// missing from context / DB becomes ''.
async function buildVars(body, context = {}) {
    const out = {};

    // ── User (drives {nombre}, {link_pago}, {qr_url}, {link_portal}) ──
    let user = null;
    if (context.user_id && groupReferenced(body, ['nombre', 'qr_url', 'link_portal', 'link_pago'])) {
        user = await prisma.user.findUnique({
            where: { id: context.user_id },
            select: { id: true, name: true, full_name: true, email: true, phone: true, workspace_id: true },
        }).catch(() => null);
    }
    out.nombre = user?.name || user?.full_name || context.nombre || '';

    // ── Workspace ({gym}) ──
    let workspace = null;
    if ((context.workspace_id || user?.workspace_id) && groupReferenced(body, ['gym'])) {
        const wid = context.workspace_id || user?.workspace_id;
        workspace = await prisma.workspace.findUnique({
            where: { id: wid },
            select: { id: true, name: true },
        }).catch(() => null);
    }
    out.gym = workspace?.name || context.gym || 'CED-GYM';

    // ── Membership ({plan}, {vence_en}, {fecha_venc}, {precio}, {precio_desc}) ──
    let membership = null;
    if (groupReferenced(body, ['plan', 'vence_en', 'fecha_venc', 'precio', 'precio_desc', 'descuento', 'link_pago'])) {
        if (context.membership_id) {
            membership = await prisma.membership.findUnique({
                where: { id: context.membership_id },
            }).catch(() => null);
        } else if (context.user_id) {
            membership = await prisma.membership.findUnique({
                where: { user_id: context.user_id },
            }).catch(() => null);
        }
    }
    out.plan        = membership?.plan || context.plan || '';
    out.fecha_venc  = membership?.expires_at ? dayjs(membership.expires_at).format('DD/MM/YYYY') : '';
    out.vence_en    = membership?.expires_at
        ? String(Math.max(0, dayjs(membership.expires_at).diff(dayjs(), 'day')))
        : (context.days_before != null ? String(context.days_before) : '');
    const price = membership?.price_mxn ?? context.price_mxn ?? null;
    out.precio      = price != null ? formatMXN(price) : '';
    out.precio_desc = price != null ? formatMXN(Math.round(price * 0.8)) : '';
    out.descuento   = '20%';

    // ── Links (always safe to build) ──
    out.link_portal = `${webappUrl()}/portal`;
    out.qr_url      = `${webappUrl()}/portal/qr`;
    out.link_pago   = membership?.id
        ? `${webappUrl()}/renew?m=${membership.id}`
        : `${webappUrl()}/renew`;
    out.link_review = context.product_id
        ? `${webappUrl()}/tienda/${context.product_id}/review`
        : `${webappUrl()}/tienda`;

    // ── Trainer ({coach}) ──
    if (context.trainer_id && groupReferenced(body, ['coach'])) {
        const trainer = await prisma.user.findUnique({
            where: { id: context.trainer_id },
            select: { name: true, full_name: true },
        }).catch(() => null);
        out.coach = trainer?.full_name || trainer?.name || '';
    } else {
        out.coach = context.coach || '';
    }

    // ── Class ({clase}) ──
    if (context.class_id && groupReferenced(body, ['clase'])) {
        const cls = await prisma.classSchedule.findUnique({
            where: { id: context.class_id },
            select: { name: true },
        }).catch(() => null);
        out.clase = cls?.name || context.clase || '';
    } else {
        out.clase = context.clase || '';
    }

    // ── Course ({curso}) ──
    if (context.course_id && groupReferenced(body, ['curso'])) {
        const course = await prisma.course.findUnique({
            where: { id: context.course_id },
            select: { name: true },
        }).catch(() => null);
        out.curso = course?.name || context.curso || '';
    } else {
        out.curso = context.curso || '';
    }

    // ── Digital product ({producto}) ──
    if (context.product_id && groupReferenced(body, ['producto'])) {
        const product = await prisma.digitalProduct.findUnique({
            where: { id: context.product_id },
            select: { title: true },
        }).catch(() => null);
        out.producto = product?.title || context.producto || '';
    } else {
        out.producto = context.producto || '';
    }

    // ── Gamification / OTP / referral direct context ──
    out.badge         = context.badge || '';
    out.xp            = context.xp != null ? String(context.xp) : '';
    out.days          = context.days != null ? String(context.days) : '';
    out.code          = context.code || '';
    out.referred_name = context.referred_name || '';
    out.fecha_inicio  = context.fecha_inicio || (context.starts_at ? dayjs(context.starts_at).format('DD/MM/YYYY') : '');

    return out;
}

/**
 * Render `body` against `context`.
 * Any variable not in the dictionary falls through to ''.
 */
export async function renderTemplate(body, context = {}) {
    if (!body || typeof body !== 'string') return '';
    const vars = await buildVars(body, context);
    return body.replace(VAR_RE, (_match, key) => {
        const val = vars[key.toLowerCase()];
        return val == null ? '' : String(val);
    });
}

// Synchronous variant for previews that already have the dict in hand.
export function renderWithVars(body, vars) {
    if (!body) return '';
    return body.replace(VAR_RE, (_m, key) => {
        const v = vars[key.toLowerCase()];
        return v == null ? '' : String(v);
    });
}

export default {
    renderTemplate,
    renderWithVars,
};
