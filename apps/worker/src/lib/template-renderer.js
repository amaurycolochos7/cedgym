// ─────────────────────────────────────────────────────────────────
// Worker-local copy of the template renderer.
//
// We keep a small duplicate (~200 lines) instead of cross-importing
// from apps/api so:
//   - The worker container image stays independent.
//   - There's no "shared internal lib" boundary to manage.
//   - API and worker can evolve their renderer semantics separately
//     if one needs extra context hydration the other doesn't.
//
// If these two files drift too much, promote to packages/renderer.
// For now — same behavior as apps/api/src/lib/template-renderer.js.
// ─────────────────────────────────────────────────────────────────

import dayjs from 'dayjs';
import { prisma } from '@cedgym/db';

const VAR_RE = /\{([a-z_][a-z0-9_]*)\}/gi;

function formatMXN(amountPesos) {
    if (amountPesos == null || isNaN(Number(amountPesos))) return '';
    return Number(amountPesos).toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        maximumFractionDigits: 0,
    });
}

function webappUrl() {
    return process.env.WEBAPP_PUBLIC_URL || 'http://localhost:3000';
}

function groupReferenced(body, keys) {
    return keys.some((k) => body.includes(`{${k}}`));
}

async function buildVars(body, context = {}) {
    const out = {};

    // API-side fireEvent calls (Stripe webhook, memberships-stripe,
    // badges) ship `userId` (camelCase); worker sweeps ship `user_id`
    // (snake_case). Accept both so payment.approved templates render
    // {nombre}/{plan}/{fecha_venc} instead of empty strings.
    const ctxUserId = context.user_id || context.userId;

    let user = null;
    if (ctxUserId && groupReferenced(body, ['nombre', 'qr_url', 'link_portal', 'link_pago'])) {
        user = await prisma.user.findUnique({
            where: { id: ctxUserId },
            select: { id: true, name: true, full_name: true, email: true, phone: true, workspace_id: true },
        }).catch(() => null);
    }
    out.nombre = user?.name || user?.full_name || context.nombre || '';

    let workspace = null;
    if ((context.workspace_id || user?.workspace_id) && groupReferenced(body, ['gym'])) {
        const wid = context.workspace_id || user?.workspace_id;
        workspace = await prisma.workspace.findUnique({
            where: { id: wid },
            select: { id: true, name: true },
        }).catch(() => null);
    }
    out.gym = workspace?.name || context.gym || 'CED-GYM';

    let membership = null;
    if (groupReferenced(body, ['plan', 'vence_en', 'fecha_venc', 'precio', 'precio_desc', 'descuento', 'link_pago'])) {
        if (context.membership_id) {
            membership = await prisma.membership.findUnique({
                where: { id: context.membership_id },
            }).catch(() => null);
        } else if (ctxUserId) {
            membership = await prisma.membership.findUnique({
                where: { user_id: ctxUserId },
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

    // Every URL below MUST resolve to a real Next route — these are
    // the destinations the user lands on from a WhatsApp message, so
    // a 404 here is an immediate complaint. Verified against
    // apps/web/app/ on 2026-05-04.
    //   /portal         → no page.tsx → was 404. Use /portal/dashboard.
    //   /renew          → never existed (legacy MP path). Use the
    //                     embedded renewal flow at /portal/membership.
    //   /tienda/X/review → no review page exists yet. Fall back to
    //                     the marketplace landing so the link still
    //                     works; revisit when the review form ships.
    out.link_portal = `${webappUrl()}/portal/dashboard`;
    out.qr_url      = `${webappUrl()}/portal/qr`;
    out.link_pago   = `${webappUrl()}/portal/membership`;
    out.link_review = `${webappUrl()}/tienda`;

    if (context.trainer_id && groupReferenced(body, ['coach'])) {
        const trainer = await prisma.user.findUnique({
            where: { id: context.trainer_id },
            select: { name: true, full_name: true },
        }).catch(() => null);
        out.coach = trainer?.full_name || trainer?.name || '';
    } else {
        out.coach = context.coach || '';
    }

    if (context.course_id && groupReferenced(body, ['curso'])) {
        const course = await prisma.course.findUnique({
            where: { id: context.course_id },
            select: { name: true },
        }).catch(() => null);
        out.curso = course?.name || context.curso || '';
    } else {
        out.curso = context.curso || '';
    }

    if (context.product_id && groupReferenced(body, ['producto'])) {
        const product = await prisma.digitalProduct.findUnique({
            where: { id: context.product_id },
            select: { title: true },
        }).catch(() => null);
        out.producto = product?.title || context.producto || '';
    } else {
        out.producto = context.producto || '';
    }

    out.badge         = context.badge || '';
    out.xp            = context.xp != null ? String(context.xp) : '';
    out.days          = context.days != null ? String(context.days) : '';
    out.code          = context.code || '';
    out.referred_name = context.referred_name || '';
    out.fecha_inicio  = context.fecha_inicio || (context.starts_at ? dayjs(context.starts_at).format('DD/MM/YYYY') : '');

    // ── Stripe payment receipt vars ──
    // Mirrors the block in apps/api/src/lib/template-renderer.js. The
    // worker is what actually executes templates when an AutomationJob
    // runs, so without these the payment.approved message would render
    // with empty {monto_pagado}/{fecha_pago}/{metodo_pago}/{pago_id}/
    // {recibo_url} slots even when the webhook ships the data.
    const stripe = context.stripe || {};
    const paidAtMs =
        typeof stripe.paid_at === 'number'
            ? stripe.paid_at
            : context.paid_at
            ? Number(new Date(context.paid_at))
            : null;
    out.monto_pagado = context.amount != null ? formatMXN(context.amount) : '';
    out.fecha_pago   = paidAtMs ? dayjs(paidAtMs).format('DD/MM/YYYY HH:mm') : '';
    out.metodo_pago  = stripe.payment_method || '';
    out.pago_id      = stripe.payment_intent_id || '';
    out.cobro_id     = stripe.charge_id || '';
    out.recibo_url   = stripe.receipt_url || stripe.hosted_invoice_url || '';

    return out;
}

export async function renderTemplate(body, context = {}) {
    if (!body || typeof body !== 'string') return '';
    const vars = await buildVars(body, context);
    return body.replace(VAR_RE, (_match, key) => {
        const val = vars[key.toLowerCase()];
        return val == null ? '' : String(val);
    });
}

export default { renderTemplate };
