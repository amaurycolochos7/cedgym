// ═══════════════════════════════════════════════════════════════
// CED-GYM — Auth module
// Endpoints:
//   POST   /auth/register
//   POST   /auth/verify-register
//   PATCH  /auth/complete-profile
//   POST   /auth/login
//   POST   /auth/refresh
//   POST   /auth/logout
//   POST   /auth/password/forgot
//   POST   /auth/password/reset
//   POST   /auth/otp/resend
//   GET    /auth/me
// ═══════════════════════════════════════════════════════════════
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import dayjs from 'dayjs';

// ── Auth tunables ────────────────────────────────────────────
// Single source of truth for bcrypt cost — every password hash in
// this module (register, password reset, reset-via-link, etc.) goes
// through BCRYPT_COST so a future bump (12 → 13) lifts the floor in
// one place instead of N.
const BCRYPT_COST = 12;
// Pre-baked hash used in the login flow when the user is missing,
// so the response time is constant regardless of whether the
// account exists. Compare against this with bcrypt.compare and
// discard the result. hashSync at module load time keeps the
// runtime path zero-cost. Cost matches BCRYPT_COST so timing is
// identical to a real comparison.
const DUMMY_HASH = bcrypt.hashSync('login-timing-equalizer', BCRYPT_COST);
// Login lockout policy.
const LOGIN_FAIL_THRESHOLD = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000; // 15 min

import { errPayload } from '../lib/errors.js';
import {
    generateOtpCode,
    hashOtpCode,
    compareOtpCode,
    otpExpiresAt,
    sendOtpViaWhatsApp,
    checkAndBumpOtpRateLimit,
    OTP_MAX_ATTEMPTS,
} from '../lib/otp.js';
import { scheduleWelcomeDrip } from '../lib/welcome-drip.js';
import {
    signAccess,
    mintRefreshToken,
    hashRefreshToken,
    compareRefreshToken,
    refreshCookieOptions,
    REFRESH_COOKIE_NAME,
    REFRESH_TTL_SEC,
    ttlForRole,
    signWelcomeToken,
    verifyWelcomeToken,
} from '../lib/jwt.js';
import { audit, auditCtx } from '../lib/audit.js';

// ── Zod schemas ──────────────────────────────────────────────
// E.164 internacional: "+" + 7-15 dígitos, primero 1-9. Acepta MX
// y cualquier otro país que el PhoneInput del front soporte.
const phoneSchema = z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Teléfono inválido (elige país y escribe tu número completo)');

const passwordSchema = z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    // 128 chars is well past every real-world password manager output
    // and bounds the bcrypt input so an attacker can't trickle a 1 GB
    // body through register/reset to pin a bcrypt worker.
    .max(128, 'La contraseña no puede exceder 128 caracteres')
    .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra')
    .regex(/[0-9]/, 'La contraseña debe incluir al menos un número');

const registerSchema = z.object({
    name: z.string().trim().min(2).max(80),
    email: z
        .string()
        .email()
        .transform((s) => s.trim().toLowerCase())
        .optional()
        .or(z.literal('').transform(() => undefined)),
    phone: phoneSchema,
    password: passwordSchema,
});

const verifyRegisterSchema = z.object({
    phone: phoneSchema,
    code: z.string().regex(/^\d{6}$/, 'El código debe ser de 6 dígitos'),
});

const completeProfileSchema = z.object({
    full_name: z.string().trim().min(2).max(120).optional(),
    birth_date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_SAY']).optional(),
});

const loginSchema = z.object({
    phone: phoneSchema.optional(),
    email: z.string().email().transform((s) => s.trim().toLowerCase()).optional(),
    identifier: z.string().min(1).optional(), // frontend convenience: email OR phone
    password: z.string().min(1),
}).transform((d) => {
    // Si viene identifier, normalizamos a phone o email automáticamente
    if (d.identifier && !d.email && !d.phone) {
        const ident = d.identifier.trim();
        if (ident.includes('@')) {
            d.email = ident.toLowerCase();
        } else {
            // digits-only? asume +52
            const digits = ident.replace(/\D/g, '');
            if (digits.length === 10) d.phone = `+52${digits}`;
            else if (ident.startsWith('+')) d.phone = ident;
        }
    }
    return d;
}).refine((d) => d.phone || d.email, {
    message: 'Debes proporcionar phone, email o identifier',
});

const forgotSchema = z.object({ phone: phoneSchema });

const resetSchema = z.object({
    phone: phoneSchema,
    code: z.string().regex(/^\d{6}$/),
    new_password: passwordSchema,
});

// Magic-link reset: ref = OtpCode.id (cuid), token = the raw secret the
// admin sent over WhatsApp. Both required — knowing only one is useless.
const resetLinkSchema = z.object({
    ref: z.string().min(8).max(40),
    token: z.string().min(20).max(200),
    new_password: passwordSchema,
});

const resendSchema = z.object({
    phone: phoneSchema,
    purpose: z.enum(['REGISTER', 'PASSWORD_RESET', 'LOGIN_2FA', 'PHONE_CHANGE']),
});

// PATCH /auth/me — self-service edits to name + email. Phone edits go
// through the OTP-verified /auth/phone/change flow. Email is optional
// (sparse UNIQUE in Postgres treats NULL as distinct, so clearing it
// is safe for multiple users).
const updateMeSchema = z.object({
    full_name: z.string().trim().min(2).max(120).optional(),
    email: z
        .union([
            z.string().trim().email(),
            z.literal(''),
            z.null(),
        ])
        .optional()
        .transform((v) => {
            if (v === '' || v === null) return null;
            return v?.toLowerCase();
        }),
    // Política 2026-05: la fecha de nacimiento es obligatoria para
    // comprar membresía. Aceptamos ISO datetime o YYYY-MM-DD del
    // <input type="date"> del FE.
    birth_date: z
        .string()
        .datetime()
        .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
        .optional(),
});

const phoneChangeStartSchema = z.object({
    new_phone: phoneSchema,
});

const phoneChangeConfirmSchema = z.object({
    new_phone: phoneSchema,
    code: z.string().regex(/^\d{6}$/, 'El código debe ser de 6 dígitos'),
});

// ── Helpers ──────────────────────────────────────────────────
function sanitizeUser(user) {
    if (!user) return null;
    const { password_hash, ...rest } = user;
    return rest;
}

// Issue a fresh access + refresh token pair for a user. The refresh
// token gets persisted (hashed) so it can be rotated/revoked. Both
// tokens are returned; the caller is responsible for setting the
// cookie and picking what to put in the JSON body.
async function issueTokens(fastify, request, user) {
    const access = signAccess(fastify, user);
    const refreshRaw = mintRefreshToken();
    const refreshHash = await hashRefreshToken(refreshRaw);
    const { refresh: refreshTtl } = ttlForRole(user.role);
    await fastify.prisma.refreshToken.create({
        data: {
            user_id: user.id,
            token_hash: refreshHash,
            expires_at: new Date(Date.now() + refreshTtl * 1000),
            user_agent: request.headers['user-agent'] || null,
            ip_address: request.ip || null,
        },
    });
    return { access, refreshRaw };
}

// Cookie -> { record, matched } OR null. Because the refresh token
// is bcrypt-hashed y opaco, no sabemos a qué fila pertenece sin
// bcrypt-comparar contra cada candidato.
//
// CAUSA RAÍZ del bug de sesiones cerradas: antes traíamos los 20
// tokens más recientes GLOBALES (de todos los usuarios). Con varios
// socios activos —sobre todo tras un deploy, cuando la API reinicia
// y todos renuevan token a la vez— el refresh token de un usuario
// "viejo" se caía del top 20, /auth/refresh devolvía 401 y el
// frontend cerraba la sesión.
//
// FIX: cuando se conoce el `userId` (extraído del access token
// caducado que el cliente manda en el header Authorization), se
// acota la búsqueda a ese usuario — por usuario hay poquísimas
// filas activas (≈1 por dispositivo), así que take:50 sobra.
// Si NO viene userId (fallback retrocompat, p.ej. clientes que aún
// no mandan el access token), se mantiene el escaneo global pero
// con take:200 para reducir el riesgo en lo que todos los clientes
// se actualizan.
async function findRefreshTokenRow(prisma, rawToken, userId = null) {
    if (!rawToken) return null;
    const candidates = await prisma.refreshToken.findMany({
        where: {
            // Acota por usuario cuando se conoce — esto es lo que
            // evita que el token se caiga del top-N global.
            ...(userId ? { user_id: userId } : {}),
            revoked_at: null,
            expires_at: { gt: new Date() },
        },
        orderBy: { created_at: 'desc' },
        take: userId ? 50 : 200,
    });
    for (const row of candidates) {
        if (await compareRefreshToken(rawToken, row.token_hash)) {
            return row;
        }
    }
    return null;
}

// Extrae el user_id (sub) del access token caducado que el cliente
// manda en `Authorization: Bearer <token>`. El access token es un
// JWT firmado con JWT_SECRET; aunque esté expirado, la FIRMA sigue
// siendo válida, así que lo verificamos ignorando la expiración
// solo para sacar el `sub` y acotar la búsqueda del refresh token.
// Si no hay token, la firma es inválida o cualquier otro fallo,
// devolvemos null y el caller cae al fallback (escaneo global).
function userIdFromExpiredAccessToken(fastify, request) {
    try {
        const authHeader = request.headers?.authorization || '';
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7).trim()
            : null;
        if (!token) return null;
        const decoded = fastify.jwt.verify(token, { ignoreExpiration: true });
        return decoded?.sub || null;
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// Mounted by @fastify/autoload at /auth (via `autoPrefix`).
export const autoPrefix = '/auth';

export default async function authRoutes(fastify) {
    const { prisma, redis } = fastify;

    // ── POST /auth/register ─────────────────────────────────
    fastify.post(
        '/register',
        {
            config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
        },
        async (request, reply) => {
            const parsed = registerSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
            }
            const { name, email, phone, password } = parsed.data;

            // Pre-check uniqueness so we can give a clean error. The DB
            // unique constraint is the real gate — but checking first
            // avoids an ugly P2002. Email is optional; only include it
            // in the OR when present.
            const existing = await prisma.user.findFirst({
                where: {
                    OR: [{ phone }, ...(email ? [{ email }] : [])],
                },
                select: { id: true, email: true, phone: true, status: true },
            });
            if (existing) {
                // Política: si el teléfono o email ya existe, NUNCA mandamos
                // OTP ni creamos usuario nuevo. El frontend abre un modal
                // ofreciendo recuperar contraseña (usa /auth/password/forgot
                // para enviar el OTP al dueño real del número).
                return reply.status(409).send(
                    errPayload(
                        'USER_EXISTS',
                        'Ese teléfono o correo ya tiene una cuenta. Recupera tu contraseña.',
                        409,
                    ),
                );
            }

            const workspace_id = fastify.defaultWorkspaceId;
            if (!workspace_id) {
                fastify.log.error('[register] defaultWorkspaceId not initialized — run seed first');
                return reply.status(500).send(errPayload('NO_WORKSPACE', 'Workspace default no inicializado', 500));
            }

            const password_hash = await bcrypt.hash(password, BCRYPT_COST);

            // Upsert-like: if UNVERIFIED dup, update the password + name;
            // otherwise create fresh. Schema guarantees email/phone unique.
            const user = existing
                ? await prisma.user.update({
                      where: { id: existing.id },
                      data: {
                          name,
                          password_hash,
                          status: 'UNVERIFIED',
                      },
                  })
                : await prisma.user.create({
                      data: {
                          workspace_id,
                          name,
                          email,
                          phone,
                          password_hash,
                          status: 'UNVERIFIED',
                      },
                  });

            const code = generateOtpCode();
            const code_hash = await hashOtpCode(code);
            await prisma.otpCode.create({
                data: {
                    phone,
                    code_hash,
                    purpose: 'REGISTER',
                    expires_at: otpExpiresAt(),
                    max_attempts: OTP_MAX_ATTEMPTS,
                },
            });

            const sendResult = await sendOtpViaWhatsApp({
                workspaceId: workspace_id,
                phone,
                code,
                purpose: 'REGISTER',
                logger: fastify.log,
            });

            audit(fastify, {
                workspace_id,
                actor_id: user.id,
                action: 'auth.register.requested',
                target_type: 'user',
                target_id: user.id,
                metadata: { otp_sent: sendResult.ok, otp_error: sendResult.error || null },
                ...auditCtx(request),
            });

            // Si el bot de WhatsApp no pudo enviar el código (sesión caída,
            // 503 del bot, timeout, etc.), NO mentimos diciendo "código
            // enviado". Antes devolvíamos success: true y el frontend
            // empujaba al usuario a la pantalla de verificar — el código
            // nunca llegaba y el socio quedaba atorado. Hacemos rollback
            // del user+OTP recién creados para que un retry quede limpio
            // (sin chocar contra USER_EXISTS) y devolvemos 503.
            if (!sendResult.ok) {
                fastify.log.warn(
                    { phone, err: sendResult.error },
                    '[register] WhatsApp send failed — rolling back user+OTP',
                );
                await prisma.otpCode
                    .deleteMany({ where: { phone, purpose: 'REGISTER' } })
                    .catch((e) =>
                        fastify.log.warn({ err: e }, '[register] rollback otp delete failed'),
                    );
                await prisma.user
                    .delete({ where: { id: user.id } })
                    .catch((e) =>
                        fastify.log.warn({ err: e }, '[register] rollback user delete failed'),
                    );
                return reply.status(503).send(
                    errPayload(
                        'OTP_DELIVERY_FAILED',
                        'No pudimos enviar el código por WhatsApp. Verifica tu número e intenta de nuevo en 1-2 minutos.',
                        503,
                    ),
                );
            }

            return reply.send({
                success: true,
                message: 'Código enviado a tu WhatsApp',
                userId: user.id,
            });
        }
    );

    // ── POST /auth/verify-register ──────────────────────────
    fastify.post('/verify-register', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '15 minutes',
                keyGenerator: (req) => req.body?.phone || req.ip,
            },
        },
    }, async (request, reply) => {
        const parsed = verifyRegisterSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
        }
        const { phone, code } = parsed.data;

        const otp = await prisma.otpCode.findFirst({
            where: { phone, purpose: 'REGISTER', verified_at: null },
            orderBy: { created_at: 'desc' },
        });
        if (!otp) {
            return reply.status(400).send(errPayload('OTP_NOT_FOUND', 'Código no encontrado. Solicita uno nuevo.'));
        }
        if (otp.expires_at < new Date()) {
            return reply.status(400).send(errPayload('OTP_EXPIRED', 'El código expiró. Solicita uno nuevo.'));
        }
        if (otp.attempts >= otp.max_attempts) {
            return reply.status(429).send(errPayload('TOO_MANY_ATTEMPTS', 'Demasiados intentos. Solicita un nuevo código.', 429));
        }

        const match = await compareOtpCode(code, otp.code_hash);
        if (!match) {
            await prisma.otpCode.update({
                where: { id: otp.id },
                data: { attempts: { increment: 1 } },
            });
            return reply.status(400).send(errPayload('OTP_INVALID', 'Código incorrecto'));
        }

        const user = await prisma.user.findUnique({ where: { phone } });
        if (!user) {
            return reply.status(404).send(errPayload('USER_NOT_FOUND', 'Usuario no encontrado'));
        }

        // Atomic: mark OTP verified + activate user.
        const [updatedUser] = await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: {
                    status: 'ACTIVE',
                    phone_verified_at: new Date(),
                    last_login_at: new Date(),
                },
            }),
            prisma.otpCode.update({
                where: { id: otp.id },
                data: { verified_at: new Date() },
            }),
        ]);

        const { access, refreshRaw } = await issueTokens(fastify, request, updatedUser);

        audit(fastify, {
            workspace_id: updatedUser.workspace_id,
            actor_id: updatedUser.id,
            action: 'auth.register.verified',
            target_type: 'user',
            target_id: updatedUser.id,
            ...auditCtx(request),
        });

        reply.setCookie(REFRESH_COOKIE_NAME, refreshRaw, refreshCookieOptions(updatedUser.role));

        // Schedule the welcome WhatsApp for T+2min via AutomationJob.
        // Restart-safe (DB-backed) and won't block the login response.
        // On queue failure we silently ignore — the drip is nice-to-have.
        scheduleWelcomeDrip({ user: updatedUser, logger: request.log }).catch(() => {});

        return reply.send({
            success: true,
            token: access,
            access_token: access,
            refresh_token: refreshRaw,
            user: sanitizeUser(updatedUser),
        });
    });

    // ── PATCH /auth/complete-profile ────────────────────────
    fastify.patch(
        '/complete-profile',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const parsed = completeProfileSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
            }
            const data = parsed.data;
            const userId = request.user.sub;

            const userUpdates = {};
            if (data.full_name) userUpdates.full_name = data.full_name;
            if (data.gender) userUpdates.gender = data.gender;
            if (data.birth_date) userUpdates.birth_date = new Date(data.birth_date);
            // Flag always flipped — even an empty body is a signal the
            // user chose to skip, and we don't want to keep nagging.
            userUpdates.profile_completed = true;

            const result = await prisma.user.update({
                where: { id: userId },
                data: userUpdates,
            });

            audit(fastify, {
                workspace_id: result.workspace_id,
                actor_id: result.id,
                action: 'auth.profile.completed',
                target_type: 'user',
                target_id: result.id,
                ...auditCtx(request),
            });

            return reply.send({ success: true, user: sanitizeUser(result) });
        }
    );

    // ── POST /auth/login ────────────────────────────────────
    // Hardened: per-IP rate-limit + per-user lockout + timing equalisation.
    // We deliberately collapse every "this didn't work" path (no such
    // user, wrong password, locked, suspended, unverified) onto the
    // same generic 401 so an attacker can't enumerate accounts or
    // detect lockouts. Status differentiation only happens when bcrypt
    // succeeded — past that point we trust the user is the real owner.
    fastify.post(
        '/login',
        {
            config: {
                rateLimit: {
                    // 5/15min era demasiado agresivo: un socio que se
                    // equivoca al teclear su contraseña 5 veces queda
                    // bloqueado 15 min sin saber por qué (el response
                    // viejo decía solo "Error"). 20/15min sigue
                    // protegiendo contra fuerza bruta — un atacante
                    // serio prueba miles, no veintenas — pero da
                    // margen al socio normal.
                    // El lockout por usuario (failed_login_attempts) en
                    // BD ya bloquea cuentas individuales tras 5
                    // intentos, así que la rate limit por IP solo
                    // existe para frenar scripts.
                    max: process.env.NODE_ENV === 'development' ? 200 : 20,
                    timeWindow: '15 minutes',
                    // Mensaje claro y accionable. Sin esto el plugin
                    // por default devuelve { code:"INTERNAL", message:"Error" }
                    // que es opaco para el usuario final.
                    errorResponseBuilder: (_req, ctx) => ({
                        error: {
                            code: 'TOO_MANY_LOGIN_ATTEMPTS',
                            message: `Demasiados intentos. Espera ${Math.ceil((ctx?.ttl ?? 900_000) / 60_000)} min e intenta de nuevo.`,
                        },
                        statusCode: 429,
                    }),
                },
            },
        },
        async (request, reply) => {
            const parsed = loginSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
            }
            const { phone, email, password } = parsed.data;

            const user = await prisma.user.findFirst({
                where: phone ? { phone } : { email },
            });

            // Branch-equalising bcrypt call. When the user doesn't
            // exist we still spend ~bcrypt time so the response
            // doesn't leak account existence by timing. The dummy
            // hash uses the same cost factor as a real one.
            if (!user) {
                await bcrypt.compare(password, DUMMY_HASH);
                return reply.status(401).send(errPayload('INVALID_CREDENTIALS', 'Credenciales inválidas', 401));
            }

            // Lockout check BEFORE bcrypt — once locked, every attempt
            // is refused for free. We still log the attempt and we
            // *don't* tell the user they're locked (that's enumeration
            // too). On the user side the message is identical to a
            // wrong-password response, so a legitimate user just sees
            // "Credenciales inválidas" and waits 15 min.
            if (user.locked_until && user.locked_until > new Date()) {
                audit(fastify, {
                    workspace_id: user.workspace_id,
                    actor_id: user.id,
                    action: 'auth.login.failed',
                    target_type: 'user',
                    target_id: user.id,
                    metadata: { reason: 'locked', until: user.locked_until.toISOString() },
                    ...auditCtx(request),
                });
                // Anti-enumeration tradeoff: para que el socio sepa qué
                // hacer cuando su cuenta queda bloqueada, devolvemos
                // ACCOUNT_LOCKED + timestamp/segundos restantes. Esto
                // confirma a un atacante que el user existe, pero solo
                // DESPUÉS de que alguien gastó 5 intentos en el mismo
                // número — costo no trivial. A cambio el socio ve un
                // cronómetro real y un CTA de "recupera contraseña" en
                // lugar del genérico "credenciales inválidas".
                const retryAfterSec = Math.max(
                    0,
                    Math.ceil((user.locked_until.getTime() - Date.now()) / 1000),
                );
                return reply.status(401).send({
                    error: {
                        code: 'ACCOUNT_LOCKED',
                        message:
                            'Cuenta bloqueada temporalmente por intentos fallidos. ' +
                            'Vuelve a intentar más tarde o recupera tu contraseña.',
                        locked_until: user.locked_until.toISOString(),
                        retry_after_sec: retryAfterSec,
                    },
                });
            }

            const valid = await bcrypt.compare(password, user.password_hash);
            if (!valid) {
                // Bump failed counter; lock if we just hit the threshold.
                const nextCount = (user.failed_login_attempts ?? 0) + 1;
                const shouldLock = nextCount >= LOGIN_FAIL_THRESHOLD;
                await prisma.user.update({
                    where: { id: user.id },
                    data: shouldLock
                        ? {
                              failed_login_attempts: 0,
                              locked_until: new Date(Date.now() + LOGIN_LOCK_MS),
                          }
                        : { failed_login_attempts: nextCount },
                });
                audit(fastify, {
                    workspace_id: user.workspace_id,
                    actor_id: user.id,
                    action: 'auth.login.failed',
                    target_type: 'user',
                    target_id: user.id,
                    metadata: {
                        reason: 'wrong_password',
                        attempts: nextCount,
                        locked: shouldLock,
                    },
                    ...auditCtx(request),
                });
                return reply.status(401).send(errPayload('INVALID_CREDENTIALS', 'Credenciales inválidas', 401));
            }

            // Password check passed — *now* we can branch on status,
            // because at this point the caller has proven account
            // ownership and status differentiation is no longer an
            // enumeration leak.
            if (user.status !== 'ACTIVE') {
                if (user.status === 'UNVERIFIED') {
                    return reply.status(403).send(errPayload('UNVERIFIED', 'Debes verificar tu cuenta primero', 403));
                }
                if (user.status === 'SUSPENDED') {
                    return reply.status(403).send(errPayload('SUSPENDED', 'Tu cuenta está suspendida', 403));
                }
                return reply.status(403).send(errPayload('USER_INACTIVE', 'Cuenta no disponible', 403));
            }

            // Successful login: reset lockout state + bump last_login_at
            // in one write.
            const resetData = { last_login_at: new Date() };
            if (user.failed_login_attempts > 0) resetData.failed_login_attempts = 0;
            if (user.locked_until) resetData.locked_until = null;
            const updated = await prisma.user.update({
                where: { id: user.id },
                data: resetData,
            });

            const { access, refreshRaw } = await issueTokens(fastify, request, updated);

            audit(fastify, {
                workspace_id: updated.workspace_id,
                actor_id: updated.id,
                action: 'auth.login',
                target_type: 'user',
                target_id: updated.id,
                ...auditCtx(request),
            });

            reply.setCookie(REFRESH_COOKIE_NAME, refreshRaw, refreshCookieOptions(updated.role));
            return reply.send({
                success: true,
                token: access,
                access_token: access,
                refresh_token: refreshRaw,
                user: sanitizeUser(updated),
            });
        }
    );

    // ── POST /auth/refresh ──────────────────────────────────
    fastify.post('/refresh', {
        config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
    }, async (request, reply) => {
        // Aceptamos el refresh token desde cookie (preferido, httpOnly) o
        // desde el body como fallback. El fallback permite que clientes que
        // no envían cookies (mobile nativo, tests) puedan refrescar.
        const raw =
            request.cookies?.[REFRESH_COOKIE_NAME] ||
            request.body?.refresh_token ||
            null;
        if (!raw) {
            return reply.status(401).send(errPayload('NO_REFRESH', 'No hay refresh token', 401));
        }
        // Sacamos el user_id del access token caducado para acotar la
        // búsqueda del refresh token a ese usuario (ver findRefreshTokenRow).
        // Si no viene o la firma es inválida, userId = null y se usa el
        // fallback de escaneo global.
        const userId = userIdFromExpiredAccessToken(fastify, request);
        const row = await findRefreshTokenRow(prisma, raw, userId);
        if (!row) {
            return reply.status(401).send(errPayload('REFRESH_INVALID', 'Refresh token inválido o expirado', 401));
        }
        const user = await prisma.user.findUnique({ where: { id: row.user_id } });
        if (!user || user.status !== 'ACTIVE') {
            return reply.status(401).send(errPayload('USER_INACTIVE', 'Usuario no disponible', 401));
        }

        // Rotation: revoke the old row, mint a new one. If anything fails
        // between the two writes we prefer a 500 over a partial state — a
        // transaction keeps both atomic.
        const newRaw = mintRefreshToken();
        const newHash = await hashRefreshToken(newRaw);
        await prisma.$transaction([
            prisma.refreshToken.update({
                where: { id: row.id },
                data: { revoked_at: new Date() },
            }),
            prisma.refreshToken.create({
                data: {
                    user_id: user.id,
                    token_hash: newHash,
                    expires_at: new Date(Date.now() + ttlForRole(user.role).refresh * 1000),
                    user_agent: request.headers['user-agent'] || null,
                    ip_address: request.ip || null,
                },
            }),
        ]);

        const access = signAccess(fastify, user);
        reply.setCookie(REFRESH_COOKIE_NAME, newRaw, refreshCookieOptions(user.role));
        return reply.send({ success: true, token: access, access_token: access });
    });

    // ── POST /auth/logout ───────────────────────────────────
    fastify.post('/logout', async (request, reply) => {
        const raw = request.cookies?.[REFRESH_COOKIE_NAME];
        if (raw) {
            // Igual que en /refresh: intentamos acotar por user_id sacado
            // del access token caducado. Si no hay token, userId = null y
            // el fallback global mantiene el logout funcionando.
            const userId = userIdFromExpiredAccessToken(fastify, request);
            const row = await findRefreshTokenRow(prisma, raw, userId);
            if (row) {
                await prisma.refreshToken.update({
                    where: { id: row.id },
                    data: { revoked_at: new Date() },
                });
                audit(fastify, {
                    actor_id: row.user_id,
                    action: 'auth.logout',
                    target_type: 'user',
                    target_id: row.user_id,
                    ...auditCtx(request),
                });
            }
        }
        reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
        return reply.send({ success: true });
    });

    // ── POST /auth/password/forgot ──────────────────────────
    fastify.post(
        '/password/forgot',
        {
            config: {
                rateLimit: {
                    max: 5,
                    timeWindow: '15 minutes',
                    // Per-phone key blocks targeted spam against one
                    // user from a botnet — IP rotation no longer
                    // unlocks more codes for the same destination.
                    keyGenerator: (req) => req.body?.phone || req.ip,
                },
            },
        },
        async (request, reply) => {
            const parsed = forgotSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
            }
            const { phone } = parsed.data;

            const user = await prisma.user.findUnique({ where: { phone } });
            // Silent-success path: never reveal whether the number exists.
            // Aceptamos también UNVERIFIED — un socio que se quedó atorado
            // en el registro (bot caído, OTP perdido) puede recuperarse
            // por esta vía: si demuestra control del número (recibe y
            // escribe el OTP), /auth/password/reset le actualiza el
            // password Y le marca status=ACTIVE + phone_verified_at.
            // Excluimos SUSPENDED/DELETED a propósito — esos son
            // estados administrativos, no bugs.
            const ELIGIBLE_FOR_RESET = new Set(['ACTIVE', 'UNVERIFIED']);
            if (user && ELIGIBLE_FOR_RESET.has(user.status)) {
                const code = generateOtpCode();
                const code_hash = await hashOtpCode(code);
                await prisma.otpCode.create({
                    data: {
                        phone,
                        code_hash,
                        purpose: 'PASSWORD_RESET',
                        expires_at: otpExpiresAt(),
                        max_attempts: OTP_MAX_ATTEMPTS,
                    },
                });
                const sendResult = await sendOtpViaWhatsApp({
                    workspaceId: user.workspace_id,
                    phone,
                    code,
                    purpose: 'PASSWORD_RESET',
                    logger: fastify.log,
                });
                audit(fastify, {
                    workspace_id: user.workspace_id,
                    actor_id: user.id,
                    action: 'auth.password.forgot.requested',
                    target_type: 'user',
                    target_id: user.id,
                    metadata: {
                        user_status: user.status,
                        otp_sent: sendResult.ok,
                        otp_error: sendResult.error || null,
                    },
                    ...auditCtx(request),
                });
                // Mismo principio que /auth/register y /auth/otp/resend:
                // si el bot no logró entregar, devolver 503 honesto en
                // vez de mentir con success: true. Borramos la OTP
                // huérfana para que el siguiente intento empiece limpio.
                if (!sendResult.ok) {
                    await prisma.otpCode
                        .deleteMany({ where: { phone, purpose: 'PASSWORD_RESET', verified_at: null } })
                        .catch(() => null);
                    return reply.status(503).send(errPayload(
                        'OTP_DELIVERY_FAILED',
                        'No pudimos enviar el código por WhatsApp. Intenta de nuevo en 1-2 minutos.',
                        503,
                    ));
                }
            }
            return reply.send({ success: true });
        }
    );

    // ── POST /auth/password/reset ───────────────────────────
    // Was unrate-limited. Per-OTP attempt counter inside the route
    // caps to 5 guesses per OTP row — but without a request rate
    // limit, an attacker could keep requesting fresh OTPs (via
    // /password/forgot, also rate-limited) and burn 5 guesses per
    // code at line speed. 5 reset attempts per phone per 15 min is
    // the matching ceiling.
    fastify.post('/password/reset', {
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '15 minutes',
                keyGenerator: (req) => req.body?.phone || req.ip,
            },
        },
    }, async (request, reply) => {
        const parsed = resetSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
        }
        const { phone, code, new_password } = parsed.data;

        const otp = await prisma.otpCode.findFirst({
            where: { phone, purpose: 'PASSWORD_RESET', verified_at: null },
            orderBy: { created_at: 'desc' },
        });
        if (!otp) return reply.status(400).send(errPayload('OTP_NOT_FOUND', 'Código no encontrado'));
        if (otp.expires_at < new Date()) return reply.status(400).send(errPayload('OTP_EXPIRED', 'El código expiró'));
        if (otp.attempts >= otp.max_attempts) {
            return reply.status(429).send(errPayload('TOO_MANY_ATTEMPTS', 'Demasiados intentos', 429));
        }
        const match = await compareOtpCode(code, otp.code_hash);
        if (!match) {
            await prisma.otpCode.update({
                where: { id: otp.id },
                data: { attempts: { increment: 1 } },
            });
            return reply.status(400).send(errPayload('OTP_INVALID', 'Código incorrecto'));
        }

        const user = await prisma.user.findUnique({ where: { phone } });
        if (!user) return reply.status(404).send(errPayload('USER_NOT_FOUND', 'Usuario no encontrado'));

        const password_hash = await bcrypt.hash(new_password, BCRYPT_COST);

        // Si el user venía UNVERIFIED (registro abandonado por bot caído
        // o similar), aprovechamos la prueba de identidad del OTP para
        // activar la cuenta en la misma transacción. El OTP por WA prueba
        // control del número — exactamente la misma garantía que pide el
        // flujo de registro normal. Para users que ya estaban ACTIVE no
        // toca nada de esos campos.
        const userPatch = { password_hash };
        if (user.status === 'UNVERIFIED') {
            userPatch.status = 'ACTIVE';
            userPatch.phone_verified_at = new Date();
        }
        // Si el user estaba bloqueado por intentos fallidos (locked_until
        // o failed_login_attempts > 0), limpiamos esos campos: el OTP
        // por WhatsApp es una prueba de identidad MÁS FUERTE que la
        // contraseña — sería absurdo dejarlo bloqueado cuando acaba de
        // demostrar control del número y setear una contraseña nueva.
        if (user.locked_until) userPatch.locked_until = null;
        if (user.failed_login_attempts > 0) userPatch.failed_login_attempts = 0;

        // Revoke ALL existing refresh tokens — password change should log
        // out every other device.
        await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: userPatch,
            }),
            prisma.otpCode.update({
                where: { id: otp.id },
                data: { verified_at: new Date() },
            }),
            prisma.refreshToken.updateMany({
                where: { user_id: user.id, revoked_at: null },
                data: { revoked_at: new Date() },
            }),
        ]);

        audit(fastify, {
            workspace_id: user.workspace_id,
            actor_id: user.id,
            action: 'auth.password.reset',
            target_type: 'user',
            target_id: user.id,
            ...auditCtx(request),
        });

        return reply.send({ success: true });
    });

    // ── POST /auth/password/reset-via-link ──────────────────
    // Consumes the magic link the admin sent from /admin/miembros/:id/
    // reset-password. The link carries (ref, token) — ref is the
    // OtpCode row id, token is the raw secret. Both are validated, the
    // password is updated, all refresh tokens revoked.
    fastify.post('/password/reset-via-link', async (request, reply) => {
        const parsed = resetLinkSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
        }
        const { ref, token, new_password } = parsed.data;

        const otp = await prisma.otpCode.findUnique({ where: { id: ref } });
        if (!otp || otp.purpose !== 'PASSWORD_RESET_LINK') {
            return reply.status(400).send(errPayload('LINK_INVALID', 'El enlace no es válido o ya fue usado.'));
        }
        if (otp.verified_at) {
            return reply.status(400).send(errPayload('LINK_USED', 'Este enlace ya fue usado. Pídele otro al admin del gym.'));
        }
        if (otp.expires_at < new Date()) {
            return reply.status(400).send(errPayload('LINK_EXPIRED', 'Este enlace expiró. Pídele otro al admin del gym.'));
        }
        const match = await compareOtpCode(token, otp.code_hash);
        if (!match) {
            return reply.status(400).send(errPayload('LINK_INVALID', 'El enlace no es válido.'));
        }

        const user = await prisma.user.findUnique({ where: { phone: otp.phone } });
        if (!user) {
            return reply.status(404).send(errPayload('USER_NOT_FOUND', 'Usuario no encontrado'));
        }

        const password_hash = await bcrypt.hash(new_password, BCRYPT_COST);

        await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: { password_hash },
            }),
            prisma.otpCode.update({
                where: { id: otp.id },
                data: { verified_at: new Date() },
            }),
            prisma.refreshToken.updateMany({
                where: { user_id: user.id, revoked_at: null },
                data: { revoked_at: new Date() },
            }),
        ]);

        audit(fastify, {
            workspace_id: user.workspace_id,
            actor_id: user.id,
            action: 'auth.password.reset_via_link',
            target_type: 'user',
            target_id: user.id,
            ...auditCtx(request),
        });

        return reply.send({ success: true });
    });

    // ── POST /auth/otp/resend ───────────────────────────────
    // Custom Redis-based rate limit (cooldown + hourly cap by phone)
    // already lives inside the handler. We add a coarse @fastify
    // rate-limit on top as a per-IP ceiling — defence in depth so
    // an attacker can't hammer the route to find the cooldown gap.
    fastify.post('/otp/resend', {
        config: {
            rateLimit: { max: 20, timeWindow: '1 hour' },
        },
    }, async (request, reply) => {
        const parsed = resendSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
        }
        const { phone, purpose } = parsed.data;

        const rl = await checkAndBumpOtpRateLimit(redis, phone);
        if (!rl.ok) {
            return reply
                .status(429)
                .header('retry-after', String(rl.retryAfterSec))
                .send(errPayload(
                    rl.reason === 'cooldown' ? 'OTP_COOLDOWN' : 'OTP_HOURLY_LIMIT',
                    rl.reason === 'cooldown'
                        ? `Espera ${rl.retryAfterSec}s antes de pedir otro código`
                        : 'Demasiados códigos solicitados. Intenta en una hora.',
                    429
                ));
        }

        // Reuse existing valid OTP if present (same purpose, not expired,
        // not yet verified) — saves WhatsApp spend and avoids confusing
        // the user with multiple codes on their phone.
        const existing = await prisma.otpCode.findFirst({
            where: {
                phone,
                purpose,
                verified_at: null,
                expires_at: { gt: new Date() },
            },
            orderBy: { created_at: 'desc' },
        });

        let code;
        if (existing) {
            // We don't store the plaintext code — generate a fresh one
            // and UPDATE the same row so the user doesn't accumulate dead
            // OTPs in the table. Attempt counter resets.
            code = generateOtpCode();
            const code_hash = await hashOtpCode(code);
            await prisma.otpCode.update({
                where: { id: existing.id },
                data: {
                    code_hash,
                    attempts: 0,
                    expires_at: otpExpiresAt(),
                },
            });
        } else {
            code = generateOtpCode();
            const code_hash = await hashOtpCode(code);
            await prisma.otpCode.create({
                data: {
                    phone,
                    code_hash,
                    purpose,
                    expires_at: otpExpiresAt(),
                    max_attempts: OTP_MAX_ATTEMPTS,
                },
            });
        }

        const workspace_id = fastify.defaultWorkspaceId;
        const send = await sendOtpViaWhatsApp({
            workspaceId: workspace_id,
            phone,
            code,
            purpose,
            logger: fastify.log,
        });

        // Mismo principio que /auth/register: si el bot no logró
        // entregar, devolvemos 503 con un mensaje claro en vez de
        // mentir con success: true.
        if (!send.ok) {
            fastify.log.warn(
                { phone, purpose, err: send.error },
                '[otp/resend] WhatsApp send failed',
            );
            return reply.status(503).send(
                errPayload(
                    'OTP_DELIVERY_FAILED',
                    'No pudimos enviar el código por WhatsApp. Intenta de nuevo en 1-2 minutos.',
                    503,
                ),
            );
        }

        return reply.send({ success: true });
    });

    // ── GET /auth/me ────────────────────────────────────────
    fastify.get(
        '/me',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const userId = request.user.sub;
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: {
                    membership: true,
                    workspace: {
                        select: { id: true, slug: true, name: true, plan: true },
                    },
                },
            });
            if (!user) {
                return reply.status(404).send(errPayload('USER_NOT_FOUND', 'Usuario no encontrado', 404));
            }
            return reply.send({
                user: sanitizeUser(user),
                membership: user.membership || null,
                workspace: user.workspace || null,
                profile_completed: !!user.profile_completed,
            });
        }
    );

    // ── PATCH /auth/me ──────────────────────────────────────
    // Self-service edits for name + email. Phone lives behind the
    // OTP flow below because it's a login credential.
    fastify.patch(
        '/me',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const parsed = updateMeSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
            }
            const userId = request.user.sub;
            const updates = {};
            if (parsed.data.full_name !== undefined) updates.full_name = parsed.data.full_name;
            // email === null means "clear it"; undefined means "no change".
            // We don't run email verification in this product (email is
            // optional and not a login credential), so any change resets
            // email_verified_at to null.
            if (parsed.data.email !== undefined) {
                updates.email = parsed.data.email;
                updates.email_verified_at = null;
            }
            if (parsed.data.birth_date !== undefined) {
                updates.birth_date = new Date(parsed.data.birth_date);
            }

            // Any explicit save against the perfil page counts as
            // "profile completed" — same convention as /auth/complete-profile.
            // This silences the "Completa tu perfil" banner. Empty PATCH
            // bodies are accepted just to flip this flag, since the
            // perfil form may have nothing to change but the user still
            // wants the nag to go away.
            updates.profile_completed = true;

            let user;
            try {
                user = await prisma.user.update({
                    where: { id: userId },
                    data: updates,
                });
            } catch (e) {
                // P2002 on email @unique → someone else already has this email.
                if (e?.code === 'P2002') {
                    return reply.status(409).send(errPayload('EMAIL_TAKEN', 'Ese correo ya está registrado en otra cuenta'));
                }
                throw e;
            }

            audit(fastify, {
                workspace_id: user.workspace_id,
                actor_id: user.id,
                action: 'auth.profile.updated',
                target_type: 'user',
                target_id: user.id,
                ...auditCtx(request),
            });

            return reply.send({ success: true, user: sanitizeUser(user) });
        }
    );

    // ── POST /auth/phone/change/start ───────────────────────
    // Sends a 6-digit OTP via WhatsApp to the NEW phone number. The
    // OTP row lives under the new phone (not the current one) so the
    // confirm step can look it up the same way /auth/verify-register
    // does. Reuses the same rate-limit keys as other OTP flows.
    fastify.post(
        '/phone/change/start',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const parsed = phoneChangeStartSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
            }
            const { new_phone } = parsed.data;
            const userId = request.user.sub;

            const me = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, phone: true, workspace_id: true },
            });
            if (!me) {
                return reply.status(404).send(errPayload('USER_NOT_FOUND', 'Usuario no encontrado', 404));
            }
            if (me.phone === new_phone) {
                return reply.status(400).send(errPayload('SAME_PHONE', 'El nuevo teléfono es igual al actual'));
            }

            const collision = await prisma.user.findUnique({
                where: { phone: new_phone },
                select: { id: true },
            });
            if (collision && collision.id !== userId) {
                return reply.status(409).send(errPayload('PHONE_TAKEN', 'Ese teléfono ya está registrado en otra cuenta'));
            }

            const rl = await checkAndBumpOtpRateLimit(redis, new_phone);
            if (!rl.ok) {
                return reply
                    .status(429)
                    .header('retry-after', String(rl.retryAfterSec))
                    .send(errPayload(
                        rl.reason === 'cooldown' ? 'OTP_COOLDOWN' : 'OTP_HOURLY_LIMIT',
                        rl.reason === 'cooldown'
                            ? `Espera ${rl.retryAfterSec}s antes de pedir otro código`
                            : 'Demasiados códigos solicitados. Intenta en una hora.',
                        429
                    ));
            }

            // Reuse-or-create — same pattern as /auth/otp/resend.
            const existing = await prisma.otpCode.findFirst({
                where: {
                    phone: new_phone,
                    purpose: 'PHONE_CHANGE',
                    verified_at: null,
                    expires_at: { gt: new Date() },
                },
                orderBy: { created_at: 'desc' },
            });
            const code = generateOtpCode();
            const code_hash = await hashOtpCode(code);
            if (existing) {
                await prisma.otpCode.update({
                    where: { id: existing.id },
                    data: { code_hash, attempts: 0, expires_at: otpExpiresAt() },
                });
            } else {
                await prisma.otpCode.create({
                    data: {
                        phone: new_phone,
                        code_hash,
                        purpose: 'PHONE_CHANGE',
                        expires_at: otpExpiresAt(),
                        max_attempts: OTP_MAX_ATTEMPTS,
                    },
                });
            }

            const send = await sendOtpViaWhatsApp({
                workspaceId: me.workspace_id,
                phone: new_phone,
                code,
                purpose: 'PHONE_CHANGE',
                logger: fastify.log,
            });

            if (!send.ok) {
                fastify.log.warn(
                    { phone: new_phone, err: send.error },
                    '[phone/change/start] WhatsApp send failed',
                );
                return reply.status(503).send(
                    errPayload(
                        'OTP_DELIVERY_FAILED',
                        'No pudimos enviar el código por WhatsApp. Intenta de nuevo en 1-2 minutos.',
                        503,
                    ),
                );
            }

            return reply.send({ success: true });
        }
    );

    // ── POST /auth/phone/change/confirm ─────────────────────
    // Validates the code, updates user.phone, flips phone_verified_at,
    // and rotates refresh tokens so other devices re-auth with the
    // new number. Returns the sanitized user row.
    fastify.post(
        '/phone/change/confirm',
        { preHandler: [fastify.authenticate] },
        async (request, reply) => {
            const parsed = phoneChangeConfirmSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.status(400).send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
            }
            const { new_phone, code } = parsed.data;
            const userId = request.user.sub;

            const collision = await prisma.user.findUnique({
                where: { phone: new_phone },
                select: { id: true },
            });
            if (collision && collision.id !== userId) {
                return reply.status(409).send(errPayload('PHONE_TAKEN', 'Ese teléfono ya está registrado en otra cuenta'));
            }

            const otp = await prisma.otpCode.findFirst({
                where: {
                    phone: new_phone,
                    purpose: 'PHONE_CHANGE',
                    verified_at: null,
                    expires_at: { gt: new Date() },
                },
                orderBy: { created_at: 'desc' },
            });
            if (!otp) {
                return reply.status(400).send(errPayload('OTP_NOT_FOUND', 'Código no encontrado o expirado'));
            }
            if (otp.attempts >= otp.max_attempts) {
                return reply.status(429).send(errPayload('OTP_ATTEMPTS_EXCEEDED', 'Demasiados intentos. Pide un código nuevo.'));
            }

            const match = await compareOtpCode(code, otp.code_hash);
            if (!match) {
                await prisma.otpCode.update({
                    where: { id: otp.id },
                    data: { attempts: { increment: 1 } },
                });
                return reply.status(400).send(errPayload('OTP_INVALID', 'Código incorrecto'));
            }

            // Atomically: mark OTP used, flip the user's phone.
            const [, updatedUser] = await prisma.$transaction([
                prisma.otpCode.update({
                    where: { id: otp.id },
                    data: { verified_at: new Date() },
                }),
                prisma.user.update({
                    where: { id: userId },
                    data: {
                        phone: new_phone,
                        phone_verified_at: new Date(),
                    },
                }),
            ]);

            audit(fastify, {
                workspace_id: updatedUser.workspace_id,
                actor_id: updatedUser.id,
                action: 'auth.phone.changed',
                target_type: 'user',
                target_id: updatedUser.id,
                ...auditCtx(request),
            });

            return reply.send({ success: true, user: sanitizeUser(updatedUser) });
        }
    );

    // ── GET /auth/welcome/info?t=... ────────────────────────
    // Validates a walk-in welcome token and returns the user's name +
    // active membership snapshot, so the /welcome page can greet by
    // name and show "tu plan Pro está activo".
    fastify.get('/welcome/info', async (request, reply) => {
        const token = String(request.query?.t || '').trim();
        if (!token) {
            return reply
                .status(400)
                .send(errPayload('NO_TOKEN', 'Falta el token', 400));
        }
        let userId;
        let tokenVersion;
        try {
            ({ userId, version: tokenVersion } = verifyWelcomeToken(fastify, token));
        } catch {
            return reply
                .status(401)
                .send(errPayload('TOKEN_INVALID', 'Link inválido o expirado', 401));
        }
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { membership: true },
        });
        if (!user) {
            return reply
                .status(404)
                .send(errPayload('USER_NOT_FOUND', 'Usuario no encontrado', 404));
        }
        // Si recepción corrigió el teléfono después de mandar el link,
        // el token viejo apuntaba al número equivocado y debe quedar
        // invalidado. welcome_token_v se bumpea en correct-phone.
        if (tokenVersion !== (user.welcome_token_v ?? 0)) {
            return reply
                .status(401)
                .send(errPayload('TOKEN_INVALID', 'Link inválido o expirado', 401));
        }
        // has_password = "el socio ya configuró su cuenta" — usamos
        // last_login_at en lugar de password_hash porque staff-register
        // crea la cuenta con un password_hash temporal (bcrypt de un
        // string aleatorio que el socio nunca conoce, solo para
        // satisfacer la columna NOT NULL del schema). Si chequeamos
        // password_hash, el welcome saltaría el paso 1 (crear
        // contraseña) y el socio quedaría sin sesión válida al
        // intentar subir su selfie.
        return reply.send({
            user: {
                id: user.id,
                name: user.name,
                full_name: user.full_name,
                phone: user.phone,
                has_password: Boolean(user.last_login_at),
                has_selfie: Boolean(user.selfie_url),
            },
            membership: user.membership
                ? {
                      plan: user.membership.plan,
                      billing_cycle: user.membership.billing_cycle,
                      status: user.membership.status,
                      expires_at: user.membership.expires_at,
                  }
                : null,
        });
    });

    // ── POST /auth/welcome/redeem ───────────────────────────
    // Redeems the welcome token by setting the user's password (and
    // marking the phone as verified — they were physically at the
    // mostrador). Returns a fresh access + refresh pair so the page
    // can immediately log them in.
    const welcomeRedeemSchema = z.object({
        token: z.string().min(8),
        password: passwordSchema,
    });

    fastify.post('/welcome/redeem', async (request, reply) => {
        const parsed = welcomeRedeemSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply
                .status(400)
                .send(errPayload('VALIDATION', parsed.error.issues[0]?.message || 'Datos inválidos'));
        }
        const { token, password } = parsed.data;

        let userId;
        let tokenVersion;
        try {
            ({ userId, version: tokenVersion } = verifyWelcomeToken(fastify, token));
        } catch {
            return reply
                .status(401)
                .send(errPayload('TOKEN_INVALID', 'Link inválido o expirado', 401));
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return reply
                .status(404)
                .send(errPayload('USER_NOT_FOUND', 'Usuario no encontrado', 404));
        }
        if (tokenVersion !== (user.welcome_token_v ?? 0)) {
            return reply
                .status(401)
                .send(errPayload('TOKEN_INVALID', 'Link inválido o expirado', 401));
        }

        const password_hash = await bcrypt.hash(password, BCRYPT_COST);
        const updated = await prisma.user.update({
            where: { id: user.id },
            data: {
                password_hash,
                status: 'ACTIVE',
                phone_verified_at: user.phone_verified_at ?? new Date(),
                last_login_at: new Date(),
            },
        });

        const { access, refreshRaw } = await issueTokens(fastify, request, updated);

        audit(fastify, {
            workspace_id: updated.workspace_id,
            actor_id: updated.id,
            action: 'auth.welcome.redeem',
            target_type: 'user',
            target_id: updated.id,
            ...auditCtx(request),
        });

        reply.setCookie(
            REFRESH_COOKIE_NAME,
            refreshRaw,
            refreshCookieOptions(updated.role),
        );
        return reply.send({
            success: true,
            token: access,
            access_token: access,
            refresh_token: refreshRaw,
            user: sanitizeUser(updated),
        });
    });
}
