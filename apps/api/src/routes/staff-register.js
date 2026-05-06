// ─────────────────────────────────────────────────────────────────
// Staff — Walk-in register / renew / enroll.
// (workspace resolved via assertWorkspaceAccess from tenant-guard)
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
    INSCRIPTION_PRICE_MXN,
    planRequiresInscription,
    applyPromoToAmount,
} from '../lib/memberships.js';
// Staff-driven member registration with MP redirect flow not yet migrated
// to Stripe — stub throws at runtime if anyone hits the MP-pay paths.
// CASH / TERMINAL / COMPLIMENTARY / TRANSFER methods are unaffected.
function createPreference() {
    throw new Error('MP createPreference removed — Stripe migration pending for staff-driven MP register flow');
}
import { detectGender } from '../lib/gender.js';
import { signWelcomeToken } from '../lib/jwt.js';
import { assertWorkspaceAccess } from '../lib/tenant-guard.js';

// ─── Schemas ─────────────────────────────────────────────────────
const PAYMENT_METHODS = ['CASH', 'CARD_TERMINAL', 'MP_LINK'];
const PLAN_ENUM = ['STARTER', 'PRO', 'ELITE'];
const CYCLE_ENUM = ['MONTHLY'];

const registerBody = z.object({
    name: z.string().trim().min(2).max(200),
    phone: z.string().trim().regex(/^\+?\d{10,15}$/, 'Teléfono inválido'),
    email: z.string().email().optional(),
    // Recepción captura la fecha verbalmente al socio. Política
    // 2026-05: foto + fecha de nacimiento son obligatorias antes
    // de cualquier asignación de plan. La selfie no se puede
    // requerir aquí (el usuario aún no existe), pero birth_date sí.
    birth_date: z.string().datetime().or(z.string().date()),
    plan: z.enum(PLAN_ENUM),
    billing_cycle: z.enum(CYCLE_ENUM),
    payment_method: z.enum(PAYMENT_METHODS),
    promo_code: z.string().trim().min(1).max(64).optional(),
});

const extendBody = z.object({
    user_id: z.string().min(1),
    plan: z.enum(PLAN_ENUM).optional(),
    billing_cycle: z.enum(CYCLE_ENUM).optional(),
    payment_method: z.enum(PAYMENT_METHODS),
    promo_code: z.string().trim().min(1).max(64).optional(),
});

// Resolve a promo code in the staff cash flow. Throws err() on invalid
// so the caller can `await` cleanly. Returns the discount applied to
// the plan portion only — inscription is never discounted (matches the
// online flow's policy).
async function resolveCashPromo(prisma, code, basePrice) {
    if (!code) return { amount: basePrice, discount: 0, promo: null };
    const found = await prisma.promoCode.findUnique({ where: { code } });
    const res = applyPromoToAmount(found, basePrice, 'MEMBERSHIP');
    if (!res.valid) {
        throw err('PROMO_INVALID', `Promo inválido: ${res.reason}`, 400);
    }
    return {
        amount: res.final_amount,
        discount: res.discount_mxn,
        promo: res.promo,
    };
}

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

async function sendWalkinWelcome(fastify, { workspaceId, phone, name, welcomeLink, planName, receipt }) {
    const url = process.env.WHATSAPP_BOT_URL;
    const key = process.env.WHATSAPP_BOT_KEY;
    if (!url || !key) return { ok: false, error: 'bot_not_configured' };
    if (!workspaceId) {
        // Sin workspaceId el bot no puede resolver qué sesión usar
        // (1 bot por workspace) y devuelve 503. Bug histórico que
        // hacía que el WhatsApp de bienvenida nunca llegara.
        fastify.log.warn('[staff-register] sendWalkinWelcome called without workspaceId');
        return { ok: false, error: 'missing_workspace_id' };
    }

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

    // Recibo embebido: en walk-in unimos bienvenida + recibo en un
    // solo mensaje (antes mandábamos dos: este + payment.approved).
    // El usuario pidió unificar para no spamear al socio nuevo.
    const receiptBlock = receipt
        ? `\n*Recibo de pago*\n` +
          (receipt.amount != null ? `• Monto: $${Number(receipt.amount).toLocaleString('es-MX')} MXN\n` : '') +
          (receipt.method ? `• Método: ${receipt.method}\n` : '') +
          (receipt.expiresAt ? `• Vigencia hasta: ${receipt.expiresAt}\n` : '') +
          `\n`
        : '';

    const message =
        `${salutation}\n\n` +
        `${planLine}\n` +
        receiptBlock +
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
            body: JSON.stringify({ workspaceId, phone, message, template: 'member.welcome_walkin' }),
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
                    // El gym recobra manualmente cada ciclo. Sin esto la
                    // columna conserva su default true del schema y el
                    // sweep de recordatorios filtra al socio fuera de
                    // la lista de "renovar pronto".
                    auto_renew: false,
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
                auto_renew: false,
            },
        }),
        isRenewal: false,
    };
}

function buildMembershipPrefArgs({ user, plan, billingCycle, amount, inscriptionAmount = 0, paymentId }) {
    const planMeta = getPlanByCode(plan);
    const items = [
        {
            id: `${plan}_${billingCycle}`,
            title: `Membresía ${planMeta?.name || plan} — ${billingCycle}`,
            quantity: 1,
            unit_price: amount,
        },
    ];
    if (inscriptionAmount > 0) {
        items.push({
            id: 'INSCRIPTION_ONETIME',
            title: 'Inscripción única',
            quantity: 1,
            unit_price: inscriptionAmount,
        });
    }
    return {
        userId: user.id,
        type: 'MEMBERSHIP',
        reference: `${plan}:${billingCycle}`,
        items,
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
            includes_inscription: inscriptionAmount > 0,
            inscription_amount_mxn: inscriptionAmount,
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
        const workspaceId = assertWorkspaceAccess(req);

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
        const { name, email, plan, billing_cycle, payment_method, promo_code } = parsed.data;
        const phone = normalizePhone(parsed.data.phone);
        const birthDate = new Date(parsed.data.birth_date);
        if (Number.isNaN(birthDate.getTime())) {
            throw err('BAD_BODY', 'Fecha de nacimiento inválida', 400);
        }

        const workspaceId = assertWorkspaceAccess(req);
        if (!workspaceId) throw err('NO_WORKSPACE', 'Workspace no resuelto', 400);

        const basePrice = await getEffectivePlanPrice(prisma, workspaceId, plan, billing_cycle);
        if (basePrice == null) throw err('PLAN_INVALID', 'Plan o ciclo inválido', 400);

        // Promo discounts plan only — inscription is never discounted.
        const { amount: planAmount, discount, promo } = await resolveCashPromo(
            prisma,
            promo_code,
            basePrice,
        );

        // Inscription on first PRO/ELITE for a user that's never paid it.
        // For a brand-new walk-in registration the user obviously hasn't
        // paid before, so this collapses to plan vs plan+109.
        const inscriptionAmount = planRequiresInscription(plan)
            ? INSCRIPTION_PRICE_MXN
            : 0;
        const totalAmount = planAmount + inscriptionAmount;

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
        const passwordHash = await bcrypt.hash(tempPassword, 12);

        const user = await prisma.user.create({
            data: {
                workspace_id: workspaceId,
                name,
                full_name: name,
                email: email || null,
                phone,
                birth_date: birthDate,
                role: 'ATHLETE',
                status: 'ACTIVE',
                phone_verified_at: new Date(), // receptionist saw them in person
                password_hash: passwordHash,
                // Stamp inscription_paid_at on the same call when we're
                // about to charge the inscription, so the next renewal
                // (cash or online) sees them as already-paid.
                inscription_paid_at: inscriptionAmount > 0 ? new Date() : null,
            },
        });

        // Route cash / card-terminal → immediate activation.
        const isOffline = payment_method === 'CASH' || payment_method === 'CARD_TERMINAL';

        if (isOffline) {
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: workspaceId,
                    user_id: user.id,
                    amount: totalAmount,
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
                        base_price: basePrice,
                        plan_amount_mxn: planAmount,
                        discount_mxn: discount,
                        promo_code: promo?.code || null,
                        promo_id: promo?.id || null,
                        includes_inscription: inscriptionAmount > 0,
                        inscription_amount_mxn: inscriptionAmount,
                    },
                },
            });

            // Bump promo usage now that the cash payment landed.
            if (promo?.id) {
                try {
                    await prisma.promoCode.update({
                        where: { id: promo.id },
                        data: { used_count: { increment: 1 } },
                    });
                } catch (e) {
                    req.log.warn(
                        { err: e, promoId: promo.id },
                        '[staff-register] promo used_count bump failed'
                    );
                }
            }

            const { membership } = await activateMembershipNow(prisma, {
                user,
                plan,
                billingCycle: billing_cycle,
                priceMxn: planAmount,
            });

            // Walk-in NO dispara member.verified ni payment.approved.
            // En lugar de eso mandamos UN solo WhatsApp con la
            // bienvenida + recibo embebido + link /welcome?t=... para
            // que el socio cree contraseña y suba selfie (ver
            // sendWalkinWelcome abajo). Si firamos member.verified
            // aquí, la automation "Bienvenida al activar membresía"
            // mandaría un segundo mensaje que dice "ya puedes acceder
            // con tu QR" — pero es mentira: el socio todavía no tiene
            // contraseña ni selfie aprobada, así que NO puede entrar.
            // Para flujos online (Stripe checkout) sí se sigue
            // disparando porque el usuario ya tiene cuenta lista.

            // Welcome link — single-use signed token, valid 7 days. The
            // socio uses this to set their password + upload selfie.
            const welcomeToken = signWelcomeToken(fastify, user.id);
            const welcomeLink = `${webappPublicUrl()}/welcome?t=${encodeURIComponent(welcomeToken)}`;
            const planMeta = getPlanByCode(plan);
            const expiresFmt = (() => {
                try {
                    const d = membership?.expires_at ? new Date(membership.expires_at) : null;
                    if (!d || Number.isNaN(d.getTime())) return null;
                    return d.toLocaleDateString('es-MX', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                    });
                } catch {
                    return null;
                }
            })();

            // Fire-and-forget welcome con recibo embebido.
            sendWalkinWelcome(fastify, {
                workspaceId,
                phone,
                name,
                welcomeLink,
                planName: planMeta?.name || plan,
                receipt: {
                    amount: totalAmount,
                    method:
                        payment_method === 'CASH'
                            ? 'Efectivo'
                            : payment_method === 'CARD_TERMINAL'
                              ? 'Tarjeta en recepción'
                              : payment_method,
                    expiresAt: expiresFmt,
                },
            }).catch(() => {});

            return {
                user_id: user.id,
                membership_id: membership.id,
                payment_id: payment.id,
                welcome_link: welcomeLink,
                init_point: null,
                amount_mxn: totalAmount,
                plan_amount_mxn: planAmount,
                inscription_amount_mxn: inscriptionAmount,
                discount_mxn: discount,
            };
        }

        // MP_LINK → PENDING payment + preference, webhook activates.
        const payment = await prisma.payment.create({
            data: {
                workspace_id: workspaceId,
                user_id: user.id,
                amount: totalAmount,
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
                    base_price: basePrice,
                    plan_amount_mxn: planAmount,
                    discount_mxn: discount,
                    promo_code: promo?.code || null,
                    promo_id: promo?.id || null,
                    includes_inscription: inscriptionAmount > 0,
                    inscription_amount_mxn: inscriptionAmount,
                },
            },
        });

        const mpPref = await createPreference(
            buildMembershipPrefArgs({
                user,
                plan,
                billingCycle: billing_cycle,
                amount: planAmount,
                inscriptionAmount,
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
            workspaceId,
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
        const { user_id, payment_method, promo_code } = parsed.data;

        const user = await prisma.user.findUnique({ where: { id: user_id } });
        if (!user) throw err('USER_NOT_FOUND', 'Socio no encontrado', 404);

        // Profile gate — socio existente debe tener foto + fecha
        // de nacimiento antes de renovar. Si no, pídele que complete
        // su perfil en línea (portal/perfil) antes de cobrar.
        if (!user.selfie_url || !user.birth_date) {
            throw err(
                'PROFILE_INCOMPLETE',
                'El socio debe tener foto de perfil y fecha de nacimiento antes de renovar. Pídele que complete su perfil en /portal/perfil.',
                400,
                {
                    user_id: user.id,
                    missing_selfie: !user.selfie_url,
                    missing_birth_date: !user.birth_date,
                }
            );
        }

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

        // Renovación nunca cobra inscripción — el socio ya la pagó (o
        // está exento por backfill). Promo aplica solo al plan.
        const { amount, discount, promo } = await resolveCashPromo(
            prisma,
            promo_code,
            basePrice,
        );

        if (isOffline) {
            const payment = await prisma.payment.create({
                data: {
                    workspace_id: workspaceId,
                    user_id: user.id,
                    amount,
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
                        base_price: basePrice,
                        plan_amount_mxn: amount,
                        discount_mxn: discount,
                        promo_code: promo?.code || null,
                        promo_id: promo?.id || null,
                        includes_inscription: false,
                        inscription_amount_mxn: 0,
                    },
                },
            });

            if (promo?.id) {
                try {
                    await prisma.promoCode.update({
                        where: { id: promo.id },
                        data: { used_count: { increment: 1 } },
                    });
                } catch (e) {
                    req.log.warn(
                        { err: e, promoId: promo.id },
                        '[staff-register] promo used_count bump failed'
                    );
                }
            }

            const { membership, isRenewal } = await activateMembershipNow(prisma, {
                user,
                plan,
                billingCycle: billing_cycle,
                priceMxn: amount,
            });

            // Política 2026-05: si recepción cobró cash en mostrador,
            // el socio queda implícitamente "grandfathered" para la
            // inscripción única de $100. Si después intenta comprar
            // online por Stripe, el sistema lo detecta como ya pagado
            // y le cobra solo el plan ($630) en lugar de $730.
            // Idempotente: solo se estampa si está en null.
            if (!user.inscription_paid_at) {
                try {
                    await prisma.user.update({
                        where: { id: user.id, inscription_paid_at: null },
                        data: { inscription_paid_at: new Date() },
                    });
                } catch (e) {
                    req.log.warn(
                        { err: e?.message, userId: user.id },
                        '[staff-register] auto-stamp inscription_paid_at failed'
                    );
                }
            }

            // En cash NO disparamos payment.approved — para que el
            // socio reciba un solo mensaje. La plantilla
            // membership.renewed ya incluye monto + plan +
            // vencimiento (renderer arma `monto_pagado` desde
            // context.amount). Para flujos online sí se dispara
            // payment.approved porque el recibo Stripe es el
            // comprobante formal.
            const cashMethodLabel =
                payment_method === 'CASH'
                    ? 'Efectivo'
                    : payment_method === 'CARD_TERMINAL'
                      ? 'Tarjeta en recepción'
                      : payment_method;
            await fireEvent(isRenewal ? 'membership.renewed' : 'member.verified', {
                workspaceId,
                userId: user.id,
                membershipId: membership.id,
                plan,
                billingCycle: billing_cycle,
                amount,
                stripe: {
                    payment_method: cashMethodLabel,
                    paid_at: Date.now(),
                },
            });

            return {
                user_id: user.id,
                membership_id: membership.id,
                payment_id: payment.id,
                init_point: null,
                amount_mxn: amount,
                discount_mxn: discount,
            };
        }

        // MP_LINK
        const payment = await prisma.payment.create({
            data: {
                workspace_id: workspaceId,
                user_id: user.id,
                amount,
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
                    base_price: basePrice,
                    plan_amount_mxn: amount,
                    discount_mxn: discount,
                    promo_code: promo?.code || null,
                    promo_id: promo?.id || null,
                    includes_inscription: false,
                    inscription_amount_mxn: 0,
                },
            },
        });

        const mpPref = await createPreference(
            buildMembershipPrefArgs({
                user,
                plan,
                billingCycle: billing_cycle,
                amount,
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
            amount_mxn: amount,
            discount_mxn: discount,
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
