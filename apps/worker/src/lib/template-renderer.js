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

    let user = null;
    if (context.user_id && groupReferenced(body, ['nombre', 'qr_url', 'link_portal', 'link_pago'])) {
        user = await prisma.user.findUnique({
            where: { id: context.user_id },
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

    out.link_portal = `${webappUrl()}/portal`;
    out.qr_url      = `${webappUrl()}/portal/qr`;
    out.link_pago   = membership?.id
        ? `${webappUrl()}/renew?m=${membership.id}`
        : `${webappUrl()}/renew`;
    out.link_review = context.product_id
        ? `${webappUrl()}/tienda/${context.product_id}/review`
        : `${webappUrl()}/tienda`;

    if (context.trainer_id && groupReferenced(body, ['coach'])) {
        const trainer = await prisma.user.findUnique({
            where: { id: context.trainer_id },
            select: { name: true, full_name: true },
        }).catch(() => null);
        out.coach = trainer?.full_name || trainer?.name || '';
    } else {
        out.coach = context.coach || '';
    }

    if (context.class_id && groupReferenced(body, ['clase'])) {
        const cls = await prisma.classSchedule.findUnique({
            where: { id: context.class_id },
            select: { name: true },
        }).catch(() => null);
        out.clase = cls?.name || context.clase || '';
    } else {
        out.clase = context.clase || '';
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
