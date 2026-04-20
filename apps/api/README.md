# @cedgym/api

Fastify 5 backend for the CED-GYM ecosystem. Runs on port **3001**.

## Stack

- Fastify 5 + `@fastify/autoload`
- Prisma (shared via `@cedgym/db` workspace package)
- JWT access + rotating refresh tokens (cookie)
- bcryptjs for passwords and OTPs
- ioredis for OTP rate limiting
- WhatsApp OTP via the internal `@cedgym/whatsapp-bot` service (no Twilio)

## Scripts

```bash
pnpm dev     # node --watch
pnpm start   # production
pnpm seed    # create default workspace + superadmin + WA session placeholder
```

## Environment

Required:

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres DSN |
| `REDIS_URL` | e.g. `redis://redis:6379` |
| `JWT_SECRET` | HS256 signing secret — rotate in production |
| `WHATSAPP_BOT_URL` | e.g. `http://whatsapp-bot:3002` |
| `WHATSAPP_BOT_KEY` | shared with the bot's `API_KEY` |

Optional:

| Var | Default |
|---|---|
| `API_PORT` | `3001` |
| `API_HOST` | `0.0.0.0` |
| `CORS_ORIGINS` | comma-separated extra origins |
| `CORS_ALLOW_NO_ORIGIN` | `false` |
| `COOKIE_SECRET` | falls back to `JWT_SECRET` |
| `SEED_ADMIN_PASSWORD` | `CedGym2026!` |
| `LOG_LEVEL` | `info` |

## Layout

```
src/
├── index.js          # Fastify boot + autoload
├── plugins/
│   ├── prisma.js     # fastify.prisma
│   ├── redis.js      # fastify.redis
│   └── auth.js       # fastify.authenticate / requireRole
├── lib/
│   ├── errors.js     # err() thrown + errPayload() reply
│   ├── otp.js        # generate / hash / send via WhatsApp
│   ├── jwt.js        # access + refresh token helpers
│   └── audit.js      # best-effort AuditLog insert
├── routes/
│   └── auth.js       # autoPrefix '/auth'
└── seed.js           # default workspace + superadmin
```

## Auth endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Start signup, send REGISTER OTP via WhatsApp |
| POST | `/auth/verify-register` | Verify OTP, activate user, issue tokens |
| PATCH | `/auth/complete-profile` | Fill full_name / birth_date / emergency contact |
| POST | `/auth/login` | Password login (phone OR email) |
| POST | `/auth/refresh` | Rotate refresh cookie, issue new access token |
| POST | `/auth/logout` | Revoke refresh token + clear cookie |
| POST | `/auth/password/forgot` | Send PASSWORD_RESET OTP (silent success) |
| POST | `/auth/password/reset` | Set new password, revoke all refresh tokens |
| POST | `/auth/otp/resend` | Resend OTP (cooldown 60s / 5 per hour per phone) |
| GET | `/auth/me` | Current user + membership + profile flag |

`/auth/register`, `/auth/login`, `/auth/password/forgot` are rate-limited to **5 requests per IP per 15 min**. `/auth/otp/resend` has an additional per-phone limit enforced via Redis keys `otp:rl:cooldown:{phone}` and `otp:rl:hour:{phone}`.

## Notes

- Only `+52##########` phones are accepted for now — widen `phoneSchema` in `routes/auth.js` to accept more countries.
- Refresh tokens are opaque random strings (not JWTs) and are bcrypt-hashed in the `RefreshToken` table. Lookups scan up to 20 recent non-revoked rows and bcrypt-compare each — cheap in practice because active rows per user are near-singleton.
- `fastify.defaultWorkspaceId` is resolved once at boot from the workspace with `slug = 'ced-gym'`. Run `pnpm seed` before the first `pnpm dev` or the register endpoint will 500 with `NO_WORKSPACE`.

## Testing OTP locally

When `NODE_ENV !== 'production'` the API logs every generated OTP to stdout so
you can complete the register / password-reset flow without a real WhatsApp
pairing. Example line:

```
[OTP DEV] phone=+5216141234567 purpose=REGISTER code=923847 expires_in=10min
```

Copy the 6 digits from the log and paste them into `/verify` (or `/reset-password`)
on the frontend. The `/verify` and `/reset-password` pages also render a small
blue "Modo dev" hint when loaded from `localhost` to remind you where to look.

In production, make sure `NODE_ENV=production` is set so codes are NOT logged
in clear. The only signal in production logs is the structured bot-delivery
result (`ok: true` or `ok: false, error: <reason>`).

### WhatsApp bot unavailable

If `WHATSAPP_BOT_URL`/`WHATSAPP_BOT_KEY` are missing, or the bot process is
down, or the bot is running but not paired to a WhatsApp account yet, the
register endpoint still succeeds with `success: true, userId: ...` and the
`OtpCode` row is persisted. The response body includes `otp_delivery: <reason>`
so the client can warn the user, but the flow is NOT blocked — the dev (or end
user once things are wired) can call `/auth/otp/resend` to try again.
