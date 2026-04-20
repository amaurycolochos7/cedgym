# CEDGYM ECOSYSTEM — ULTRA PLAN

> Versión 2.1 · Abril 2026  
> Sistema completo de gestión de gimnasio con automatización WhatsApp, QR check-in, Mercado Pago, marketplace de rutinas y dashboard analytics.

## 🆕 Cambios v2.1 (vs v2.0)
- **Sin facturación CFDI** (pospuesto, no se implementa en este plan)
- **Datos extendidos en registro**: nombre completo, edad, contacto de emergencia (saltables)
- **Marketplace visible en landing pública** con flujo "register → redirect al checkout"

## Cambios v2.0 (vs v1.0)
- **OTP y recuperación de contraseña por WhatsApp** (elimina costo Twilio en MX)
- **Marketplace de rutinas y planes nutricionales** (venta digital dentro del perfil)
- **Gamificación** (rachas, badges, niveles)
- **Programa de referidos** con split automático
- **Congelamiento de membresía** (viaje/lesión)
- **Reservas de clases grupales** con cupos
- **Chat interno atleta ↔ entrenador**
- **Seguimiento corporal** (mediciones, fotos, progreso)
- **Cumplimiento LFPDPPP** + auditoría + observabilidad

---

## Stack Definitivo

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Backend API | Fastify (Node.js) — mismo patrón que motopartes |
| Bot WhatsApp | whatsapp-web.js + Express — **idéntico** a motopartes-manager |
| Base de datos | PostgreSQL + Prisma ORM (multi-tenant por workspace) |
| Cache / QR | Redis (QR dinámico rotating, sesiones, rate-limit) |
| Pagos | Mercado Pago Checkout Pro + Suscripciones + Webhooks |
| Push / OTP | Firebase Cloud Messaging + **OTP vía WhatsApp Bot** (no Twilio) |
| Almacenamiento | MinIO self-hosted en Dokploy (S3-compatible) |
| Auth | JWT + refresh tokens + OTP SMS |
| Deploy | Dokploy (Docker Compose multi-service) |

---

## Roles del Sistema

```
superadmin → admin → entrenador → recepcionista → atleta → visitante
```

---

## Arquitectura de Servicios (docker-compose)

```
cedgym/
├── apps/
│   ├── web/              ← Next.js (puerto 3000)
│   ├── api/              ← Fastify backend (puerto 3001)
│   ├── whatsapp-bot/     ← Express + whatsapp-web.js (puerto 3002) ← CLONAR de motopartes
│   └── worker/           ← Automation sweep + cron jobs
├── docker-compose.yml
├── nginx/                ← Reverse proxy
└── .env.production
```

---

## 5 TRACKS PARALELOS

---

### TRACK 1 — Base de Datos & Auth

**Fase 1.1 — Schema Prisma (semana 1)**

```prisma
// Multi-tenant core
model Workspace {
  id          String   @id @default(cuid())
  slug        String   @unique  // ced-gym, otro-gym
  name        String
  logo_url    String?
  plan        PlanType @default(STARTER)
}

model User {
  id            String    @id @default(cuid())
  workspace_id  String
  name          String          // nombre corto para UI
  full_name     String?         // 🆕 nombre completo legal
  email         String    @unique
  phone         String?
  birth_date    DateTime?       // 🆕 fecha de nacimiento (calculamos edad on-the-fly)
  gender        Gender?         // 🆕 MALE | FEMALE | OTHER | PREFER_NOT_SAY
  role          Role      @default(ATHLETE)
  password_hash String
  avatar_url    String?
  status        UserStatus @default(UNVERIFIED) // 🆕 UNVERIFIED | ACTIVE | SUSPENDED
  phone_verified_at DateTime?
  profile_completed Boolean   @default(false)   // 🆕 false si saltó datos extra
  created_at    DateTime  @default(now())
  workspace     Workspace @relation(fields: [workspace_id], references: [id])
  membership    Membership?
  check_ins     CheckIn[]
  payments      Payment[]
  emergency_contacts EmergencyContact[]         // 🆕
}

enum Gender { MALE  FEMALE  OTHER  PREFER_NOT_SAY }
enum UserStatus { UNVERIFIED  ACTIVE  SUSPENDED  DELETED }

// 🆕 v2.1 — Contacto(s) de emergencia
model EmergencyContact {
  id           String   @id @default(cuid())
  user_id      String
  name         String
  relationship String   // "Madre", "Esposo", "Hermano", "Amigo"
  phone        String
  is_primary   Boolean  @default(true)
  created_at   DateTime @default(now())

  user         User     @relation(fields: [user_id], references: [id])

  @@index([user_id])
}

model Membership {
  id                 String           @id @default(cuid())
  workspace_id       String
  user_id            String           @unique
  plan               MembershipPlan   // STARTER | PRO | ELITE
  sport              Sport?           // FOOTBALL | BOXING | MMA | etc.
  status             MembershipStatus // ACTIVE | EXPIRED | SUSPENDED | TRIAL
  starts_at          DateTime
  expires_at         DateTime
  price_mxn          Int
  billing_cycle      BillingCycle     // MONTHLY | QUARTERLY | ANNUAL
  mp_subscription_id String?          // Mercado Pago recurring
  auto_renew         Boolean          @default(true)
}

model CheckIn {
  id           String        @id @default(cuid())
  workspace_id String
  user_id      String
  method       CheckInMethod // QR | MANUAL | BIOMETRIC
  scanned_at   DateTime      @default(now())
  staff_id     String?
}

model Course {
  id           String   @id @default(cuid())
  workspace_id String
  name         String
  sport        Sport
  trainer_id   String
  capacity     Int
  enrolled     Int      @default(0)
  price_mxn    Int
  starts_at    DateTime
  ends_at      DateTime
  schedule     Json     // [{day: "MON", time: "18:00", duration: 60}]
}

model Payment {
  id               String        @id @default(cuid())
  workspace_id     String
  user_id          String
  amount           Int           // en centavos MXN
  type             PaymentType   // MEMBERSHIP | COURSE | SUPPLEMENT | OTHER
  mp_payment_id    String?
  mp_preference_id String?
  status           PaymentStatus // PENDING | APPROVED | REJECTED | REFUNDED
  created_at       DateTime      @default(now())
}

model AutomationJob {
  id            String    @id @default(cuid())
  workspace_id  String
  automation_id String
  trigger_event String
  context       Json      // { user_id, membership_id, expires_in_days, etc. }
  scheduled_at  DateTime
  status        JobStatus @default(PENDING) // PENDING | RUNNING | DONE | FAILED
  attempts      Int       @default(0)
  result_data   Json?
}

model Automation {
  id            String  @id @default(cuid())
  workspace_id  String
  name          String  // "Recordatorio 8 días antes"
  trigger       String  // "membership.expiring_soon" | "payment.approved" | etc.
  filter        Json?   // { days_before: 8 }
  delay_minutes Int     @default(0)
  action        String  // "whatsapp.send_template" | "push.notify" | "email.send"
  params        Json    // { template_id, to: "member" }
  enabled       Boolean @default(true)
}

model WhatsAppSession {
  id             String    @id @default(cuid())
  workspace_id   String
  staff_id       String    @unique
  phone_number   String?
  is_connected   Boolean   @default(false)
  last_heartbeat DateTime?
  paired_at      DateTime?
}

model QRToken {
  id           String   @id @default(cuid())
  workspace_id String
  token        String   @unique // UUID rotado cada 60s
  expires_at   DateTime
  user_id      String?
}

// ============================================================
// 🆕 v2.0 — OTP WhatsApp (registro + recuperación password)
// ============================================================
model OtpCode {
  id           String   @id @default(cuid())
  phone        String   // E.164: +52xxx
  code_hash    String   // bcrypt del código de 6 dígitos
  purpose      OtpPurpose // REGISTER | PASSWORD_RESET | LOGIN_2FA
  attempts     Int      @default(0)
  max_attempts Int      @default(5)
  expires_at   DateTime // TTL 10 min
  verified_at  DateTime?
  created_at   DateTime @default(now())

  @@index([phone, purpose])
}

enum OtpPurpose {
  REGISTER
  PASSWORD_RESET
  LOGIN_2FA
  PHONE_CHANGE
}

// ============================================================
// 🆕 v2.0 — Marketplace de rutinas y planes nutricionales
// ============================================================
model DigitalProduct {
  id           String              @id @default(cuid())
  workspace_id String
  type         DigitalProductType  // ROUTINE | NUTRITION_PLAN | EBOOK | VIDEO_COURSE | BUNDLE
  title        String
  slug         String
  description  String              @db.Text
  cover_url    String?
  sport        Sport?
  level        Level               // BEGINNER | INTERMEDIATE | ADVANCED
  duration_weeks Int?
  price_mxn    Int
  sale_price_mxn Int?              // precio con descuento
  author_id    String              // entrenador que la creó
  revenue_split Int                @default(70) // % para el autor (resto para el gym)
  content      Json                // estructura: { weeks: [{ day: 1, exercises: [...] }] }
  pdf_url      String?             // opcional si es un PDF
  video_urls   String[]            // links a videos en MinIO/S3
  published    Boolean             @default(false)
  featured     Boolean             @default(false)
  rating_avg   Float               @default(0)
  rating_count Int                 @default(0)
  sales_count  Int                 @default(0)
  created_at   DateTime            @default(now())

  author       User                @relation("AuthoredProducts", fields: [author_id], references: [id])
  purchases    ProductPurchase[]
  reviews      ProductReview[]

  @@unique([workspace_id, slug])
}

enum DigitalProductType {
  ROUTINE
  NUTRITION_PLAN
  EBOOK
  VIDEO_COURSE
  BUNDLE
}

enum Level {
  BEGINNER
  INTERMEDIATE
  ADVANCED
  ALL_LEVELS
}

model ProductPurchase {
  id               String   @id @default(cuid())
  workspace_id     String
  user_id          String
  product_id       String
  payment_id       String   // FK a Payment
  price_paid_mxn   Int
  author_payout_mxn Int     // lo que se paga al entrenador
  gym_revenue_mxn  Int      // lo que queda para el gym
  access_granted_at DateTime @default(now())
  expires_at       DateTime? // null = acceso de por vida
  downloaded_times Int      @default(0)

  user             User            @relation(fields: [user_id], references: [id])
  product          DigitalProduct  @relation(fields: [product_id], references: [id])

  @@unique([user_id, product_id])
}

model ProductReview {
  id         String   @id @default(cuid())
  product_id String
  user_id    String
  rating     Int      // 1-5
  comment    String?  @db.Text
  created_at DateTime @default(now())

  product    DigitalProduct @relation(fields: [product_id], references: [id])

  @@unique([product_id, user_id])
}

model PromoCode {
  id             String    @id @default(cuid())
  workspace_id   String
  code           String    @unique // SUMMER25, AMIGO10
  type           DiscountType // PERCENTAGE | FIXED_AMOUNT
  value          Int       // 25 (=25%) o 50000 (=$500 MXN en centavos)
  applies_to     String[]  // ["MEMBERSHIP", "DIGITAL_PRODUCT", "COURSE"]
  max_uses       Int?
  used_count     Int       @default(0)
  expires_at     DateTime?
  min_amount_mxn Int?
  enabled        Boolean   @default(true)
}

enum DiscountType { PERCENTAGE  FIXED_AMOUNT }

// ============================================================
// 🆕 v2.0 — Gamificación (rachas, badges, niveles)
// ============================================================
model UserProgress {
  id                  String   @id @default(cuid())
  user_id             String   @unique
  xp                  Int      @default(0)
  level               Int      @default(1)
  current_streak_days Int      @default(0)
  longest_streak_days Int      @default(0)
  last_checkin_date   DateTime?
  total_checkins      Int      @default(0)
  total_classes       Int      @default(0)

  user                User     @relation(fields: [user_id], references: [id])
  badges              UserBadge[]
}

model Badge {
  id          String  @id @default(cuid())
  code        String  @unique // FIRST_CHECKIN, STREAK_7, STREAK_30, LVL_10
  name        String
  description String
  icon_url    String
  xp_reward   Int     @default(0)
  rarity      String  // COMMON | RARE | EPIC | LEGENDARY
}

model UserBadge {
  id         String   @id @default(cuid())
  user_id    String
  badge_id   String
  earned_at  DateTime @default(now())

  progress   UserProgress @relation(fields: [user_id], references: [user_id])
  badge      Badge        @relation(fields: [badge_id], references: [id])

  @@unique([user_id, badge_id])
}

// ============================================================
// 🆕 v2.0 — Programa de referidos
// ============================================================
model Referral {
  id              String   @id @default(cuid())
  workspace_id    String
  referrer_id     String   // quien refirió
  referred_id     String   @unique // el nuevo usuario
  code_used       String   // código único del referrer: CED-JUAN42
  reward_referrer_mxn Int  @default(0) // ej: 200 MXN crédito
  reward_referred_mxn Int  @default(0) // ej: primer mes 20% off
  first_payment_at DateTime?
  reward_paid_at   DateTime?
  status          ReferralStatus @default(PENDING)
}

enum ReferralStatus {
  PENDING      // se registró pero no ha pagado
  CONFIRMED    // hizo su primer pago, ya se paga al referrer
  REWARDED     // ya se acreditó el premio
  EXPIRED
}

// ============================================================
// 🆕 v2.0 — Congelamiento de membresía
// ============================================================
model MembershipFreeze {
  id            String   @id @default(cuid())
  membership_id String
  user_id       String
  reason        String   // "Viaje", "Lesión", "Otro"
  starts_at     DateTime
  ends_at       DateTime
  days_frozen   Int
  approved_by   String?  // staff que aprobó
  created_at    DateTime @default(now())
}
// ⚠️ Al congelar, se suma `days_frozen` a `Membership.expires_at`

// ============================================================
// 🆕 v2.0 — Reservas de clases grupales (cupos limitados)
// ============================================================
model ClassSchedule {
  id           String   @id @default(cuid())
  workspace_id String
  name         String   // "Spinning 6am", "CrossFit Masters"
  sport        Sport
  trainer_id   String
  starts_at    DateTime
  duration_min Int
  capacity     Int
  booked       Int      @default(0)
  location     String   // "Sala 1", "Outdoor"
  min_plan     MembershipPlan? // solo PRO/ELITE pueden reservar

  bookings     ClassBooking[]
}

model ClassBooking {
  id           String        @id @default(cuid())
  class_id     String
  user_id      String
  status       BookingStatus @default(CONFIRMED)
  booked_at    DateTime      @default(now())
  attended_at  DateTime?
  canceled_at  DateTime?

  class        ClassSchedule @relation(fields: [class_id], references: [id])

  @@unique([class_id, user_id])
}

enum BookingStatus {
  CONFIRMED
  WAITLIST
  CANCELED
  NO_SHOW
  ATTENDED
}

// ============================================================
// 🆕 v2.0 — Seguimiento corporal (mediciones + fotos)
// ============================================================
model BodyMeasurement {
  id           String   @id @default(cuid())
  user_id      String
  measured_at  DateTime @default(now())
  weight_kg    Float?
  body_fat_pct Float?
  muscle_mass_kg Float?
  chest_cm     Float?
  waist_cm     Float?
  hip_cm       Float?
  arm_cm       Float?
  thigh_cm     Float?
  notes        String?  @db.Text
  photo_urls   String[] // frontal, lateral, espalda
  taken_by     String?  // staff_id si lo tomó un entrenador
}

// ============================================================
// 🆕 v2.0 — Chat interno atleta ↔ entrenador
// ============================================================
model Conversation {
  id           String   @id @default(cuid())
  workspace_id String
  user_ids     String[] // participantes
  last_message_at DateTime?
  created_at   DateTime @default(now())

  messages     Message[]
}

model Message {
  id              String   @id @default(cuid())
  conversation_id String
  sender_id       String
  body            String   @db.Text
  attachment_url  String?
  read_at         DateTime?
  created_at      DateTime @default(now())

  conversation    Conversation @relation(fields: [conversation_id], references: [id])
}

// ============================================================
// 🆕 v2.0 — Auditoría (cumplimiento LFPDPPP)
// ============================================================
model AuditLog {
  id           String   @id @default(cuid())
  workspace_id String
  actor_id     String?  // quien hizo la acción (null = sistema)
  action       String   // "member.deleted", "payment.refunded", "data.exported"
  target_type  String?  // "User", "Payment", "Membership"
  target_id    String?
  metadata     Json?    // contexto adicional
  ip_address   String?
  user_agent   String?
  created_at   DateTime @default(now())

  @@index([workspace_id, created_at])
  @@index([actor_id])
}
```

**Fase 1.2 — Auth API con OTP por WhatsApp (semana 1-2)**

```
POST /auth/register               → paso 1: datos mínimos + OTP WhatsApp
POST /auth/verify-register        → paso 2: valida OTP → activa cuenta
PATCH /auth/complete-profile      → paso 3 (saltable): datos extendidos
POST /auth/login                  → JWT (15min) + refreshToken (7d httpOnly)
POST /auth/refresh
POST /auth/logout

POST /auth/password/forgot        → envía OTP al WhatsApp registrado
POST /auth/password/reset         → { phone, code, new_password }

POST /auth/otp/resend             → rate-limit: máx 1 cada 60s, 5 por hora
POST /auth/2fa/enable             → opcional: 2FA en cada login
GET  /auth/me
```

**🆕 Flujo de registro en 3 pasos:**

```
┌─────────────────────────────────────────────────────────────┐
│  PASO 1 — Datos mínimos (obligatorios)                      │
│  • Nombre (corto, para saludo)                              │
│  • Email                                                    │
│  • Teléfono WhatsApp (+52...)                               │
│  • Contraseña                                               │
│  → POST /auth/register → envía OTP al WhatsApp              │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 2 — Verificación OTP (obligatorio)                    │
│  • Ingresa código de 6 dígitos recibido en WhatsApp         │
│  → POST /auth/verify-register → cuenta ACTIVA + JWT emitido │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  PASO 3 — Completar perfil (SALTABLE) 🆕                    │
│  • Nombre completo                                          │
│  • Fecha de nacimiento (edad)                               │
│  • Género (opcional)                                        │
│  • Contacto de emergencia:                                  │
│      - Nombre                                               │
│      - Parentesco (Madre, Esposo, Hermano…)                 │
│      - Teléfono                                             │
│  [ Completar ]  [ Saltar por ahora ]                        │
│  → PATCH /auth/complete-profile → profile_completed=true    │
│                                                             │
│  Si salta → redirección contextual (ver abajo)              │
│  + banner persistente: "Completa tu perfil (2 min) ⚠️"      │
└─────────────────────────────────────────────────────────────┘
```

**Endpoint de completar perfil:**

```javascript
// PATCH /auth/complete-profile  (requiere JWT)
// Body opcional — cualquier campo puede venir o no
fastify.patch('/auth/complete-profile', { preHandler: [auth] }, async (req) => {
  const { full_name, birth_date, gender, emergency_contact } = req.body;

  await prisma.user.update({
    where: { id: req.user.id },
    data: {
      ...(full_name   && { full_name }),
      ...(birth_date  && { birth_date: new Date(birth_date) }),
      ...(gender      && { gender }),
      profile_completed: true
    }
  });

  if (emergency_contact?.name && emergency_contact?.phone) {
    // Reemplaza el primario si ya existe
    await prisma.emergencyContact.upsert({
      where: {
        user_id_is_primary: { user_id: req.user.id, is_primary: true }
      },
      create: {
        user_id: req.user.id,
        name: emergency_contact.name,
        relationship: emergency_contact.relationship,
        phone: emergency_contact.phone,
        is_primary: true
      },
      update: {
        name: emergency_contact.name,
        relationship: emergency_contact.relationship,
        phone: emergency_contact.phone
      }
    });
  }

  return { success: true };
});

// Si saltó → se le pide de nuevo:
// - al intentar inscribirse a un curso
// - al comprar primera membresía (validación: no inscribir menores sin contacto)
// - banner en dashboard hasta que complete
```

**Validación por edad:**
- Si `birth_date` → calcular edad al vuelo (`dayjs().diff(birth_date, 'year')`)
- Menores de 18: **contacto de emergencia obligatorio** (bloquea checkout sin él)
- Menores de 15: requiere flag `parental_consent` + firma digital (PDF)

**Flujo de registro con OTP por WhatsApp:**

```javascript
// POST /auth/register
// Body: { name, email, phone: "+521234567890", password }
fastify.post('/auth/register', async (req) => {
  const { name, email, phone, password } = req.body;

  // 1. Validar que phone/email no existan
  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }] }
  });
  if (exists) throw err('USER_EXISTS');

  // 2. Crear user en status UNVERIFIED
  const user = await prisma.user.create({
    data: {
      name, email, phone,
      password_hash: await bcrypt.hash(password, 12),
      status: 'UNVERIFIED'
    }
  });

  // 3. Generar OTP de 6 dígitos
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.otpCode.create({
    data: {
      phone,
      code_hash: await bcrypt.hash(code, 10),
      purpose: 'REGISTER',
      expires_at: new Date(Date.now() + 10 * 60 * 1000) // 10 min
    }
  });

  // 4. Enviar por WhatsApp (mismo bot, NO Twilio)
  await sendWhatsAppOtp(phone, code, 'register');

  return { success: true, message: 'Código enviado a tu WhatsApp' };
});

async function sendWhatsAppOtp(phone, code, purpose) {
  const templates = {
    register:        `🏋️ *CED-GYM*\n\nTu código de verificación es:\n\n*${code}*\n\nExpira en 10 minutos. Si no solicitaste este código, ignora este mensaje.`,
    password_reset:  `🔐 *Recuperación de contraseña*\n\nTu código es:\n\n*${code}*\n\nExpira en 10 minutos. Nadie de CED-GYM te pedirá este código.`,
    login_2fa:       `🔑 Código de acceso CED-GYM:\n\n*${code}*\n\nVálido 10 min.`
  };

  // Usa la sesión del workspace (1 número oficial del gym)
  const wsSession = await prisma.whatsAppSession.findFirst({
    where: { is_connected: true }
  });

  await fetch(`${WHATSAPP_BOT_URL}/send-message`, {
    method: 'POST',
    headers: { 'x-api-key': BOT_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      staffId: wsSession.staff_id,
      phone,
      message: templates[purpose]
    })
  });
}

// POST /auth/verify-register
fastify.post('/auth/verify-register', async (req) => {
  const { phone, code } = req.body;

  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose: 'REGISTER', verified_at: null },
    orderBy: { created_at: 'desc' }
  });

  if (!otp) throw err('NO_OTP');
  if (otp.expires_at < new Date()) throw err('OTP_EXPIRED');
  if (otp.attempts >= otp.max_attempts) throw err('TOO_MANY_ATTEMPTS');

  const valid = await bcrypt.compare(code, otp.code_hash);
  if (!valid) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } }
    });
    throw err('INVALID_CODE');
  }

  // Activar cuenta
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { verified_at: new Date() }
  });
  const user = await prisma.user.update({
    where: { phone },
    data: { status: 'ACTIVE', phone_verified_at: new Date() }
  });

  // Dispara evento bienvenida
  fireEvent('member.verified', { user_id: user.id });

  return { success: true, token: issueJwt(user) };
});
```

**Ventajas vs Twilio SMS:**
- ✅ **Costo $0** en México (Twilio SMS ≈ $0.75 MXN por OTP)
- ✅ Mayor tasa de entrega (WhatsApp llega aunque no haya señal celular)
- ✅ Usuario **ya debe tener WhatsApp activo** → validación implícita del número
- ✅ Mismo canal para notificaciones posteriores
- ⚠️ Fallback: si el bot está caído, usar Twilio SMS (implementar como circuit breaker)

---

### TRACK 2 — API Core (Fastify)

**Estructura `apps/api/src/`**

```
routes/
├── auth.js
├── members.js        ← CRUD atletas + búsqueda por QR/nombre
├── memberships.js    ← crear, renovar, suspender, calcular vencimiento
├── checkins.js       ← POST /scan (valida QR-token en Redis)
├── courses.js        ← CRUD cursos + inscripción
├── payments.js       ← crear preferencia MP, webhook handler
├── automations.js    ← CRUD automations (mismo patrón motopartes)
├── templates.js      ← CRUD templates WhatsApp
├── whatsapp.js       ← proxy a whatsapp-bot container
├── dashboard.js      ← stats: ingresos, check-ins, retención
├── reports.js        ← exportar PDF/CSV
├── inventory.js      ← suplementos / productos POS
└── pos.js            ← punto de venta (venta rápida)

lib/
├── automations.js    ← fireEvent() + sweep (IDÉNTICO a motopartes)
├── events.js         ← event bus
├── qr.js             ← genera/rota QR tokens en Redis
├── mercadopago.js    ← MP SDK wrapper
├── pdf.js            ← pdfkit: recibos, carnets
└── workspace.js      ← AsyncLocalStorage multi-tenant
```

**Webhook Mercado Pago:**

```javascript
fastify.post('/webhooks/mercadopago', async (req) => {
  const { type, data } = req.body;

  if (type === 'payment') {
    const payment = await mp.payment.findById(data.id);
    if (payment.status === 'approved') {
      await activateMembership(payment.external_reference);
      fireEvent('payment.approved', {
        user_id: ...,
        plan: ...,
        expires_at: ...,
        total: payment.transaction_amount
      });
    }
  }

  if (type === 'subscription_preapproval') {
    fireEvent('membership.renewed', { ... });
  }
});
```

**QR Check-in con Redis:**

```javascript
// Cada 60s, rota tokens por atleta
async function rotateQRTokens(workspaceId) {
  const members = await getActiveMembers(workspaceId);
  for (const m of members) {
    const token = crypto.randomUUID();
    await redis.set(`qr:${token}`, m.user_id, 'EX', 90);          // TTL 90s
    await redis.set(`qr:current:${m.user_id}`, token, 'EX', 90);
  }
}

// POST /checkins/scan
fastify.post('/checkins/scan', async (req) => {
  const { token } = req.body;
  const userId = await redis.get(`qr:${token}`);

  if (!userId) return { error: 'QR inválido o expirado', code: 'EXPIRED_QR' };

  const membership = await getMembership(userId);
  if (membership.status !== 'ACTIVE') return { error: 'Membresía vencida', code: 'INACTIVE' };

  await createCheckIn(userId, 'QR');
  fireEvent('member.checked_in', { user_id: userId });

  return { success: true, member: { name, photo, plan, expires_at } };
});
```

---

### TRACK 3 — WhatsApp Bot (CLONADO de motopartes-manager)

**Pasos para adaptar:**
1. Copiar `apps/whatsapp-bot/` de motopartes-manager
2. Cambiar `mechanic_id` → `staff_id`
3. Adaptar `findSessionForOrder()` → `findSessionForWorkspace(workspaceId)`
4. Usar **1 sesión por workspace** (número oficial del gym, no por entrenador)

**Variables disponibles en plantillas:**

```javascript
const GYM_VARS = {
  '{nombre}':      member.name,
  '{plan}':        membership.plan_label,
  '{vence_en}':    daysUntilExpiry(membership.expires_at),
  '{fecha_venc}':  format(membership.expires_at, 'dd/MM/yyyy'),
  '{precio}':      formatMXN(membership.price_mxn),
  '{precio_desc}': formatMXN(membership.price_mxn * 0.8),  // -20%
  '{descuento}':   '20%',
  '{link_pago}':   generateMPLink(membership),
  '{link_portal}': `https://cedgym.mx/portal`,
  '{gym}':         workspace.name,
  '{qr_url}':      `https://cedgym.mx/qr/${member.id}`,
};
```

**Automaciones precargadas (seed en DB):**

| Trigger | Delay | Canal | Mensaje |
|---------|-------|-------|---------|
| `membership.expiring_soon` (8 días) | 0 | WhatsApp | 🔔 "Tu membresía vence en 8 días. Renueva ahora y obtén **20% de descuento**: {link_pago}" |
| `membership.expiring_soon` (3 días) | 0 | WhatsApp + Push | ⚠️ "Solo 3 días restantes, {nombre}. ¡Última oportunidad con descuento!" |
| `membership.expiring_soon` (1 día) | 0 | WhatsApp + Push | 🚨 "Mañana vence tu membresía. Renueva ahora y no pierdas tu lugar" |
| `membership.expired` | 0 | WhatsApp | 😢 "Extrañamos tu energía, {nombre}. Reactiva por {precio_desc} MXN este mes" |
| `payment.approved` | 0 | WhatsApp | ✅ "Pago confirmado. Tu membresía {plan} está activa hasta {fecha_venc}" |
| `member.created` | 5 min | WhatsApp | 👋 "Bienvenido a CED-GYM, {nombre}. Aquí tu QR de acceso: {qr_url}" |
| `checkin.first_of_week` | 0 | Push | 💪 "¡Buen entrenamiento! Ya llevas tu 1ra sesión esta semana" |
| `course.enrolled` | 0 | WhatsApp | 📚 "Inscripción confirmada al curso {curso}. Empieza {fecha_inicio}" |
| `member.birthday` | diario | WhatsApp | 🎂 "¡Feliz cumpleaños {nombre}! Hoy tienes 10% en suplementos" |
| `inactivity.14_days` | diario | WhatsApp | 😴 "Te echamos de menos, {nombre}. ¿Todo bien? Tu racha te espera" |
| `auth.otp_register` | 0 | WhatsApp | 🏋️ "Código CED-GYM: *{code}*. Expira en 10 min." |
| `auth.password_reset` | 0 | WhatsApp | 🔐 "Tu código de recuperación: *{code}*. Nadie te lo pedirá." |
| `product.purchased` | 0 | WhatsApp | 🎉 "Listo {nombre}, tu rutina *{producto}* está disponible en tu cuenta: {link_portal}" |
| `product.review_request` | 7 días | WhatsApp | ⭐ "¿Cómo vas con *{producto}*? Déjanos tu reseña y gana XP: {link_review}" |
| `gamification.badge_unlocked` | 0 | Push | 🏅 "¡Desbloqueaste *{badge}*! +{xp} XP" |
| `gamification.streak_break_warning` | 0 | Push | 🔥 "Tu racha de {days} días está en peligro. ¡Entrena hoy!" |
| `referral.reward_granted` | 0 | WhatsApp | 💰 "¡{referred_name} se inscribió con tu código! Tienes $200 MXN de crédito" |
| `class.reminder_2h` | -2h | WhatsApp | 🏃 "Tu clase *{clase}* con {coach} empieza en 2h. ¡Te esperamos!" |
| `class.cancellation_alert` | 0 | WhatsApp + Push | ❌ "La clase *{clase}* fue cancelada. Tu cupo se libera automáticamente." |
| `measurement.reminder` | 30 días | WhatsApp | 📏 "Hace un mes de tu última medición, {nombre}. Agenda con {coach}" |

**Sweep membresías por vencer (worker, cada 6 horas):**

```javascript
async function membershipExpirySweep(workspaceId) {
  const thresholds = [8, 3, 1];

  for (const days of thresholds) {
    const expiring = await prisma.membership.findMany({
      where: {
        workspace_id: workspaceId,
        status: 'ACTIVE',
        expires_at: {
          gte: addDays(new Date(), days),
          lt:  addDays(new Date(), days + 1)
        }
      },
      include: { user: true }
    });

    for (const m of expiring) {
      // Idempotency: evitar doble-envío con Redis
      const key = `notif:expiry:${m.id}:d${days}`;
      if (await redis.exists(key)) continue;

      fireEvent('membership.expiring_soon', {
        user_id: m.user_id,
        membership_id: m.id,
        days_before: days,
        expires_at: m.expires_at
      });

      await redis.set(key, '1', 'EX', 60 * 60 * 24); // TTL 24h
    }
  }
}
```

---

### TRACK 4 — Frontend Next.js

**Estructura `apps/web/app/`**

```
(public)/
├── page.tsx                  ← redesign.html migrado a Next.js
└── [sport]/page.tsx          ← landing por deporte

(auth)/
├── login/page.tsx
├── register/page.tsx
└── verify/page.tsx           ← OTP SMS

(member)/                     ← layout: sidebar atleta
├── dashboard/page.tsx        ← check-ins, progreso, streak
├── membership/page.tsx       ← estado, renovar, historial
├── courses/page.tsx          ← mis cursos, inscribirme
├── qr/page.tsx               ← QR dinámico (PWA cached)
└── payments/page.tsx         ← historial pagos, recibos (PDF)

(staff)/                      ← layout: sidebar staff
├── scan/page.tsx             ← cámara QR check-in
├── members/page.tsx          ← lista, buscar, perfil rápido
├── pos/page.tsx              ← POS suplementos
└── attendance/page.tsx       ← asistencia manual

(admin)/                      ← layout: sidebar admin
├── dashboard/page.tsx        ← revenue, retention, heatmap
├── members/[id]/page.tsx
├── courses/page.tsx
├── memberships/page.tsx
├── payments/page.tsx
├── automations/page.tsx      ← editor visual de automaciones
├── whatsapp/page.tsx         ← sesiones bot, escanear QR
├── inventory/page.tsx
└── settings/page.tsx

api/webhooks/mercadopago/route.ts
```

**PWA para QR offline:**

```typescript
// app/(member)/qr/page.tsx
'use client';
import QRCode from 'react-qr-code';
import { useQuery } from '@tanstack/react-query';

export default function QRPage() {
  const { data: qrToken } = useQuery({
    queryKey: ['qr-token'],
    queryFn: () => api.get('/members/me/qr-token'),
    refetchInterval: 55_000, // rota antes de que Redis expire (90s)
    staleTime: 50_000,
  });

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Tu acceso CED-GYM</h1>
      {qrToken && <QRCode value={qrToken} size={280} />}
      <p className="text-sm text-gray-500">Se actualiza automáticamente cada minuto</p>
    </div>
  );
}
```

---

### TRACK 5 — Infraestructura Dokploy

**`docker-compose.yml`:**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: cedgym
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    restart: unless-stopped

  api:
    build: ./apps/api
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/cedgym
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      MP_ACCESS_TOKEN: ${MP_ACCESS_TOKEN}
      WHATSAPP_BOT_URL: http://whatsapp-bot:3002
      WHATSAPP_BOT_KEY: ${WHATSAPP_BOT_KEY}
    depends_on: [db, redis]
    restart: unless-stopped

  whatsapp-bot:
    build: ./apps/whatsapp-bot
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/cedgym
      API_KEY: ${WHATSAPP_BOT_KEY}
    volumes:
      - wwebjs_auth:/app/data/wwebjs_auth
    shm_size: '512mb'
    restart: unless-stopped

  worker:
    build: ./apps/worker
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/cedgym
      REDIS_URL: redis://redis:6379
    depends_on: [db, redis]
    restart: unless-stopped

  web:
    build: ./apps/web
    environment:
      NEXT_PUBLIC_API_URL: https://api.cedgym.mx
      NEXT_PUBLIC_MP_PUBLIC_KEY: ${MP_PUBLIC_KEY}
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/cedgym.conf:/etc/nginx/conf.d/default.conf
      - certbot_certs:/etc/letsencrypt
    depends_on: [web, api]
    restart: unless-stopped

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    volumes:
      - miniodata:/data
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  wwebjs_auth:
  certbot_certs:
  miniodata:
```

**Nginx routing:**

```nginx
server {
  server_name cedgym.mx www.cedgym.mx;
  location / { proxy_pass http://web:3000; }
}

server {
  server_name api.cedgym.mx;
  location / { proxy_pass http://api:3001; }
}
```

---

## Variables de Entorno Clave

```bash
# .env.production

# DB
DATABASE_URL=postgresql://cedgym:xxx@db:5432/cedgym
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=ultra-secret-256-bits
JWT_REFRESH_SECRET=otro-secret-256-bits

# Mercado Pago
MP_ACCESS_TOKEN=APP_USR-xxx
MP_PUBLIC_KEY=APP_USR-xxx
MP_WEBHOOK_SECRET=xxx

# WhatsApp Bot
WHATSAPP_BOT_URL=http://whatsapp-bot:3002
WHATSAPP_BOT_KEY=cedgym-bot-secret-key

# Twilio (SMS fallback SOLO si WhatsApp bot cae)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE=+12125551234

# Observabilidad
SENTRY_DSN=https://xxx@sentry.io/xxx
POSTHOG_KEY=phc_xxx

# Firebase (push notifications)
FIREBASE_PROJECT_ID=cedgym-prod
FIREBASE_PRIVATE_KEY=xxx

# MinIO
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=xxx
MINIO_SECRET_KEY=xxx
```

---

## Fases de Entrega

### Fase 0 — Setup (Día 1-2)
- [ ] Init monorepo (`pnpm workspaces`)
- [ ] Copiar `apps/whatsapp-bot/` de motopartes-manager, adaptar variables
- [ ] Schema Prisma completo + migraciones iniciales
- [ ] Docker Compose corriendo local
- [ ] Dokploy: crear app, configurar dominio, SSL automático

### Fase 1 — Auth + Membresías (Semana 1-2)
- [ ] Auth completo (JWT, OTP, roles)
- [ ] CRUD miembros + membresías
- [ ] Checkout Mercado Pago (preferencia + webhook)
- [ ] Activación automática post-pago
- [ ] WhatsApp "pago confirmado" + "bienvenida"

### Fase 2 — Check-in QR (Semana 2-3)
- [ ] Redis QR rotation (60s)
- [ ] PWA con Service Worker (QR offline)
- [ ] Scan en recepción (cámara + validación)
- [ ] Dashboard check-ins diarios
- [ ] WhatsApp "primer check-in de la semana"

### Fase 3 — Marketing Automation (Semana 3-4)
- [ ] Sweep membresías por vencer (8/3/1 días)
- [ ] Idempotency Redis (no doble-envío)
- [ ] Link Mercado Pago con descuento en template
- [ ] Reactivación inactivos (14 días sin check-in)
- [ ] Cumpleaños automático (+10% descuento suplementos)
- [ ] Editor visual automaciones en admin

### Fase 4 — Cursos + POS (Semana 4-5)
- [ ] CRUD cursos + inscripción + control de capacidad
- [ ] Calendario de clases
- [ ] POS suplementos (inventario + venta rápida)
- [ ] Reportes PDF (recibos, carnets de membresía)
- [ ] Exportar CSV pagos y asistencias

### Fase 5 — Dashboard Analytics (Semana 5-6)
- [ ] Revenue mensual/anual
- [ ] Tasa de retención (membresías renovadas vs expiradas)
- [ ] Heatmap asistencia por hora/día
- [ ] Top deportes + coaches
- [ ] Alerta churn (< 60% check-ins esperados en período)

### Fase 6 — Polish + Deploy Producción (Semana 6-7)
- [ ] PWA completa (offline, install prompt, notificaciones push)
- [ ] Migrar redesign.html → Next.js página pública
- [ ] SSL + dominios configurados en Dokploy
- [ ] Backups automáticos PostgreSQL → MinIO (retención 30 días)
- [ ] Monitoring: Sentry (errores) + Uptime Kuma (uptime) + alertas WhatsApp al superadmin

### 🆕 Fase 7 — Marketplace de Rutinas & Nutrición (Semana 7-9)
- [ ] CRUD `DigitalProduct` (admin + entrenadores autores)
- [ ] Flujo de aprobación: entrenador sube → admin revisa → publica
- [ ] **Catálogo visible en landing pública** (`/`) 🆕
- [ ] Página `/tienda` con filtros (deporte, nivel, precio, duración)
- [ ] Detalle de producto `/tienda/[slug]` con preview + reviews + rating
- [ ] **Intent-to-buy funnel** para visitantes no registrados 🆕
- [ ] Checkout Mercado Pago (individual o bundle)
- [ ] **Split automático de ingresos**: 70% entrenador / 30% gym (configurable por producto)
- [ ] Biblioteca "Mis compras" en perfil del atleta
- [ ] Visualizador de rutina día-por-día con videos embebidos
- [ ] Descarga de PDF con marca de agua (evitar reventa)
- [ ] Sistema de reviews (solo compradores verificados)
- [ ] Promocodes (`SUMMER25`, `AMIGO10`) aplicables a productos digitales
- [ ] Gift cards (regalo de rutina a otro usuario)
- [ ] WhatsApp automation: "¿Te gustó la rutina? Déjanos tu reseña" a los 7 días post-compra
- [ ] Dashboard del entrenador: ventas, payouts pendientes, rating

**🆕 Flujo "register → redirect al checkout" (intent-to-buy):**

```
┌───────────────────────────────────────────────────────────────┐
│  1. Visitante ve rutina en landing /  o  /tienda              │
│     Click en [Comprar]                                        │
└───────────────────────────────────────────────────────────────┘
                         ↓
            ┌────────────┴────────────┐
            │ ¿Tiene sesión activa?   │
            └────────────┬────────────┘
                         │
            ┌────────────┴────────────┐
            │ SÍ → /checkout/{product_id} directo               │
            │ NO → /register?redirect=/checkout/{product_id}    │
            └───────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  2. Visitante hace registro (paso 1 + 2 del flujo de auth)    │
│     El `redirect` se guarda en localStorage + query param     │
└───────────────────────────────────────────────────────────────┘
                         ↓
┌───────────────────────────────────────────────────────────────┐
│  3. Post-verificación OTP:                                    │
│     • Se emite JWT                                            │
│     • Se lee `redirect` del state                             │
│     • Se redirige a /checkout/{product_id}?welcome=1          │
│     • Modal "¡Bienvenido! Continúa con tu compra"             │
│     • Paso 3 (perfil completo) se ofrece DESPUÉS del pago     │
│       para no interrumpir la conversión                       │
└───────────────────────────────────────────────────────────────┘
                         ↓
┌───────────────────────────────────────────────────────────────┐
│  4. Checkout → Mercado Pago → webhook aprueba pago            │
│     • Producto se añade a "Mis compras"                       │
│     • WhatsApp: "🎉 Tu rutina está lista"                     │
│     • Redirige a /portal/mis-rutinas/{product_id}             │
│     • Banner suave: "Completa tu perfil (30s)"                │
└───────────────────────────────────────────────────────────────┘
```

**Implementación del redirect:**

```typescript
// Landing / página de producto
function BuyButton({ productId, slug }: { productId: string; slug: string }) {
  const { data: session } = useSession();
  const checkoutPath = `/checkout/${productId}`;

  const handleClick = () => {
    if (session?.user) {
      router.push(checkoutPath);
    } else {
      // 1. Persiste intent en localStorage (sobrevive reload)
      localStorage.setItem('post_register_redirect', checkoutPath);
      localStorage.setItem('purchase_intent', JSON.stringify({
        product_id: productId,
        slug,
        at: Date.now()
      }));
      // 2. También en query (fallback si el storage se limpia)
      router.push(`/register?redirect=${encodeURIComponent(checkoutPath)}`);
    }
  };

  return <button onClick={handleClick}>Comprar ahora</button>;
}

// Página de registro
// app/(auth)/register/page.tsx
const redirect = searchParams.get('redirect')
              || localStorage.getItem('post_register_redirect')
              || '/dashboard';

// Después de verificar OTP:
async function onOtpVerified(jwt: string) {
  await setSession(jwt);
  localStorage.removeItem('post_register_redirect');
  localStorage.removeItem('purchase_intent');
  router.push(redirect); // ← vuelve al checkout con JWT activo
}
```

**Seguridad del redirect:**
- Whitelist de rutas permitidas (`/checkout/*`, `/tienda/*`, `/dashboard`, `/cursos/*`)
- Rechazar URLs absolutas o con `//` para prevenir open redirect
- Validar que `product_id` existe antes de redirigir (404 → dashboard)
- TTL del intent en localStorage: **24h** (si no completa, se limpia)

**Abandono de carrito (bonus marketing):**
Si el usuario abandona después de registrarse pero antes de pagar:
- 1h después → WhatsApp: "Aún puedes adquirir *{producto}*. Usa código `VUELVE10` (-10%)"
- 24h después → WhatsApp: "Última oportunidad con descuento"
- 7 días → se archiva el intent

**Modelo de ingresos marketplace:**

```
Rutina "12 Weeks Powerlifting" — $899 MXN
├── Entrenador (autor)    : $629 (70%)
├── Gym (comisión)        : $270 (30%)
└── Mercado Pago fee       : ~$30 (absorbido por ambos)
```

**Productos digitales sugeridos para el cliente:**
- Rutinas deportivas (Football, Boxing, MMA, Powerlifting)
- Planes nutricionales (Volumen, Definición, Keto)
- Ebooks técnicos
- Video-cursos ("Técnica de sentadilla", "Bloqueo de pase")
- Bundles ("Pretemporada completa" = rutina + nutrición + videos)

### 🆕 Fase 8 — Gamificación + Referidos + Compliance (Semana 9-10)
- [ ] **LFPDPPP compliance**:
  - [ ] Aviso de privacidad visible
  - [ ] Consentimiento explícito en registro
  - [ ] `GET /users/me/export` → JSON con todos sus datos
  - [ ] `DELETE /users/me` → anonimización (no borrado si hay pagos)
- [ ] **Gamificación**:
  - [ ] `UserProgress` actualizado en cada check-in
  - [ ] Cálculo de racha (streak) con tolerancia de 1 día de descanso
  - [ ] Badges automáticos: primera visita, 7 días, 30 días, 100 check-ins, nivel 10, 25, 50
  - [ ] XP: 10 por check-in, 25 por clase reservada asistida, 50 por compra de rutina
  - [ ] Widget en dashboard atleta: racha actual + próximo badge
  - [ ] Notificación push: "¡No rompas tu racha! Visítanos hoy"
- [ ] **Programa de referidos**:
  - [ ] Código único por usuario (`CED-JUAN42`)
  - [ ] Landing `/r/{code}` con descuento automático al registrarse
  - [ ] Recompensa: $200 MXN de crédito al referrer tras primer pago del referido
  - [ ] Dashboard "Invita y gana"
  - [ ] Leaderboard mensual top referidos

### 🆕 Fase 9 — Premium Features (Semana 10-12)
- [ ] **Congelamiento de membresía** (auto-extiende `expires_at`)
  - Máximo 30 días/año, mínimo 7 días por evento
  - Aprobación automática para PRO/ELITE, manual para STARTER
- [ ] **Reservas de clases grupales**:
  - Calendario semanal con cupos visibles
  - Lista de espera automática si se llena
  - Cancelación con 2h de anticipación (o cuenta como no-show)
  - 3 no-shows → suspensión de reservas por 7 días
  - Recordatorio WhatsApp 2h antes
- [ ] **Seguimiento corporal**:
  - Registro de mediciones mensuales por entrenador
  - Comparativa visual antes/después (gráficas)
  - Subida de fotos de progreso (privadas, cifradas)
  - Meta personalizada (peso objetivo, % grasa)
- [ ] **Chat interno atleta ↔ entrenador**:
  - WebSocket via Socket.IO
  - Notificación push por mensaje nuevo
  - Adjuntos (foto de forma, video de ejercicio)
  - Solo entre atleta y SU entrenador asignado
- [ ] **Horarios por plan** (acceso restringido):
  - STARTER: L-V 6-10am y 7-10pm
  - PRO: L-V 6am-10pm, sáb 7am-2pm
  - ELITE: 24/7
  - Se valida en el check-in QR (rechaza si fuera de horario)
- [ ] **Evaluación de entrenadores**:
  - Rating post-clase (solo reservas asistidas)
  - Ranking mensual visible en admin

### 🆕 Fase 10 — Operación Avanzada (Semana 12-14)
- [ ] **Biblioteca de videos de ejercicios** (MinIO + streaming HLS)
- [ ] **Tickets de soporte** (atleta crea → staff responde)
- [ ] **Multi-idioma** ES/EN con `next-intl`
- [ ] **App móvil nativa** (React Native + Expo) — opcional fase posterior
- [ ] **Integración wearables** (Garmin Connect API, Apple HealthKit) — opcional
- [ ] **A/B testing** landing con PostHog
- [ ] **Email marketing** con Resend (newsletters, promociones)
- [ ] **Blog SEO** con MDX (artículos de entrenamiento, nutrición)

---

## Decisiones Arquitectónicas

| Decisión | Razón |
|----------|-------|
| whatsapp-web.js (no API oficial) | Sin costo mensual, funciona perfecto en Dokploy con volumen persistente. Battle-tested en motopartes. |
| 1 sesión bot por workspace | Para gimnasio es mejor 1 número oficial del gym vs. celular de cada entrenador. |
| Idempotency Redis para recordatorios | Clave `notif:expiry:{id}:d{N}` con TTL 24h evita envíos duplicados si el worker se reinicia. |
| QR en Redis (no en DB) | Latencia sub-ms para 50+ personas en la entrada a las 7am. |
| Worker separado del API | Si el sweep falla, el API sigue funcionando. Dokploy reinicia solo. |
| Fastify (no NestJS/Express) | Mismo patrón de motopartes — ya conocido, más rápido que Express, más simple que NestJS. |
| OTP por WhatsApp (no Twilio) | Cero costo en MX ($0 vs ~$0.75 por OTP), mayor delivery, el usuario ya tiene WhatsApp → validación implícita del número. Fallback Twilio si el bot cae. |
| Split marketplace 70/30 | Incentiva a entrenadores a crear contenido premium; gym retiene margen sin trabajar el contenido. Configurable por producto. |
| Facturación CFDI pospuesta | No se implementa en este plan. Se podrá agregar después cuando el cliente lo requiera (Facturapi / SW Sapien en una fase futura). |
| Registro en 3 pasos (paso 3 saltable) | Minimiza fricción en la conversión (datos extendidos ≠ datos mínimos). Se fuerza completar antes de cursos/inscripciones presenciales donde se necesita edad y contacto de emergencia. |
| Marketplace en landing + redirect post-register | Permite descubrir productos sin login (SEO), pero exige registro al comprar. El redirect preserva el intent y evita que el usuario se pierda. |
| Gamificación con XP + badges | +40% retención comprobada en apps de fitness (ver Strava, Nike Run Club). Barato de implementar, alto ROI. |
| Congelamiento auto-aprobado PRO/ELITE | Reduce carga operativa del staff y aumenta percepción de valor en planes premium. |
| 3 no-shows = suspensión 7 días | Evita que usuarios acaparen cupos de clases populares sin asistir. |

---

## Resumen de Módulos (Checklist Ejecutivo)

| Módulo | Fase | Prioridad |
|--------|------|-----------|
| 🔐 Auth + OTP WhatsApp | 1 | 🔴 Crítico |
| 💳 Membresías + Mercado Pago | 1 | 🔴 Crítico |
| 📱 QR Check-in (Redis) | 2 | 🔴 Crítico |
| 🤖 WhatsApp bot + recordatorios | 3 | 🔴 Crítico |
| 📚 Cursos + POS | 4 | 🟡 Alta |
| 📊 Dashboard analytics | 5 | 🟡 Alta |
| 🚀 PWA + producción | 6 | 🟡 Alta |
| 🛒 Marketplace rutinas/nutrición | 7 | 🔴 Crítico (pedido cliente) |
| 🏅 Gamificación | 8 | 🟢 Media |
| 💰 Referidos | 8 | 🟢 Media |
| 🧊 Congelar membresía | 9 | 🟡 Alta |
| 🗓️ Reservas de clases | 9 | 🟡 Alta |
| 📏 Seguimiento corporal | 9 | 🟢 Media |
| 💬 Chat interno | 9 | 🟢 Media |
| 🌍 Multi-idioma / App móvil | 10 | ⚪ Baja |
