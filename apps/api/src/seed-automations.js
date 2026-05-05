// ═══════════════════════════════════════════════════════════════
// Seed automations + message templates for the default workspace.
//
// Idempotent: re-runs upsert by (workspace_id, code) for templates
// and by (workspace_id, trigger, name) for automations (we pick the
// first match and update params to match the seed). Setting
// `enabled: false` on an automation here turns it off without
// deleting the row, so historical AutomationJob audits still join.
//
// Run: `node src/seed-automations.js`
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';
import { prisma } from '@cedgym/db';

const DEFAULT_SLUG = 'ced-gym';

// ── Templates ──────────────────────────────────────────────
// `code` is the stable identifier the Automation.params.template_id
// references by *id after creation. We resolve id at runtime in the
// seeding loop below.
const TEMPLATES = [
    // ─── Recordatorios de vencimiento (5d / 1d / vencida ayer) ───
    // Sin códigos de descuento. Solo le llegan a quien NO tiene
    // auto-renovación (filtrado en el sweep). Tono: recordatorio
    // simple, "pásate por recepción".
    {
        code: 'membership.expiring_5d',
        name: 'Recordatorio 5 días antes',
        channel: 'WHATSAPP',
        body: `Hola {nombre} 👋\n\nTu membresía CED·GYM vence el *{fecha_venc}* (en 5 días).\n\nPásate por recepción para renovarla y no perder tu lugar.`,
    },
    {
        code: 'membership.expiring_1d',
        name: 'Recordatorio 1 día antes',
        channel: 'WHATSAPP',
        body: `Hola {nombre},\n\nTu membresía *{plan}* vence *mañana* ({fecha_venc}).\n\nNo olvides pasar por recepción para renovarla.`,
    },
    {
        code: 'membership.expired',
        name: 'Membresía vencida',
        channel: 'WHATSAPP',
        body: `Hola {nombre},\n\nTu membresía CED·GYM venció ayer.\n\nPásate por recepción cuando puedas para reactivarla. Te esperamos 💪`,
    },

    // ─── Templates legacy (8d/3d) — sus automatizaciones se
    // dejan deshabilitadas, pero conservamos los rows para no
    // perder histórico de jobs vinculados. ────────────────────
    {
        code: 'membership.expiring_8d',
        name: 'Recordatorio 8 días antes (legacy)',
        channel: 'WHATSAPP',
        body: `Hola {nombre}, tu membresía vence en 8 días ({fecha_venc}).`,
    },
    {
        code: 'membership.expiring_3d',
        name: 'Recordatorio 3 días antes (legacy)',
        channel: 'WHATSAPP',
        body: `Hola {nombre}, tu membresía vence en 3 días ({fecha_venc}).`,
    },

    // ─── Pago confirmado ────────────────────────────────────
    {
        code: 'payment.approved',
        name: 'Pago confirmado',
        channel: 'WHATSAPP',
        // Stripe-aware: shows monto, fecha exacta, método (Visa ····4242),
        // ID de cobro (pi_...) y link al recibo. Vars vacías cuando vienen
        // de un cobro no-Stripe (ej. courtesy bypass).
        body: `✅ *{gym}*\n\nPago confirmado, {nombre}.\nTu membresía *{plan}* está activa hasta *{fecha_venc}*.\n\n*Detalles del cobro*\n• Monto: {monto_pagado}\n• Fecha: {fecha_pago}\n• Tarjeta: {metodo_pago}\n• ID: {pago_id}\n\nRecibo: {recibo_url}\nTu QR de acceso: {qr_url}`,
    },

    // ─── Bienvenida ─────────────────────────────────────────
    {
        code: 'member.created',
        name: 'Bienvenida nuevo miembro',
        channel: 'WHATSAPP',
        body: `👋 ¡Bienvenido a *{gym}*, {nombre}!\n\nYa puedes acceder al gym con tu QR dinámico:\n{qr_url}\n\nTu portal: {link_portal}`,
    },

    // ─── Cumpleaños — sin descuento, firmado por Jeffrey ────
    {
        code: 'member.birthday',
        name: 'Cumpleaños',
        channel: 'WHATSAPP',
        body: `🎂 ¡Feliz cumpleaños, {nombre}!\n\nQue tengas un día increíble. Te deseo lo mejor y nos vemos en el gym 💪\n\n— Jeffrey`,
    },

    // ─── Inactividad ────────────────────────────────────────
    {
        code: 'inactivity.14_days',
        name: 'Reactivación inactivos',
        channel: 'WHATSAPP',
        body: `😴 {nombre}, te echamos de menos.\n\n¿Todo bien? Tu racha te espera en {gym}.\n{link_portal}`,
    },

    // ─── OTPs (sin cambios) ─────────────────────────────────
    {
        code: 'auth.otp_register',
        name: 'OTP registro',
        channel: 'WHATSAPP',
        body: `🏋️ *{gym}*\n\nTu código de verificación: *{code}*\n\nExpira en 10 minutos.`,
    },
    {
        code: 'auth.password_reset',
        name: 'OTP reset password',
        channel: 'WHATSAPP',
        body: `🔐 *{gym}*\n\nTu código de recuperación: *{code}*\n\nNadie de {gym} te pedirá este código.`,
    },

    // ─── Producto digital comprado ──────────────────────────
    {
        code: 'product.purchased',
        name: 'Producto digital comprado',
        channel: 'WHATSAPP',
        body: `🎉 Listo {nombre}, tu rutina *{producto}* está disponible en tu cuenta:\n{link_portal}`,
    },

    // ─── Reseña 7d después — sin "gana XP" ─────────────────
    {
        code: 'product.review_request',
        name: 'Pedir reseña 7d post-compra',
        channel: 'WHATSAPP',
        body: `⭐ Hola {nombre}, ¿cómo te ha ido con *{producto}*?\n\nNos encantaría leer tu opinión:\n{link_review}`,
    },

    // ─── Recordatorios 1h después de generar rutina/plan ───
    // El delay vive en la automatización (delay_minutes: 60).
    {
        code: 'routine.generated.reminder_1h',
        name: 'Recordatorio rutina generada (1h)',
        channel: 'WHATSAPP',
        body: `💪 Hola {nombre}, hace 1 hora generaste tu rutina.\n\nÉchale un vistazo cuando puedas en tu portal:\n{link_portal}`,
    },
    {
        code: 'meal_plan.generated.reminder_1h',
        name: 'Recordatorio plan alimenticio generado (1h)',
        channel: 'WHATSAPP',
        body: `🥗 Hola {nombre}, hace 1 hora generaste tu plan alimenticio.\n\nRevísalo cuando puedas en tu portal:\n{link_portal}`,
    },

    // ─── Plantillas legacy (automatización deshabilitada) ──
    // Las dejamos para no perder histórico — el gate vive en
    // Automation.enabled en la sección de abajo.
    {
        code: 'checkin.first_of_week',
        name: 'Primer check-in de la semana (legacy)',
        channel: 'PUSH',
        body: `💪 ¡Buen entrenamiento, {nombre}! Ya llevas tu 1ra sesión esta semana.`,
    },
    {
        code: 'course.enrolled',
        name: 'Inscripción a curso (legacy)',
        channel: 'WHATSAPP',
        body: `📚 *{gym}*\n\n{nombre}, tu inscripción al curso *{curso}* está confirmada.\nEmpieza {fecha_inicio}.`,
    },
    {
        code: 'gamification.badge_unlocked',
        name: 'Badge desbloqueado (legacy)',
        channel: 'PUSH',
        body: `🏅 ¡Desbloqueaste *{badge}*! +{xp} XP`,
    },
    {
        code: 'gamification.streak_break_warning',
        name: 'Racha en peligro (legacy)',
        channel: 'PUSH',
        body: `🔥 {nombre}, tu racha de {days} días está en peligro. ¡Entrena hoy!`,
    },
    {
        code: 'measurement.reminder',
        name: 'Recordatorio mediciones (legacy)',
        channel: 'WHATSAPP',
        body: `📏 Hace un mes de tu última medición, {nombre}.\nAgenda con {coach}.`,
    },
];

// ── Automations (ordered, one per row in the ULTRAPLAN table) ──
// `template_code` is resolved to template_id at seed time.
// `enabled` defaults to true; set to false to disable a flow without
// deleting the row.
const AUTOMATIONS = [
    // ─── Recordatorios de vencimiento ACTIVOS (5d, 1d, expired) ───
    {
        name: 'Recordatorio 5 días antes',
        trigger: 'membership.expiring_soon',
        filter: { days_before: 5 },
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expiring_5d',
        enabled: true,
    },
    {
        name: 'Recordatorio 1 día antes',
        trigger: 'membership.expiring_soon',
        filter: { days_before: 1 },
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expiring_1d',
        enabled: true,
    },
    {
        name: 'Membresía vencida',
        trigger: 'membership.expired',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expired',
        enabled: true,
    },

    // ─── Recordatorios LEGACY (8d, 3d) — DESHABILITADOS ─────
    // Se quedaron en DB para preservar AutomationJob histórico
    // pero ya no disparan jobs nuevos.
    {
        name: 'Recordatorio 8 días antes',
        trigger: 'membership.expiring_soon',
        filter: { days_before: 8 },
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expiring_8d',
        enabled: false,
    },
    {
        name: 'Recordatorio 3 días antes',
        trigger: 'membership.expiring_soon',
        filter: { days_before: 3 },
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expiring_3d',
        enabled: false,
    },

    // ─── Pago + bienvenida + cumpleaños + inactividad ───────
    {
        name: 'Pago confirmado',
        trigger: 'payment.approved',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'payment.approved',
        enabled: true,
    },
    {
        name: 'Bienvenida (5 min)',
        trigger: 'member.created',
        filter: null,
        delay_minutes: 5,
        action: 'whatsapp.send_template',
        template_code: 'member.created',
        enabled: true,
    },
    {
        name: 'Cumpleaños',
        trigger: 'member.birthday',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'member.birthday',
        enabled: true,
    },
    {
        name: 'Reactivación 14 días',
        trigger: 'inactivity.14_days',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'inactivity.14_days',
        enabled: true,
    },

    // ─── OTPs ───────────────────────────────────────────────
    {
        name: 'OTP registro',
        trigger: 'auth.otp_register',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'auth.otp_register',
        enabled: true,
    },
    {
        name: 'OTP reset password',
        trigger: 'auth.password_reset',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'auth.password_reset',
        enabled: true,
    },

    // ─── Productos digitales ────────────────────────────────
    {
        name: 'Producto digital comprado',
        trigger: 'product.purchased',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'product.purchased',
        enabled: true,
    },
    {
        name: 'Pedir reseña 7 días',
        trigger: 'product.review_request',
        filter: null,
        delay_minutes: 60 * 24 * 7, // 7 días
        action: 'whatsapp.send_template',
        template_code: 'product.review_request',
        enabled: true,
    },

    // ─── Recordatorios 1h después de generar rutina/plan ───
    {
        name: 'Recordatorio rutina (1h)',
        trigger: 'routine.generated',
        filter: null,
        delay_minutes: 60,
        action: 'whatsapp.send_template',
        template_code: 'routine.generated.reminder_1h',
        enabled: true,
    },
    {
        name: 'Recordatorio plan alimenticio (1h)',
        trigger: 'meal_plan.generated',
        filter: null,
        delay_minutes: 60,
        action: 'whatsapp.send_template',
        template_code: 'meal_plan.generated.reminder_1h',
        enabled: true,
    },

    // ─── Automatizaciones DESHABILITADAS por decisión de
    // producto (cursos no se manejan, push notifications
    // apagadas, recordatorio de mediciones eliminado). ──────
    {
        name: 'Inscripción confirmada',
        trigger: 'course.enrolled',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'course.enrolled',
        enabled: false,
    },
    {
        name: 'Primer check-in semanal',
        trigger: 'checkin.first_of_week',
        filter: null,
        delay_minutes: 0,
        action: 'push.notify',
        template_code: 'checkin.first_of_week',
        enabled: false,
    },
    {
        name: 'Badge desbloqueado',
        trigger: 'gamification.badge_unlocked',
        filter: null,
        delay_minutes: 0,
        action: 'push.notify',
        template_code: 'gamification.badge_unlocked',
        enabled: false,
    },
    {
        name: 'Racha en peligro',
        trigger: 'gamification.streak_break_warning',
        filter: null,
        delay_minutes: 0,
        action: 'push.notify',
        template_code: 'gamification.streak_break_warning',
        enabled: false,
    },
    {
        name: 'Medición mensual',
        trigger: 'measurement.reminder',
        filter: null,
        delay_minutes: 60 * 24 * 30, // 30 días
        action: 'whatsapp.send_template',
        template_code: 'measurement.reminder',
        enabled: false,
    },
];

async function main() {
    console.log('[seed-automations] starting…');

    const workspace = await prisma.workspace.findUnique({ where: { slug: DEFAULT_SLUG } });
    if (!workspace) {
        console.error('[seed-automations] default workspace not found — run `node src/seed.js` first');
        process.exit(1);
    }
    const ws = workspace.id;

    // ── Templates: upsert by (workspace_id, code) ──
    const templateByCode = new Map();
    for (const t of TEMPLATES) {
        const row = await prisma.messageTemplate.upsert({
            where: { workspace_id_code: { workspace_id: ws, code: t.code } },
            create: {
                workspace_id: ws,
                code: t.code,
                name: t.name,
                body: t.body,
                channel: t.channel,
            },
            update: {
                name: t.name,
                body: t.body,
                channel: t.channel,
            },
        });
        templateByCode.set(t.code, row.id);
        console.log(`  • template  ${t.code.padEnd(40)} → ${row.id}`);
    }

    // ── Automations: upsert by (workspace_id, trigger, name) ──
    for (const a of AUTOMATIONS) {
        const templateId = templateByCode.get(a.template_code);
        if (!templateId) {
            console.warn(`[seed-automations] missing template ${a.template_code}; skipping automation ${a.name}`);
            continue;
        }

        const existing = await prisma.automation.findFirst({
            where: {
                workspace_id: ws,
                trigger: a.trigger,
                name: a.name,
            },
        });

        const enabled = a.enabled !== false;
        const payload = {
            workspace_id: ws,
            name: a.name,
            trigger: a.trigger,
            filter: a.filter ?? null,
            delay_minutes: a.delay_minutes ?? 0,
            action: a.action,
            params: { template_id: templateId, to: 'member' },
            enabled,
        };

        if (existing) {
            await prisma.automation.update({
                where: { id: existing.id },
                data: payload,
            });
            console.log(`  • auto ${enabled ? 'UPD' : 'OFF'}  ${a.trigger.padEnd(36)} ${a.name}`);
        } else {
            await prisma.automation.create({ data: payload });
            console.log(`  • auto ${enabled ? 'NEW' : 'OFF'}  ${a.trigger.padEnd(36)} ${a.name}`);
        }
    }

    console.log('[seed-automations] done.');
}

main()
    .catch((e) => {
        console.error('[seed-automations] FAILED:', e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
