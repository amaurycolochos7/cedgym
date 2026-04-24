// ═══════════════════════════════════════════════════════════════
// CED-GYM — DEMO seed.
//
// Bulk-creates realistic demo data on top of the bootstrap seed
// (workspace `ced-gym` + superadmin). Safe to run multiple times:
// every write is `upsert`-based or skipped when the target row
// already exists.
//
// Covered entities:
//   • 11 users (admin, receptionists, trainers, athletes)
//   • 5 memberships (varied plans / billing cycles / statuses)
//   • 5 published courses
//   • 8 digital products (routines, nutrition, ebook, video, bundle)
//   • 10 inventory items (Redis-backed; see routes/inventory.js)
//   • 5 promo codes
//   • Check-ins for heatmap seeding (Diego & María, last 20 days)
//   • 2 approved payments in the last 30 days
//
// Usage: `node apps/api/src/seed-demo.js` (from the repo root).
// ═══════════════════════════════════════════════════════════════
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { prisma } from '@cedgym/db';
import { saveItem, auditOp } from './routes/inventory.js';

// ─── Constants ───────────────────────────────────────────────
const WORKSPACE_SLUG = 'ced-gym';
const DEMO_PASSWORD = 'Demo2026!';

// Mexico price anchors (MXN, integer cents-free).
const PLAN_PRICES = {
    STARTER: { MONTHLY: 599, QUARTERLY: 1590, ANNUAL: 5990 },
    PRO:     { MONTHLY: 899, QUARTERLY: 2490, ANNUAL: 8990 },
    ELITE:   { MONTHLY: 1490, QUARTERLY: 3990, ANNUAL: 14990 },
};

// Counters the final summary reads. Keeping them here so every
// helper can just `counters.users++` without threading state.
const counters = {
    users: 0,
    memberships: 0,
    courses: 0,
    products: 0,
    inventory: 0,
    promos: 0,
    checkins: 0,
    payments: 0,
};

// ─── Helpers ─────────────────────────────────────────────────
function daysFromNow(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}

function atTime(date, hour, minute = 0) {
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    return d;
}

/**
 * Idempotent user creation. Uses the unique `email` constraint so
 * re-runs neither duplicate nor bump counters for rows already
 * present. Returns the row either way.
 */
async function upsertUser({
    email,
    name,
    full_name,
    phone,
    role,
    workspace_id,
    password_hash,
    birth_date = null,
    gender = null,
}) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return existing;

    const user = await prisma.user.create({
        data: {
            workspace_id,
            name,
            full_name: full_name || name,
            email,
            phone,
            birth_date,
            gender,
            role,
            password_hash,
            status: 'ACTIVE',
            phone_verified_at: new Date(),
            email_verified_at: new Date(),
            profile_completed: true,
        },
    });
    counters.users++;
    return user;
}

/**
 * Create (or skip) a membership row for the given user. `user_id`
 * is @unique on Membership so a second run is a noop.
 */
async function upsertMembership(workspace_id, user_id, data) {
    const existing = await prisma.membership.findUnique({ where: { user_id } });
    if (existing) return existing;
    const row = await prisma.membership.create({
        data: { workspace_id, user_id, ...data },
    });
    counters.memberships++;
    return row;
}

/**
 * Courses have no natural unique (name isn't unique in the schema),
 * so we guard by (workspace_id, name) at runtime.
 */
async function upsertCourse(workspace_id, course) {
    const existing = await prisma.course.findFirst({
        where: { workspace_id, name: course.name },
    });
    if (existing) return existing;
    const row = await prisma.course.create({ data: { workspace_id, ...course } });
    counters.courses++;
    return row;
}

/**
 * DigitalProduct has @@unique([workspace_id, slug]) — perfect for
 * idempotent upserts.
 */
async function upsertDigitalProduct(workspace_id, product) {
    const existing = await prisma.digitalProduct.findUnique({
        where: {
            workspace_id_slug: { workspace_id, slug: product.slug },
        },
    });
    if (existing) return existing;
    const row = await prisma.digitalProduct.create({ data: { workspace_id, ...product } });
    counters.products++;
    return row;
}

async function upsertPromoCode(workspace_id, data) {
    const existing = await prisma.promoCode.findUnique({ where: { code: data.code } });
    if (existing) return existing;
    const row = await prisma.promoCode.create({ data: { workspace_id, ...data } });
    counters.promos++;
    return row;
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
    console.log('[seed-demo] starting…');

    // 1) Workspace ─────────────────────────────────────────────
    const workspace = await prisma.workspace.findUnique({ where: { slug: WORKSPACE_SLUG } });
    if (!workspace) {
        throw new Error(`Workspace "${WORKSPACE_SLUG}" not found. Run \`node apps/api/src/seed.js\` first.`);
    }
    const WS = workspace.id;
    console.log(`[seed-demo] workspace: ${WS}`);

    // 2) Users ─────────────────────────────────────────────────
    // All demo accounts share one bcrypt hash so the workload runs
    // exactly once — bcrypt at cost 12 is the slowest step here.
    const password_hash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // Manager
    const admin = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'gerente@cedgym.mx',
        name: 'Juan Gerente', full_name: 'Juan Gerente Martínez',
        phone: '+5216141000001', role: 'ADMIN', gender: 'MALE',
    });

    // Reception desk
    const recep1 = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'recepcion1@cedgym.mx',
        name: 'Ana Recepción', full_name: 'Ana Sofía Recepción García',
        phone: '+5216141000002', role: 'RECEPTIONIST', gender: 'FEMALE',
    });
    const recep2 = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'recepcion2@cedgym.mx',
        name: 'Luis Recepción', full_name: 'Luis Fernando Recepción López',
        phone: '+5216141000003', role: 'RECEPTIONIST', gender: 'MALE',
    });

    // Trainers
    const trainerFootball = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'coach.football@cedgym.mx',
        name: 'Carlos Ruiz', full_name: 'Carlos Alberto Ruiz Mendoza',
        phone: '+5216141000010', role: 'TRAINER', gender: 'MALE',
    });
    const trainerBoxing = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'coach.boxing@cedgym.mx',
        name: 'Miguel Torres', full_name: 'Miguel Ángel Torres Hernández',
        phone: '+5216141000011', role: 'TRAINER', gender: 'MALE',
    });
    const trainerPower = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'coach.powerlifting@cedgym.mx',
        name: 'Roberto Díaz', full_name: 'Roberto Iván Díaz Salazar',
        phone: '+5216141000012', role: 'TRAINER', gender: 'MALE',
    });

    // Athletes
    const diego = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'atleta1@demo.mx',
        name: 'Diego López', full_name: 'Diego Armando López Reyes',
        phone: '+5216141000101', role: 'ATHLETE', gender: 'MALE',
        birth_date: new Date('1996-05-14'),
    });
    const maria = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'atleta2@demo.mx',
        name: 'María Hernández', full_name: 'María Fernanda Hernández Ortiz',
        phone: '+5216141000102', role: 'ATHLETE', gender: 'FEMALE',
        birth_date: new Date('1994-09-02'),
    });
    const pedro = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'atleta3@demo.mx',
        name: 'Pedro Sánchez', full_name: 'Pedro Antonio Sánchez Cruz',
        phone: '+5216141000103', role: 'ATHLETE', gender: 'MALE',
        birth_date: new Date('2000-02-18'),
    });
    const sofia = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'atleta4@demo.mx',
        name: 'Sofía Ramírez', full_name: 'Sofía Isabel Ramírez Navarro',
        phone: '+5216141000104', role: 'ATHLETE', gender: 'FEMALE',
        birth_date: new Date('1998-11-30'),
    });
    const jorge = await upsertUser({
        workspace_id: WS, password_hash,
        email: 'atleta5@demo.mx',
        name: 'Jorge Castro', full_name: 'Jorge Luis Castro Peña',
        phone: '+5216141000105', role: 'ATHLETE', gender: 'MALE',
        birth_date: new Date('1991-07-09'),
    });

    // 3) Memberships ───────────────────────────────────────────
    // Mirrors the brief: active / expiring-in-6-days / expired-yesterday
    // so the web UI has coverage for every renewal-lane edge case.
    await upsertMembership(WS, diego.id, {
        plan: 'PRO', status: 'ACTIVE',
        starts_at: daysFromNow(-10), expires_at: daysFromNow(20),
        price_mxn: PLAN_PRICES.PRO.MONTHLY, billing_cycle: 'MONTHLY',
        sport: 'FOOTBALL',
    });
    await upsertMembership(WS, maria.id, {
        plan: 'ELITE', status: 'ACTIVE',
        starts_at: daysFromNow(-30), expires_at: daysFromNow(60),
        price_mxn: PLAN_PRICES.ELITE.QUARTERLY, billing_cycle: 'QUARTERLY',
        sport: 'CROSSFIT',
    });
    await upsertMembership(WS, pedro.id, {
        plan: 'STARTER', status: 'ACTIVE',
        starts_at: daysFromNow(-24), expires_at: daysFromNow(6),
        price_mxn: PLAN_PRICES.STARTER.MONTHLY, billing_cycle: 'MONTHLY',
        sport: 'GENERAL_FITNESS',
    });
    await upsertMembership(WS, sofia.id, {
        plan: 'PRO', status: 'ACTIVE',
        starts_at: daysFromNow(-60), expires_at: daysFromNow(305),
        price_mxn: PLAN_PRICES.PRO.ANNUAL, billing_cycle: 'ANNUAL',
        sport: 'GENERAL_FITNESS',
    });
    await upsertMembership(WS, jorge.id, {
        plan: 'STARTER', status: 'EXPIRED',
        starts_at: daysFromNow(-31), expires_at: daysFromNow(-1),
        price_mxn: PLAN_PRICES.STARTER.MONTHLY, billing_cycle: 'MONTHLY',
        sport: 'BOXING',
    });
    // 4) Courses ───────────────────────────────────────────────
    // `schedule` is free-form JSON — frontend treats it as an array
    // of { day, start, end } so we emit that shape.
    await upsertCourse(WS, {
        name: 'Pretemporada de Football Americano 2026',
        description: 'Programa intensivo de 12 semanas enfocado en fuerza explosiva, velocidad, técnica posicional y acondicionamiento específico para football americano. Incluye análisis de video, plan nutricional y tests de desempeño.',
        sport: 'FOOTBALL', trainer_id: trainerFootball.id,
        capacity: 20, enrolled: 7, price_mxn: 2490,
        starts_at: daysFromNow(7), ends_at: daysFromNow(7 + 12 * 7),
        schedule: [
            { day: 'MON', start: '18:00', end: '20:00' },
            { day: 'WED', start: '18:00', end: '20:00' },
            { day: 'FRI', start: '18:00', end: '20:00' },
            { day: 'SAT', start: '09:00', end: '11:00' },
        ],
        published: true,
    });
    await upsertCourse(WS, {
        name: 'Powerlifting 12 Weeks',
        description: 'Programa periodizado de 12 semanas para competencia raw. Se trabaja sentadilla, press y peso muerto con análisis técnico semanal, accesorios de debilidades y deload planificado.',
        sport: 'POWERLIFTING', trainer_id: trainerPower.id,
        capacity: 15, enrolled: 9, price_mxn: 3190,
        starts_at: daysFromNow(14), ends_at: daysFromNow(14 + 12 * 7),
        schedule: [
            { day: 'TUE', start: '19:00', end: '21:00' },
            { day: 'THU', start: '19:00', end: '21:00' },
            { day: 'SAT', start: '10:00', end: '12:30' },
        ],
        published: true,
    });
    await upsertCourse(WS, {
        name: 'Boxeo Intermedio',
        description: 'Nivel intermedio: combinaciones, esquivas, juego de cintura, trabajo de sparring controlado y condición aeróbica-anaeróbica específica de boxeo.',
        sport: 'BOXING', trainer_id: trainerBoxing.id,
        capacity: 12, enrolled: 5, price_mxn: 2490,
        starts_at: daysFromNow(10), ends_at: daysFromNow(10 + 10 * 7),
        schedule: [
            { day: 'MON', start: '19:00', end: '20:30' },
            { day: 'WED', start: '19:00', end: '20:30' },
            { day: 'FRI', start: '19:00', end: '20:30' },
        ],
        published: true,
    });
    await upsertCourse(WS, {
        name: 'Nutrición Deportiva',
        description: 'Curso teórico-práctico de 8 semanas. Macros, timing, hidratación, suplementación responsable, planeación de comidas por deporte. Incluye asesoría individual.',
        sport: 'NUTRITION', trainer_id: admin.id, // uses ADMIN as placeholder nutritionist
        capacity: 30, enrolled: 12, price_mxn: 1290,
        starts_at: daysFromNow(5), ends_at: daysFromNow(5 + 8 * 7),
        schedule: [
            { day: 'TUE', start: '20:00', end: '21:30' },
        ],
        published: true,
    });
    await upsertCourse(WS, {
        name: 'Escuela Infantil de Football',
        description: 'Programa formativo para niños y niñas 8-14 años: fundamentos de football americano tocho bandera, coordinación, disciplina y trabajo en equipo.',
        sport: 'FOOTBALL', trainer_id: trainerFootball.id,
        capacity: 25, enrolled: 14, price_mxn: 890,
        starts_at: daysFromNow(3), ends_at: daysFromNow(3 + 16 * 7),
        schedule: [
            { day: 'TUE', start: '17:00', end: '18:30' },
            { day: 'THU', start: '17:00', end: '18:30' },
            { day: 'SAT', start: '09:00', end: '10:30' },
        ],
        published: true,
    });

    // 5) Digital products (marketplace) ─────────────────────────
    // Tiny helper so every `content` JSON has the same shape
    // (`weeks: [{ days: [{ exercises: [...] }] }]`) the app expects.
    const routineContent = (weeks, daysPerWeek, exercisesPerDay) => ({
        weeks: Array.from({ length: weeks }, (_, w) => ({
            week: w + 1,
            days: Array.from({ length: daysPerWeek }, (_, d) => ({
                day: d + 1,
                name: `Día ${d + 1}`,
                exercises: exercisesPerDay.map((e, i) => ({
                    order: i + 1, name: e.name, sets: e.sets, reps: e.reps, rest: e.rest,
                })),
            })),
        })),
    });

    const hipertrofiaExercises = [
        { name: 'Press de banca', sets: 4, reps: '8-10', rest: '120s' },
        { name: 'Remo con barra', sets: 4, reps: '8-10', rest: '120s' },
        { name: 'Sentadilla trasera', sets: 4, reps: '8-10', rest: '150s' },
        { name: 'Press militar', sets: 3, reps: '10-12', rest: '90s' },
        { name: 'Jalón al pecho', sets: 3, reps: '10-12', rest: '90s' },
        { name: 'Curl bíceps con barra', sets: 3, reps: '12', rest: '60s' },
    ];
    await upsertDigitalProduct(WS, {
        type: 'ROUTINE', slug: 'hipertrofia-8-semanas',
        title: 'Hipertrofia 8 semanas',
        description: 'Rutina progresiva de 8 semanas, 4 días por semana. Split torso/pierna pensado para ganancias de tamaño muscular. Ideal para principiantes-intermedios.',
        level: 'BEGINNER', duration_weeks: 8, price_mxn: 699,
        author_id: trainerPower.id, revenue_split: 70,
        content: routineContent(8, 4, hipertrofiaExercises),
        video_urls: [], published: true, featured: false,
    });

    const powerBasicExercises = [
        { name: 'Sentadilla con pausa', sets: 5, reps: '5', rest: '180s' },
        { name: 'Press de banca', sets: 5, reps: '5', rest: '180s' },
        { name: 'Peso muerto', sets: 3, reps: '5', rest: '240s' },
        { name: 'Press militar', sets: 3, reps: '8', rest: '120s' },
        { name: 'Remo Pendlay', sets: 3, reps: '6-8', rest: '120s' },
    ];
    await upsertDigitalProduct(WS, {
        type: 'ROUTINE', slug: 'powerlifting-basico',
        title: 'Powerlifting Básico',
        description: 'Programa introductorio de 10 semanas al powerlifting competitivo. Enfocado en técnica de SQ/BP/DL, progresión lineal con bloques de intensidad.',
        level: 'INTERMEDIATE', duration_weeks: 10, price_mxn: 899,
        author_id: trainerPower.id, revenue_split: 70,
        content: routineContent(10, 4, powerBasicExercises),
        video_urls: [], published: true, featured: true,
    });

    const fullBodyExercises = [
        { name: 'Sentadilla goblet', sets: 3, reps: '12', rest: '60s' },
        { name: 'Press banca con mancuernas', sets: 3, reps: '12', rest: '60s' },
        { name: 'Remo mancuerna', sets: 3, reps: '12', rest: '60s' },
        { name: 'Hip thrust', sets: 3, reps: '15', rest: '60s' },
        { name: 'Plancha', sets: 3, reps: '45s', rest: '45s' },
    ];
    await upsertDigitalProduct(WS, {
        type: 'ROUTINE', slug: 'rutina-full-body-4d',
        title: 'Rutina Full Body 4d',
        description: 'Rutina full-body 4 días/semana ideal para quienes regresan al gym o empiezan. 6 semanas con progresión suave.',
        level: 'BEGINNER', duration_weeks: 6, price_mxn: 499,
        author_id: admin.id, revenue_split: 70,
        content: routineContent(6, 4, fullBodyExercises),
        video_urls: [], published: true, featured: false,
    });

    // Nutrition plans use a totally different JSON shape — keep it
    // simple: 7-day meal rotation + macros.
    const nutritionContent = (kcal, p, c, f) => ({
        macros: { kcal, protein_g: p, carbs_g: c, fat_g: f },
        days: Array.from({ length: 7 }, (_, i) => ({
            day: i + 1,
            meals: [
                { name: 'Desayuno', items: ['Avena 80g', 'Huevos enteros 3', 'Plátano', 'Almendras 15g'] },
                { name: 'Comida', items: ['Arroz 150g cocido', 'Pollo 180g', 'Ensalada', 'Aceite oliva 10g'] },
                { name: 'Pre-entreno', items: ['Tortillas 2', 'Atún 100g', 'Fruta'] },
                { name: 'Cena', items: ['Pasta integral 100g', 'Carne molida 150g', 'Verduras al vapor'] },
            ],
        })),
    });
    await upsertDigitalProduct(WS, {
        type: 'NUTRITION_PLAN', slug: 'plan-volumen-limpio',
        title: 'Plan Volumen Limpio',
        description: 'Plan de 12 semanas para ganancia muscular con superávit controlado. 3000 kcal, enfoque en calidad de alimentos.',
        level: 'ALL_LEVELS', duration_weeks: 12, price_mxn: 1290,
        author_id: admin.id, revenue_split: 70,
        content: nutritionContent(3000, 180, 380, 85),
        video_urls: [], published: true, featured: false,
    });
    await upsertDigitalProduct(WS, {
        type: 'NUTRITION_PLAN', slug: 'definicion-12-semanas',
        title: 'Definición 12 semanas',
        description: 'Protocolo de recomposición corporal. 12 semanas con déficit progresivo, refeeds semanales y guía de medición.',
        level: 'INTERMEDIATE', duration_weeks: 12, price_mxn: 1290,
        author_id: admin.id, revenue_split: 70,
        content: nutritionContent(2200, 190, 210, 70),
        video_urls: [], published: true, featured: true,
    });

    await upsertDigitalProduct(WS, {
        type: 'EBOOK', slug: 'guia-tecnica-sentadilla',
        title: 'Guía de Técnica de Sentadilla',
        description: 'Ebook de 60 páginas. Anatomía, variaciones, errores comunes, progresiones y warm-up específico. Incluye checklist de forma.',
        level: 'ALL_LEVELS', duration_weeks: null, price_mxn: 299,
        author_id: trainerPower.id, revenue_split: 70,
        content: {
            chapters: [
                { n: 1, title: 'Anatomía funcional', pages: 8 },
                { n: 2, title: 'Setup y respiración', pages: 10 },
                { n: 3, title: 'Variantes: low-bar, high-bar, front squat', pages: 14 },
                { n: 4, title: 'Errores comunes y cómo corregirlos', pages: 18 },
                { n: 5, title: 'Programación y volumen', pages: 10 },
            ],
        },
        video_urls: [], published: true, featured: false,
    });

    await upsertDigitalProduct(WS, {
        type: 'VIDEO_COURSE', slug: 'fundamentos-combate-mma',
        title: 'Fundamentos de Combate MMA',
        description: 'Video-curso de 6 módulos con más de 5 horas de contenido. Stand-up, clinch, ground & pound y transiciones básicas.',
        level: 'INTERMEDIATE', duration_weeks: null, price_mxn: 1990,
        author_id: trainerBoxing.id, revenue_split: 70,
        content: {
            modules: [
                { n: 1, title: 'Postura y footwork', duration_min: 55 },
                { n: 2, title: 'Jab, cross, hook', duration_min: 62 },
                { n: 3, title: 'Clinch y proyecciones', duration_min: 48 },
                { n: 4, title: 'Defensas y bloqueos', duration_min: 50 },
                { n: 5, title: 'Ground & pound', duration_min: 58 },
                { n: 6, title: 'Combinaciones finales', duration_min: 45 },
            ],
        },
        video_urls: [], published: true, featured: true,
    });

    await upsertDigitalProduct(WS, {
        type: 'BUNDLE', slug: 'pretemporada-football-completa',
        title: 'Pretemporada Football Completa',
        description: 'Bundle todo-en-uno: rutina de fuerza/velocidad de 12 semanas + plan de nutrición + biblioteca de videos de técnica posicional. Recomendado para temporada competitiva.',
        sport: 'FOOTBALL', level: 'ADVANCED', duration_weeks: 12, price_mxn: 3490,
        author_id: trainerFootball.id, revenue_split: 70,
        content: {
            includes: [
                { type: 'ROUTINE', ref: 'hipertrofia-8-semanas' },
                { type: 'NUTRITION_PLAN', ref: 'plan-volumen-limpio' },
                { type: 'VIDEO_COURSE', ref: 'fundamentos-combate-mma' },
            ],
            bonus: 'Llamada de estrategia 1-a-1 (30min) con el coach.',
        },
        video_urls: [], published: true, featured: true,
    });

    // 6) Inventory (Redis) ────────────────────────────────────
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        lazyConnect: false,
        maxRetriesPerRequest: 3,
    });
    try {
        const INVENTORY = [
            { sku: 'PROT-VAN-2KG',  name: 'Proteína Whey Vainilla 2kg',   price_mxn: 890,  stock: 15, category: 'Proteínas' },
            { sku: 'PROT-CHOC-2KG', name: 'Proteína Whey Chocolate 2kg',  price_mxn: 890,  stock: 10, category: 'Proteínas' },
            { sku: 'CREAT-300',     name: 'Creatina Monohidratada 300g',  price_mxn: 490,  stock: 25, category: 'Creatina' },
            { sku: 'PREW-30',       name: 'Pre-entreno Explosion 30 servicios', price_mxn: 690, stock: 8, category: 'Pre-entrenos' },
            { sku: 'BCAA-30',       name: 'BCAA Fruit Punch 30 serv',      price_mxn: 490,  stock: 12, category: 'Aminoácidos' },
            { sku: 'AMINO-POST',    name: 'Amino Post-Workout 400g',       price_mxn: 590,  stock: 6,  category: 'Aminoácidos' },
            { sku: 'GAINER-3KG',    name: 'Mass Gainer 3kg',               price_mxn: 1290, stock: 5,  category: 'Ganadores de peso' },
            { sku: 'VITC-100',      name: 'Vitamina C 1000mg 100 tabs',    price_mxn: 190,  stock: 30, category: 'Vitaminas' },
            { sku: 'SHAKER-800',    name: 'Shaker 800ml con logo CED-GYM', price_mxn: 149,  stock: 40, category: 'Accesorios' },
            { sku: 'STRAPS',        name: 'Straps de Powerlifting par',    price_mxn: 249,  stock: 20, category: 'Accesorios' },
        ];
        const now = new Date().toISOString();
        for (const p of INVENTORY) {
            const key = `inventory:${WS}:${p.sku}`;
            const existing = await redis.get(key);
            if (existing) continue;
            const item = {
                sku: p.sku,
                name: p.name,
                price_mxn: p.price_mxn,
                stock: p.stock,
                category: p.category || null,
                cost_mxn: null,
                description: null,
                created_at: now,
                updated_at: now,
            };
            await saveItem(redis, WS, item);
            await auditOp(redis, WS, p.sku, {
                at: now,
                delta: p.stock,
                new_stock: p.stock,
                actor_id: admin.id,
                reason: 'demo-seed',
                source: 'seed-demo',
            });
            counters.inventory++;
        }
    } finally {
        // Close our own Redis client — seed.js pattern. Prisma keeps
        // its singleton so we only disconnect it in `finally` below.
        await redis.quit();
    }

    // 8) Promo codes ───────────────────────────────────────────
    // `applies_to` is String[] in schema — we wire the tokens the
    // PaymentType enum uses so promos gate on type at checkout.
    await upsertPromoCode(WS, {
        code: 'BIENVENIDO10', type: 'PERCENTAGE', value: 10,
        applies_to: ['MEMBERSHIP'], max_uses: 100,
    });
    await upsertPromoCode(WS, {
        code: 'AMIGO20', type: 'PERCENTAGE', value: 20,
        applies_to: ['MEMBERSHIP'], max_uses: 50,
    });
    await upsertPromoCode(WS, {
        code: 'SUMMER15', type: 'PERCENTAGE', value: 15,
        applies_to: ['DIGITAL_PRODUCT'], max_uses: 200,
    });
    await upsertPromoCode(WS, {
        code: 'VUELVE10', type: 'PERCENTAGE', value: 10,
        applies_to: ['MEMBERSHIP', 'DIGITAL_PRODUCT'], max_uses: null,
    });
    await upsertPromoCode(WS, {
        code: 'PRIMERAVEZ', type: 'FIXED_AMOUNT', value: 100,
        applies_to: ['MEMBERSHIP'], max_uses: 500,
    });

    // 9) Check-ins (heatmap data) ──────────────────────────────
    // Spread ~3-4 check-ins/week over the last 20 days for Diego
    // and María at realistic morning/evening hours. Dedupe by
    // checking for any existing row in the same hourly slot.
    const HEATMAP_USERS = [
        { user: diego, morningBias: true },   // prefers 6-9am
        { user: maria, morningBias: false },  // prefers 7-10pm
    ];
    for (const { user, morningBias } of HEATMAP_USERS) {
        // Coarse idempotency: if this user already has any check-in
        // in the last 20 days, the heatmap is considered seeded.
        const alreadySeeded = await prisma.checkIn.findFirst({
            where: {
                user_id: user.id,
                scanned_at: { gte: daysFromNow(-21) },
            },
        });
        if (alreadySeeded) continue;

        for (let offset = -20; offset <= -1; offset++) {
            // Skip ~40% of days so it's "3-4 per week", not daily.
            if (Math.random() < 0.4) continue;
            const dayOfWeek = daysFromNow(offset).getDay();
            // Skip Sundays (0) for added realism.
            if (dayOfWeek === 0) continue;

            const hour = morningBias
                ? 6 + Math.floor(Math.random() * 4)   // 6-9
                : 19 + Math.floor(Math.random() * 4); // 19-22
            const scanned_at = atTime(daysFromNow(offset), hour, Math.floor(Math.random() * 60));

            // Dedupe guard: skip if we already have a check-in
            // within the same hour block for this user.
            const hourStart = new Date(scanned_at); hourStart.setMinutes(0, 0, 0);
            const hourEnd = new Date(hourStart); hourEnd.setHours(hourEnd.getHours() + 1);
            const dup = await prisma.checkIn.findFirst({
                where: {
                    user_id: user.id,
                    scanned_at: { gte: hourStart, lt: hourEnd },
                },
            });
            if (dup) continue;

            await prisma.checkIn.create({
                data: {
                    workspace_id: WS,
                    user_id: user.id,
                    method: 'QR',
                    scanned_at,
                },
            });
            counters.checkins++;
        }
    }

    // 10) Payments (dashboard revenue) ────────────────────────
    // Two APPROVED payments in the last 30d. mp_payment_id is
    // @unique so we gate on that and skip reruns cleanly.
    const PAY_ROWS = [
        {
            user_id: diego.id,
            amount: PLAN_PRICES.PRO.MONTHLY,
            type: 'MEMBERSHIP',
            mp_payment_id: 'demo-mp-pay-0001',
            description: 'Renovación membresía PRO mensual',
            paid_at: daysFromNow(-12),
        },
        {
            user_id: maria.id,
            amount: PLAN_PRICES.ELITE.QUARTERLY,
            type: 'MEMBERSHIP',
            mp_payment_id: 'demo-mp-pay-0002',
            description: 'Membresía ELITE trimestral',
            paid_at: daysFromNow(-5),
        },
    ];
    for (const p of PAY_ROWS) {
        const existing = await prisma.payment.findUnique({
            where: { mp_payment_id: p.mp_payment_id },
        });
        if (existing) continue;
        await prisma.payment.create({
            data: {
                workspace_id: WS,
                user_id: p.user_id,
                amount: p.amount,
                type: p.type,
                description: p.description,
                mp_payment_id: p.mp_payment_id,
                status: 'APPROVED',
                paid_at: p.paid_at,
                metadata: { source: 'seed-demo' },
            },
        });
        counters.payments++;
    }

    // ─── Summary ─────────────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[seed-demo] ✅ done');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Users created:        ${counters.users}`);
    console.log(`  Memberships created:  ${counters.memberships}`);
    console.log(`  Courses created:      ${counters.courses}`);
    console.log(`  Digital products:     ${counters.products}`);
    console.log(`  Inventory items:      ${counters.inventory}`);
    console.log(`  Promo codes:          ${counters.promos}`);
    console.log(`  Check-ins seeded:     ${counters.checkins}`);
    console.log(`  Payments APPROVED:    ${counters.payments}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Demo password: ${DEMO_PASSWORD}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
    .catch((e) => {
        console.error('[seed-demo] FAILED:', e);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
