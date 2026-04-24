// ═══════════════════════════════════════════════════════════════
// Seed automations + message templates for the default workspace.
//
// Idempotent: re-runs upsert by (workspace_id, code) for templates
// and by (workspace_id, trigger, name) for automations (we pick the
// first match and update params to match the seed).
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
    {
        code: 'membership.expiring_8d',
        name: 'Recordatorio 8 días antes',
        channel: 'WHATSAPP',
        body: `🔔 *{gym}*\n\nHola {nombre}, tu membresía vence en *8 días* ({fecha_venc}).\n\nRenueva ahora y obtén *{descuento} de descuento*:\n{link_pago}`,
    },
    {
        code: 'membership.expiring_3d',
        name: 'Recordatorio 3 días antes',
        channel: 'WHATSAPP',
        body: `⚠️ *{gym}*\n\nSolo *3 días* restantes, {nombre}.\n¡Última oportunidad con {descuento} off!\n\n{link_pago}`,
    },
    {
        code: 'membership.expiring_1d',
        name: 'Recordatorio 1 día antes',
        channel: 'WHATSAPP',
        body: `🚨 *{gym}*\n\n{nombre}, mañana vence tu membresía {plan}.\nRenueva ahora y no pierdas tu lugar:\n\n{link_pago}`,
    },
    {
        code: 'membership.expired',
        name: 'Membresía vencida',
        channel: 'WHATSAPP',
        body: `😢 Extrañamos tu energía, {nombre}.\n\nReactiva tu membresía por *{precio_desc}* este mes y vuelve al gym:\n{link_pago}`,
    },
    {
        code: 'payment.approved',
        name: 'Pago confirmado',
        channel: 'WHATSAPP',
        body: `✅ *{gym}*\n\nPago confirmado, {nombre}.\nTu membresía *{plan}* está activa hasta *{fecha_venc}*.\n\nTu QR de acceso: {qr_url}`,
    },
    {
        code: 'member.created',
        name: 'Bienvenida nuevo miembro',
        channel: 'WHATSAPP',
        body: `👋 ¡Bienvenido a *{gym}*, {nombre}!\n\nYa puedes acceder al gym con tu QR dinámico:\n{qr_url}\n\nTu portal: {link_portal}`,
    },
    {
        code: 'checkin.first_of_week',
        name: 'Primer check-in de la semana',
        channel: 'PUSH',
        body: `💪 ¡Buen entrenamiento, {nombre}! Ya llevas tu 1ra sesión esta semana.`,
    },
    {
        code: 'course.enrolled',
        name: 'Inscripción a curso',
        channel: 'WHATSAPP',
        body: `📚 *{gym}*\n\n{nombre}, tu inscripción al curso *{curso}* está confirmada.\nEmpieza {fecha_inicio}.`,
    },
    {
        code: 'member.birthday',
        name: 'Cumpleaños',
        channel: 'WHATSAPP',
        body: `🎂 ¡Feliz cumpleaños, {nombre}!\n\nHoy tienes *10% de descuento* en suplementos. ¡Te esperamos!`,
    },
    {
        code: 'inactivity.14_days',
        name: 'Reactivación inactivos',
        channel: 'WHATSAPP',
        body: `😴 {nombre}, te echamos de menos.\n\n¿Todo bien? Tu racha te espera en {gym}.\n{link_portal}`,
    },
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
    {
        code: 'product.purchased',
        name: 'Producto digital comprado',
        channel: 'WHATSAPP',
        body: `🎉 Listo {nombre}, tu rutina *{producto}* está disponible en tu cuenta:\n{link_portal}`,
    },
    {
        code: 'product.review_request',
        name: 'Pedir reseña 7d post-compra',
        channel: 'WHATSAPP',
        body: `⭐ {nombre}, ¿cómo vas con *{producto}*?\nDéjanos tu reseña y gana XP:\n{link_review}`,
    },
    {
        code: 'gamification.badge_unlocked',
        name: 'Badge desbloqueado',
        channel: 'PUSH',
        body: `🏅 ¡Desbloqueaste *{badge}*! +{xp} XP`,
    },
    {
        code: 'gamification.streak_break_warning',
        name: 'Racha en peligro',
        channel: 'PUSH',
        body: `🔥 {nombre}, tu racha de {days} días está en peligro. ¡Entrena hoy!`,
    },
    {
        code: 'measurement.reminder',
        name: 'Recordatorio mediciones',
        channel: 'WHATSAPP',
        body: `📏 Hace un mes de tu última medición, {nombre}.\nAgenda con {coach}.`,
    },
];

// ── Automations (ordered, one per row in the ULTRAPLAN table) ──
// `template_code` is resolved to template_id at seed time.
const AUTOMATIONS = [
    {
        name: 'Recordatorio 8 días antes',
        trigger: 'membership.expiring_soon',
        filter: { days_before: 8 },
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expiring_8d',
    },
    {
        name: 'Recordatorio 3 días antes',
        trigger: 'membership.expiring_soon',
        filter: { days_before: 3 },
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expiring_3d',
    },
    {
        name: 'Recordatorio 1 día antes',
        trigger: 'membership.expiring_soon',
        filter: { days_before: 1 },
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expiring_1d',
    },
    {
        name: 'Membresía vencida',
        trigger: 'membership.expired',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'membership.expired',
    },
    {
        name: 'Pago confirmado',
        trigger: 'payment.approved',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'payment.approved',
    },
    {
        name: 'Bienvenida (5 min)',
        trigger: 'member.created',
        filter: null,
        delay_minutes: 5,
        action: 'whatsapp.send_template',
        template_code: 'member.created',
    },
    {
        name: 'Primer check-in semanal',
        trigger: 'checkin.first_of_week',
        filter: null,
        delay_minutes: 0,
        action: 'push.notify',
        template_code: 'checkin.first_of_week',
    },
    {
        name: 'Inscripción confirmada',
        trigger: 'course.enrolled',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'course.enrolled',
    },
    {
        name: 'Cumpleaños',
        trigger: 'member.birthday',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'member.birthday',
    },
    {
        name: 'Reactivación 14 días',
        trigger: 'inactivity.14_days',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'inactivity.14_days',
    },
    {
        name: 'OTP registro',
        trigger: 'auth.otp_register',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'auth.otp_register',
    },
    {
        name: 'OTP reset password',
        trigger: 'auth.password_reset',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'auth.password_reset',
    },
    {
        name: 'Producto digital comprado',
        trigger: 'product.purchased',
        filter: null,
        delay_minutes: 0,
        action: 'whatsapp.send_template',
        template_code: 'product.purchased',
    },
    {
        name: 'Pedir reseña 7 días',
        trigger: 'product.review_request',
        filter: null,
        delay_minutes: 60 * 24 * 7, // 7 días
        action: 'whatsapp.send_template',
        template_code: 'product.review_request',
    },
    {
        name: 'Badge desbloqueado',
        trigger: 'gamification.badge_unlocked',
        filter: null,
        delay_minutes: 0,
        action: 'push.notify',
        template_code: 'gamification.badge_unlocked',
    },
    {
        name: 'Racha en peligro',
        trigger: 'gamification.streak_break_warning',
        filter: null,
        delay_minutes: 0,
        action: 'push.notify',
        template_code: 'gamification.streak_break_warning',
    },
    {
        name: 'Medición mensual',
        trigger: 'measurement.reminder',
        filter: null,
        delay_minutes: 60 * 24 * 30, // 30 días
        action: 'whatsapp.send_template',
        template_code: 'measurement.reminder',
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

        const payload = {
            workspace_id: ws,
            name: a.name,
            trigger: a.trigger,
            filter: a.filter ?? null,
            delay_minutes: a.delay_minutes ?? 0,
            action: a.action,
            params: { template_id: templateId, to: 'member' },
            enabled: true,
        };

        if (existing) {
            await prisma.automation.update({
                where: { id: existing.id },
                data: payload,
            });
            console.log(`  • auto UPD  ${a.trigger.padEnd(36)} ${a.name}`);
        } else {
            await prisma.automation.create({ data: payload });
            console.log(`  • auto NEW  ${a.trigger.padEnd(36)} ${a.name}`);
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
