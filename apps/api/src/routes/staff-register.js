// ─────────────────────────────────────────────────────────────────
// Staff — Walk-in register / renew / enroll.
//
// Endpoints (RECEPTIONIST+):
//   GET  /staff/members/search               — lookup by name/phone/email
//   POST /staff/register-member              — new member + immediate charge
//   POST /staff/extend-membership            — renew / change plan
//   POST /staff/enroll-course                — enroll existing user in course
//
// Design notes:
//   - Because the receptionist is face-to-face with the athlete, we
//     skip OTP verification (phone_verified_at = now). Still bcrypt
//     the temp password so the hash table stays consistent.
//   - Cash / card-terminal payments are APPROVED immediately and we
//     write Membership + Payment in a single pass (mirrors what the
//     MP webhook does for online flows).
//   - MP_LINK creates a PENDING Payment + Mercado Pago preference and
//     lets the existing webhook (routes/webhooks.js) do membership
//     activation once the customer scans the QR. This avoids forking
//     the activation logic.
//   - WhatsApp welcome is fire-and-forget (we never block the sale on
//     bot availability).
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { err } from '../lib/errors.js';
import { fireEvent } from '../lib/events.js';
import {
    getEffectivePlanPrice,
    getPlanByCode,
    computeExpiresAt,
    daysRemaining,
} from '../lib/memberships.js';
import { createPreference } from '../lib/mercadopago.js';
import { detectGender } from '../lib/gender.js';
import { signWelcomeToken } from '../lib/jwt.js';

// ─── Schemas ─────────────────────────────────────────────────────
const PAYMENT_METHODS = ['CASH', 'CARD_TERMINAL', 'MP_LINK'];
const PLAN_ENUM = ['STARTER', 'PRO', 'ELITE'];
const CYCLE_ENUM = ['MONTHLY'];

const registerBody = z.object({
    name: z.string().trim().min(2).max(200),
    phone: z.string().trim().regex(/^\+?\d{10,15}$/, 'Teléfono inválido'),
    email: z.string().email().optional(),
    plan: z.enum(PLAN_ENUM),
    billing_cycle: z.enum(CYCLE_ENUM),
    payment_method: z.enum(PAYMENT_METHODS),
});

const extendBody = z.object({
    user_id: z.string().min(1),
    plan: z.enum(PLAN_ENUM).optional(),
    billing_cycle: z.enum(CYCLE_ENUM).optional(),
    payment_method: z.enum(PAYMENT_METHODS),
});

const enrollBody = z.object({
    user_id: z.string().min(1),
    course_id: z.string().min(1),
    payment_method: z.enum(PAYMENT_METHODS),
});

const searchQuery = z.object({
    q: z.string().trim().min(1).max(120),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── Helpers ─────────────────────────────────────────────────────
function apiPublicUrl() {
    return process.env.API_PUBLIC_URL || 'http://localhost:3001';
}
function webappPublicUrl() {
    return process.env.WEBAPP_PUBLIC_URL || 'http://localhost:3000';
}

// Receptionist-proof phone normalization — add +52 only if the input
// is digits-only and 10 chars long (typical MX local number).
function normalizePhone(raw) {
    const s = String(raw || '').trim();
    if (s.startsWith('+')) return s;
    if (/^\d{10}$/.test(s)) return `+52${s}`;
    return s;
}

// Random, readable temp password. Not a security concern — the member
// is expected to reset it on first login.
function generateTempPassword() {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
}

async function sendWalkinWelcome(fastify, { phone, name, welcomeLink, planName }) {
    const url = process.env.WHATSAPP_BOT_URL;
    const key = process.env.WHATSAPP_BOT_KEY;
    if (!url || !key) return { ok: false, error: 'bot_not_configured' };

    const firstName = (name || '').split(' ')[0] || '';
    const gender = detectGender(firstName);
    const salutation =
        gender === 'M'
            ? `💪 ¡Hola ${firstName}! Bienvenido a *CED·GYM*.`
            : gender === 'F'
            ? `💪 ¡Hola ${firstName}! Bienvenida a *CED·GYM*.`
            : `💪 ¡Hola ${firstName}! Bienvenid@ a *CED·GYM*.`;

    const planLine = planName
        ? `Tu plan *${planName}* ya está activo.`
        : `Tu membresía ya está activa.`;

    const message =
        `${salutation}\n\n` +
        `${planLine}\n\n` +
        `Configura tu acceso (1 minuto):\n` +
        `👉 ${welcomeLink}\n\n` +
        `En el link vas a:\n` +
        `🔐 Crear tu contraseña\n` +
        `📸 Subir tu selfie\n` +
        `🎟️ Recibir tu QR de acceso al gym\n\n` +
        `_Importante:_ no podrás entrar al gym hasta que subas tu selfie.\n\n` +
        `Cualquier duda, responde por aquí.`;

    try {
        const res = await fetch(`${url}/send-message`, {
            method: 'POST',
            headers: {
                'x-api-key': key,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ phone, message, template: 'member.welcome_walkin' }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            fastify.log.warn({ status: res.status, text }, '[staff-register] bot non-200');
            return { ok: false, error: `bot_status_${res.status}` };
        }
        return { ok: true };
    } catch (e) {
        fastify.log.warn({ err: e }, '[staff-register] bot fetch failed');
        return { ok: false, error: 'fetch_failed' };
    }
}

// Extend (or create) the membership row for a user — used by cash /
// card-terminal (both APPROVED immediately). Mirrors the webhook
// activation path but synchronous.
async function activateMembershipNow(prisma, { user, plan, billingCycle, priceMxn }) {
    const existing = await prisma.membership.findUnique({
        where: { user_id: user.id },
    });
    const base =
        existing && dayjs(existing.expires_at).isAfter(dayjs())
            ? existing.expires_at
            : new Date();
    const newExpiresAt = computeExpiresAt(billingCycle, base);

    if (existing) {
        return {
            membership: await prisma.membership.update({
                where: { id: existing.id },
                data: {
                    plan,
                    billing_cycle: billingCycle,
                    expires_at: newExpiresAt,
                    status: 'ACTIVE',
                    price_mxn: priceMxn,
                },
            }),
            isRenewal: true,
        };
    }

    return {
        membership: await prisma.membership.create({
            data: {
                workspace_id: user.workspace_id,
                user_id: user.id,
                plan,
                billing_cycle: billingCycle,
                starts_at: new Date(),
                expires_at: newExpiresAt,
                status: 'ACTIVE',
                price_mxn: priceMxn,
            },
        }),
        isRenewal: false,
    };
}

function buildMembershipPrefArgs({ user, plan, billingCycle, amount, paymentId }) {
    const planMeta = getPlanByCode(plan);
    return {
        userId: user.id,
        type: 'MEMBERSHIP',
        reference: `${plan}:${billingCycle}`,
        items: [
            {
                id: `${plan}_${billingCycle}`,
                title: `Membresía ${planMeta?.name || plan} — ${billingCycle}`,
                quantity: 1,
                unit_price: amount,
            },
        ],
        payer: user.email
            ? { email: user.email, name: user.full_name || user.name }
            : undefined,
        back_urls: {
            success: `${webappPublicUrl()}/membership/success?payment=${paymentId}`,
            failure: `${webappPublicUrl()}/membership/failed?payment=${paymentId}`,
            pending: `${webappPublicUrl()}/membership/pending?payment=${paymentId}`,
        },
        notification_url: `${apiPublicUrl()}/webhooks/mercadopago`,
        external_reference: paymentId,
        metadata: {
            plan,
            billing_cycle: billingCycle,
            workspace_id: user.workspace_id,
            walkin: true,
        },
    };
}

function buildCoursePrefArgs({ user, course, paymentId }) {
    return {
        userId: user.id,
        type: 'COURSE',
        reference: course.id,
        items: [
            {
                id: course.id,
                title: `Curso: ${course.name}`,
                quantity: 1,
                unit_price: course.price_mxn,
            },
        ],
        payer: user.email
            ? { email: user.email, name: user.full_name || user.name }
            : undefined,
        back_urls: {
            success: `${webappPublicUrl()}/courses/success?payment=${paymentId}`,
            failure: `${webappPublicUrl()}/courses/failed?payment=${paymentId}`,
            pending: `${webappPublicUrl()}/courses/pending?payment=${paymentId}`,
        },
        notification_url: `${apiPublicUrl()}/webhooks/mercadopago`,
        external_reference: paymentId,
        metadata: {
            course_id: course.id,
            workspace_id: course.workspace_id,
            walkin: true,
        },
    };
}

// ─────────────────────────────────────────────────────────────────
export default async function staffRegisterRoutes(fastify) {
    const { prisma } = fastify;
    const guard = {
        preHandler: [
            fastify.authenticate,
            fastify.requireRole('RECEPTIONIST', 'ADMIN', 'SUPERADMIN'),
        ],
    };

    // ─── GET /staff/members/search ───────────────────────────────
    fastify.get('/staff/members/search', guard, async (req) => {
        const parsed = searchQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const { q, limit } = parsed.data;
        const workspaceId = req.user.workspace_id || fastify.defaultWorkspaceId;

        const rows = await prisma.user.findMany({
            where: {
                workspace_id: workspaceId,
                role: 'ATHLETE',
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { full_name: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q } },
                ],
            },
            include: { membership: true },
            take: limit,
            orderBy: { created_at: 'desc' },
        });

        return {
            items: rows.map((u) => ({
                id: u.id,
                name: u.full_name || u.name,
                phone: u.phone,
                email: u.email,
                plan: u.membership?.plan || null,
                membership_status: u.membership?.status || null,
                expires_at: u.membership?.expires_at || null,
                days_remaining: u.membership?.expires_at
                    ? daysRemaining(u.membership.expires_at)
                    : 0,
            })),
        };
    });

    // ─── POST /staff/register-member ─────────────────────────────
    fastify.post('/staff/register-member', guard, async (req) => {
        const parsed = registerBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const { name, email, plan, billing_cycle, payment_method } = parsed.data;
        const phone = normalizePhone(parsed.data.phone);

        const workspaceId = req.user.workspace_id || fastify.defaultWorkspaceId;
        if (!workspaceId) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

        const basePrice = await getEffectivePlanPrice(prisma, workspaceId, plan, billing_cycle);
        if (basePrice == null) throw err('PLAN_INVALID', 'Plan o ciclo inválido', 400);

        // Duplicate check (match admin-members behaviour).
        const existing = await prisma.user.findFirst({
            where: {
                OR: [
                    { phone },
                    ...(email ? [{ email }] : []),
                ],
            },
        });
        if (existing) {
            throw err(
                'USER_EXISTS',
                'Ya existe un socio con ese teléfono o correo. Usa "Renovar" en su lugar.',
                409
            );
        }

        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const user = await prisma.user.create({
            data: {
                workspace_id: workspaceId,
                name,
                full_name: name,
                email: email || null,
                phone,
                role: 'ATHLETE',
                status: 'ACTIVE',
                phone_verified_at: new Date(), // receptionist saw them in person
                password_hash: passwordHash,
            },
        });

        // Route cash / card-terminal → immediate activation.
        const isOffline = payment_method === 'CASH' || payment_method === 'CARD_TERMINAL';

        if (isOffline) {
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: workspaceId,
                    user_id: user.id,
                    amount: basePrice,
                    type: 'MEMBERSHIP',
                    reference: `${plan}:${billing_cycle}:WALKIN`,
                    description: `Alta walk-in ${plan} ${billing_cycle}`,
                    status: 'APPROVED',
                    paid_at: new Date(),
                    metadata: {
                        plan,
                        billing_cycle,
                        walkin: true,
                        payment_method,
                        cashier_id: req.user.sub || req.user.id,
                    },
                },
            });

            const { membership } = await activateMembershipNow(prisma, {
                user,
                plan,
                billingCycle: billing_cycle,
                priceMxn: basePrice,
            });

            await fireEvent('member.verified', {
                workspaceId,
                userId: user.id,
                membershipId: membership.id,
                plan,
                billingCycle: billing_cycle,
            });

            // Welcome link — single-use signed token, valid 7 days. The
            // socio uses this to set their password + upload selfie.
            const welcomeToken = signWelcomeToken(fastify, user.id);
            const welcomeLink = `${webappPublicUrl()}/welcome?t=${encodeURIComponent(welcomeToken)}`;
            const planMeta = getPlanByCode(plan);

            // Fire-and-forget welcome.
            sendWalkinWelcome(fastify, {
                phone,
                name,
                welcomeLink,
                planName: planMeta?.name || plan,
            }).catch(() => {});

            return {
                user_id: user.id,
                membership_id: membership.id,
                payment_id: payment.id,
                welcome_link: welcomeLink,
                init_point: null,
                amount_mxn: basePrice,
            };
        }

        // MP_LINK → PENDING payment + preference, webhook activates.
        const payment = await prisma.payment.create({
            data: {
                workspace_id: workspaceId,
                user_id: user.id,
                amount: basePrice,
                type: 'MEMBERSHIP',
                reference: `${plan}:${billing_cycle}:WALKIN`,
                description: `Alta walk-in ${plan} ${billing_cycle}`,
                status: 'PENDING',
                metadata: {
                    plan,
                    billing_cycle,
                    walkin: true,
                    payment_method,
                    cashier_id: req.user.sub || req.user.id,
                },
            },
        });

        const mpPref = await createPreference(
            buildMembershipPrefArgs({
                user,
                plan,
                billingCycle: billing_cycle,
                amount: basePrice,
                paymentId: payment.id,
            })
        );
        await prisma.payment.update({
            where: { id: payment.id },
            data: { mp_preference_id: mpPref.preferenceId },
        });

        // Welcome link — same flow as offline path. Webhook will activate
        // the membership once MP confirms; the welcome link is independent
        // of payment status (the socio can set password / selfie meanwhile).
        const welcomeToken = signWelcomeToken(fastify, user.id);
        const welcomeLink = `${webappPublicUrl()}/welcome?t=${encodeURIComponent(welcomeToken)}`;
        const planMeta = getPlanByCode(plan);

        sendWalkinWelcome(fastify, {
            phone,
            name,
            welcomeLink,
            planName: planMeta?.name || plan,
        }).catch(() => {});

        return {
            user_id: user.id,
            membership_id: null,
            payment_id: payment.id,
            welcome_link: welcomeLink,
            init_point: mpPref.init_point,
            sandbox_init_point: mpPref.sandbox_init_point,
            amount_mxn: basePrice,
        };
    });

    // ─── POST /staff/extend-membership ───────────────────────────
    fastify.post('/staff/extend-membership', guard, async (req) => {
        const parsed = extendBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const { user_id, payment_method } = parsed.data;

        const user = await prisma.user.findUnique({ where: { id: user_id } });
        if (!user) throw err('USER_NOT_FOUND', 'Socio no encontrado', 404);

        const existing = await prisma.membership.findUnique({
            where: { user_id: user.id },
        });

        // Plan/cycle default to the existing row when omitted.
        const plan = parsed.data.plan || existing?.plan;
        const billing_cycle = parsed.data.billing_cycle || existing?.billing_cycle;
        if (!plan || !billing_cycle) {
            throw err('PLAN_REQUIRED', 'Este socio no tiene plan previo; indica plan y ciclo', 400);
        }

        const isOffline = payment_method === 'CASH' || payment_method === 'CARD_TERMINAL';
        const workspaceId = user.workspace_id;

        const basePrice = await getEffectivePlanPrice(prisma, workspaceId, plan, billing_cycle);
        if (basePrice == null) throw err('PLAN_INVALID', 'Plan o ciclo inválido', 400);

        if (isOffline) {
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: workspaceId,
                    user_id: user.id,
                    amount: basePrice,
                    type: 'MEMBERSHIP',
                    reference: `${plan}:${billing_cycle}:RENEW_WALKIN`,
                    description: `Renovación walk-in ${plan} ${billing_cycle}`,
                    status: 'APPROVED',
                    paid_at: new Date(),
                    metadata: {
                        plan,
                        billing_cycle,
                        walkin: true,
                        renewal: true,
                        payment_method,
                        cashier_id: req.user.sub || req.user.id,
                    },
                },
            });

            const { membership, isRenewal } = await activateMembershipNow(prisma, {
                user,
                plan,
                billingCycle: billing_cycle,
                priceMxn: basePrice,
            });

            await fireEvent(isRenewal ? 'membership.renewed' : 'member.verified', {
                workspaceId,
                userId: user.id,
                membershipId: membership.id,
                plan,
                billingCycle: billing_cycle,
            });

            return {
                user_id: user.id,
                membership_id: membership.id,
                payment_id: payment.id,
                init_point: null,
                amount_mxn: basePrice,
            };
        }

        // MP_LINK
        const payment = await prisma.payment.create({
            data: {
                workspace_id: workspaceId,
                user_id: user.id,
                amount: basePrice,
                type: 'MEMBERSHIP',
                reference: `${plan}:${billing_cycle}:RENEW_WALKIN`,
                description: `Renovación walk-in ${plan} ${billing_cycle}`,
                status: 'PENDING',
                metadata: {
                    plan,
                    billing_cycle,
                    walkin: true,
                    renewal: true,
                    payment_method,
                    cashier_id: req.user.sub || req.user.id,
                },
            },
        });

        const mpPref = await createPreference(
            buildMembershipPrefArgs({
                user,
                plan,
                billingCycle: billing_cycle,
                amount: basePrice,
                paymentId: payment.id,
            })
        );
        await prisma.payment.update({
            where: { id: payment.id },
            data: { mp_preference_id: mpPref.preferenceId },
        });

        return {
            user_id: user.id,
            membership_id: null,
            payment_id: payment.id,
            init_point: mpPref.init_point,
            sandbox_init_point: mpPref.sandbox_init_point,
            amount_mxn: basePrice,
        };
    });

    // ─── POST /staff/enroll-course ───────────────────────────────
    fastify.post('/staff/enroll-course', guard, async (req) => {
        const parsed = enrollBody.safeParse(req.body);
        if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
        const { user_id, course_id, payment_method } = parsed.data;

        const user = await prisma.user.findUnique({ where: { id: user_id } });
        if (!user) throw err('USER_NOT_FOUND', 'Socio no encontrado', 404);

        const course = await prisma.course.findUnique({ where: { id: course_id } });
        if (!course) throw err('COURSE_NOT_FOUND', 'Curso no encontrado', 404);
        if (!course.published) throw err('COURSE_NOT_PUBLISHED', 'Curso no disponible', 400);
        if (course.enrolled >= course.capacity) {
            throw err('COURSE_FULL', 'Curso lleno', 409);
        }

        const duplicate = await prisma.payment.findFirst({
            where: {
                user_id: user.id,
                type: 'COURSE',
                reference: course.id,
                status: 'APPROVED',
            },
        });
        if (duplicate) throw err('ALREADY_ENROLLED', 'El socio ya está inscrito', 409);

        const isOffline = payment_method === 'CASH' || payment_method === 'CARD_TERMINAL';

        if (isOffline) {
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: course.workspace_id,
                    user_id: user.id,
                    amount: course.price_mxn,
                    type: 'COURSE',
                    reference: course.id,
                    description: `Inscripción walk-in curso: ${course.name}`,
                    status: 'APPROVED',
                    paid_at: new Date(),
                    metadata: {
                        course_id: course.id,
                        course_name: course.name,
                        walkin: true,
                        payment_method,
                        cashier_id: req.user.sub || req.user.id,
                    },
                },
            });

            await prisma.course.update({
                where: { id: course.id },
                data: { enrolled: { increment: 1 } },
            });

            await fireEvent('course.enrolled', {
                workspaceId: course.workspace_id,
                userId: user.id,
                courseId: course.id,
                amount: course.price_mxn,
            });

            return {
                user_id: user.id,
                course_id: course.id,
                payment_id: payment.id,
                init_point: null,
                amount_mxn: course.price_mxn,
            };
        }

        // MP_LINK — webhook does the enrolled++ after approve.
        const payment = await prisma.payment.create({
            data: {
                workspace_id: course.workspace_id,
                user_id: user.id,
                amount: course.price_mxn,
                type: 'COURSE',
                reference: course.id,
                description: `Inscripción walk-in curso: ${course.name}`,
                status: 'PENDING',
                metadata: {
                    course_id: course.id,
                    course_name: course.name,
                    walkin: true,
                    payment_method,
                    cashier_id: req.user.sub || req.user.id,
                },
            },
        });

        const mpPref = await createPreference(
            buildCoursePrefArgs({ user, course, paymentId: payment.id })
        );
        await prisma.payment.update({
            where: { id: payment.id },
            data: { mp_preference_id: mpPref.preferenceId },
        });

        return {
            user_id: user.id,
            course_id: course.id,
            payment_id: payment.id,
            init_point: mpPref.init_point,
            sandbox_init_point: mpPref.sandbox_init_point,
            amount_mxn: course.price_mxn,
        };
    });
}
