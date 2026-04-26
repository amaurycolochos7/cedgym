// ─────────────────────────────────────────────────────────────────
// AI-powered meal plan generation.
//
// Endpoints (all require JWT):
//   POST /ai/meal-plans/generate            → generate + persist plan
//   GET  /ai/meal-plans/me                  → active plan, meals grouped by day
//   GET  /ai/meal-plans/me/history          → all plans for the user
//   GET  /ai/meal-plans/:id/shopping-list   → aggregated shopping list
//
// Flow for POST /generate:
//   1. Load user + fitness_profile
//   2. Auto-calculate kcal target if not provided (Mifflin-St Jeor TDEE)
//   3. Call generateJSON (OpenAI) with a Mexican-nutritionist prompt
//   4. Deactivate any previous active plan for this user
//   5. Persist MealPlan + Meal rows in a transaction
//   6. Return the full plan with nested meals
//
// Note: the `openai.js` helper is being written by a sibling agent —
// we import it eagerly; module resolution happens when the first route
// fires, by which point the helper will be in place.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { generateJSON } from '../lib/openai.js';
import { assertAIQuota } from '../lib/ai-quota.js';
import { getPlanByCode } from '../lib/memberships.js';

// ─── Schemas ─────────────────────────────────────────────────────

const ObjectiveEnum = z.enum([
    'WEIGHT_LOSS',
    'MUSCLE_GAIN',
    'MAINTENANCE',
    'STRENGTH',
    'ENDURANCE',
    'GENERAL_FITNESS',
]);

const BudgetEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);

const generateBody = z.object({
    objective: ObjectiveEnum.optional(),
    calories_target: z.number().int().positive().max(6000).optional(),
    restrictions: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    allergies: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    disliked_foods: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    meals_per_day: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional(),
    budget: BudgetEnum.optional(),
    country: z.string().trim().min(2).max(3).optional(),
});

// Zod schema the LLM output must conform to.
const mealPlanOutputSchema = z.object({
    plan: z.object({
        name: z.string().min(1).max(120),
        goal: ObjectiveEnum,
        calories_target: z.number().int().positive(),
        protein_g: z.number().int().nonnegative(),
        carbs_g: z.number().int().nonnegative(),
        fats_g: z.number().int().nonnegative(),
        restrictions: z.array(z.string()).default([]),
    }),
    meals: z
        .array(
            z.object({
                day_of_week: z.number().int().min(0).max(6),
                meal_type: z.enum(['BREAKFAST', 'SNACK_AM', 'LUNCH', 'SNACK_PM', 'DINNER']),
                name: z.string().min(1).max(120),
                description: z.string().min(1).max(600),
                ingredients: z.array(z.string().min(1).max(120)).min(1).max(25),
                calories: z.number().int().nonnegative(),
                protein_g: z.number().int().nonnegative(),
                carbs_g: z.number().int().nonnegative(),
                fats_g: z.number().int().nonnegative(),
                prep_time_min: z.number().int().nonnegative().max(240).optional().nullable(),
                order_index: z.number().int().min(0).max(5),
            }),
        )
        .min(1)
        .max(60),
});

// ─── Macro splits per objective ──────────────────────────────────
const MACRO_SPLITS = {
    WEIGHT_LOSS:    { p: 0.40, c: 0.30, f: 0.30 },
    MUSCLE_GAIN:    { p: 0.30, c: 0.50, f: 0.20 },
    MAINTENANCE:    { p: 0.30, c: 0.40, f: 0.30 },
    STRENGTH:       { p: 0.30, c: 0.40, f: 0.30 },
    ENDURANCE:      { p: 0.25, c: 0.55, f: 0.20 },
    GENERAL_FITNESS:{ p: 0.30, c: 0.40, f: 0.30 },
};

const ACTIVITY_FACTORS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    high: 1.725,
    very_high: 1.9,
};

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Mifflin-St Jeor BMR → TDEE → target.
 * Returns null when profile data is insufficient — caller falls back
 * to a gender-based default.
 */
function estimateCaloriesFromProfile(profile, gender, objective) {
    if (!profile || typeof profile !== 'object') return null;
    const kg = Number(profile.weight_kg);
    const cm = Number(profile.height_cm);
    const age = Number(profile.age);
    const sex = String(profile.gender || gender || '').toUpperCase();
    if (!kg || !cm || !age) return null;

    const bmr = 10 * kg + 6.25 * cm - 5 * age + (sex === 'M' || sex === 'MALE' ? 5 : -161);
    const factor = ACTIVITY_FACTORS[String(profile.activity_level || '').toLowerCase()] || 1.375;
    const tdee = bmr * factor;

    let target = tdee;
    if (objective === 'WEIGHT_LOSS') target = tdee - 500;
    else if (objective === 'MUSCLE_GAIN') target = tdee + 300;

    return Math.max(1200, Math.round(target));
}

function fallbackCalories(gender) {
    const g = String(gender || '').toUpperCase();
    if (g === 'FEMALE' || g === 'F') return 1800;
    if (g === 'MALE' || g === 'M') return 2200;
    return 2000;
}

function computeMacros(calories, objective) {
    const split = MACRO_SPLITS[objective] || MACRO_SPLITS.MAINTENANCE;
    // Protein & carbs → 4 kcal/g, fats → 9 kcal/g.
    return {
        protein_g: Math.round((calories * split.p) / 4),
        carbs_g:   Math.round((calories * split.c) / 4),
        fats_g:    Math.round((calories * split.f) / 9),
    };
}

function buildSystemPrompt() {
    // Voz del nutriólogo del equipo CED·GYM. Estructura inspirada en los
    // planes reales que el Coach Samuel da a sus socios (6 comidas/día,
    // ingredientes mexicanos, cortes magros, 3 litros de agua).
    return `Eres el nutriólogo deportivo del equipo CED·GYM en Chihuahua, México. Trabajas junto al Coach M.A. Samuel Oswaldo Rodríguez Jeffery para dar a cada socio un plan alimenticio que encaje con su entrenamiento.

ESTRUCTURA BASE DEL PLAN (distribución diaria que usamos con nuestros atletas):
- **Al despertar**: 2 vasos de agua + vitamina C, a veces té de manzanilla con canela. Medio servicio de proteína con avena + fresa/plátano si el día arranca fuerte.
- **Desayuno**: proteína magra (claras, huevo, atún), carbo complejo (papa al vapor, avena, tortilla de maíz), fruta cítrica (toronja, naranja), omega 3.
- **Media mañana**: proteína ligera + grasa saludable (aguacate, almendras) + carbo moderado (tostadas, arroz con leche light).
- **Comida**: 200 gr de proteína animal (pollo, carne magra, pescado), 2 tazas de verdura, 2-3 tortillas de maíz, una fruta de postre.
- **Tarde pre-entreno**: yogurt griego + fruta + medio plátano (glucógeno para la sesión). Si entrena fuerte, creatina.
- **Cena**: pescado graso (salmón, atún fresco) + fibra (cereal integral tipo All Bran o ensalada), porción de proteína aislada con agua, vitamina E.
- **Hidratación**: 3 litros de agua al día SIEMPRE.

REGLAS:
- Usas ingredientes MEXICANOS reales: tortilla de maíz, frijol, aguacate, cilantro, cebolla, chile morrón, atún, pescado, pollo, huevo, avena, tostadas, arroz, papa, plátano, fresa, naranja, toronja, manzana, pera, almendras.
- Nombres de comida reconocibles: huevos rancheros light, pollo al pastor, pescado a la veracruzana, ensalada de atún, licuado de avena, etc. — adaptados al objetivo calórico.
- Cantidades SIEMPRE en gramos, piezas o porciones claras (nada de "al gusto").
- Varía los días — no repitas la misma comida más de 2 veces en la semana.
- Suma de calorías diarias dentro del ±10% del target.
- Respetas alergias y restricciones SIN EXCEPCIÓN.
- Incluyes el "Al despertar" como SNACK_AM si meals_per_day=5, o lo fusionas al desayuno si es menor.

TONO: mexicano, cercano, práctico. Nada de inglés innecesario ni nombres rebuscados de superfoods. Si propones algo menos común, explícalo en 1 línea (ej: "quinoa = cereal andino alto en proteína, se prepara como arroz").

Respondes SOLO con JSON válido siguiendo el esquema exacto. Nada antes, nada después.`;
}

function buildUserPrompt({
    objective,
    calories_target,
    protein_g,
    carbs_g,
    fats_g,
    restrictions,
    allergies,
    disliked_foods,
    meals_per_day,
    budget,
    firstName,
}) {
    const listOrNone = (arr) => (arr && arr.length ? arr.join(', ') : 'ninguna');
    const firstNameStr = firstName && firstName.trim() ? firstName.trim() : '(sin nombre)';
    return `Genera un plan alimenticio semanal (7 días × ${meals_per_day} comidas) para este socio mexicano.

NOMBRE DEL SOCIO: ${firstNameStr}
OBJETIVO: ${objective}
CALORÍAS DIARIAS: ${calories_target} kcal
MACROS: ${protein_g}g proteína / ${carbs_g}g carbos / ${fats_g}g grasas
RESTRICCIONES: ${listOrNone(restrictions)}
ALERGIAS: ${listOrNone(allergies)}
NO LE GUSTA: ${listOrNone(disliked_foods)}
PRESUPUESTO: ${budget} (LOW=pollo/arroz/frijoles/huevo/atún; MEDIUM=agregar salmón ocasional, quinoa, frutos rojos; HIGH=libre)
COMIDAS POR DÍA: ${meals_per_day}

REGLAS:
- Varía las comidas entre días (no repetir más de 2 veces)
- Incluye comidas reconocibles mexicanas cuando sea posible (huevos rancheros, pollo al pastor, pescado a la veracruzana, etc.) adaptadas al objetivo
- Las cantidades en gramos deben ser realistas y prácticas
- Suma de calorías por día ≈ target (±10%)
- Lista de ingredientes en cada comida, en gramos o unidades claras

EN EL NOMBRE DEL PLAN ("plan.name"):
- SIEMPRE incluye el nombre del socio si está disponible (no es "(sin nombre)").
- Refleja el objetivo y el target calórico.
- Ejemplos: "Plan de Amaury — hipertrofia 2400 kcal", "Bajada de grasa de Ana — 1700 kcal", "Mantenimiento de Luis — 2100 kcal".
- NUNCA nombres genéricos como "Plan alimenticio estándar" o "Plan general".

SCHEMA JSON:
{
  "plan": {
    "name": "string — nombre personalizado según las reglas de arriba",
    "goal": "WEIGHT_LOSS | MUSCLE_GAIN | MAINTENANCE | STRENGTH | ENDURANCE | GENERAL_FITNESS",
    "calories_target": number,
    "protein_g": number,
    "carbs_g": number,
    "fats_g": number,
    "restrictions": [string]
  },
  "meals": [
    {
      "day_of_week": 0-6,
      "meal_type": "BREAKFAST | SNACK_AM | LUNCH | SNACK_PM | DINNER",
      "name": "string",
      "description": "string (1-2 líneas de cómo prepararla)",
      "ingredients": ["100g pollo", "50g arroz", "1 aguacate"],
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fats_g": number,
      "prep_time_min": number,
      "order_index": number (0 = primera comida del día)
    }
  ]
}`;
}

// Normalize an ingredient line like "100g pollo desmenuzado" into
// { qty:100, unit:'g', name:'pollo desmenuzado' }. Falls back to
// { name: raw, qty: 1, unit: 'unidad' } when we can't parse.
const UNIT_ALIASES = {
    g: 'g', gr: 'g', grs: 'g', gramos: 'g',
    kg: 'kg',
    ml: 'ml',
    l: 'l', litro: 'l', litros: 'l',
    tz: 'taza', taza: 'taza', tazas: 'taza',
    cda: 'cda', cdas: 'cda', cucharada: 'cda', cucharadas: 'cda',
    cdta: 'cdta', cdtas: 'cdta', cucharadita: 'cdta', cucharaditas: 'cdta',
    pz: 'pieza', pza: 'pieza', pzas: 'pieza', pieza: 'pieza', piezas: 'pieza',
    unidad: 'unidad', unidades: 'unidad',
};

function parseIngredient(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    // "100g pollo", "100 g pollo", "1 taza arroz", "2 huevos"
    const m = s.match(/^(\d+(?:[.,]\d+)?)\s*([a-záéíóúñ]+)?\s+(.+)$/i);
    if (m) {
        const qty = parseFloat(m[1].replace(',', '.'));
        let unit = (m[2] || '').toLowerCase();
        let name = m[3].trim();
        if (unit && UNIT_ALIASES[unit]) {
            unit = UNIT_ALIASES[unit];
        } else if (unit && !UNIT_ALIASES[unit]) {
            // No unit — the second word is actually part of the name.
            name = `${unit} ${name}`.trim();
            unit = 'unidad';
        } else {
            unit = 'unidad';
        }
        return { qty, unit, name: name.replace(/\s+/g, ' ') };
    }
    return { qty: 1, unit: 'unidad', name: s };
}

function aggregateShoppingList(meals) {
    // key = normalized name + unit, value = { name, unit, qty }
    const bucket = new Map();
    for (const m of meals) {
        for (const raw of m.ingredients || []) {
            const p = parseIngredient(raw);
            if (!p) continue;
            const key = `${p.name}::${p.unit}`;
            const existing = bucket.get(key);
            if (existing) existing.qty += p.qty;
            else bucket.set(key, { ...p });
        }
    }
    // Render to { name, total } strings sorted alphabetically.
    return Array.from(bucket.values())
        .map(({ name, qty, unit }) => {
            const rounded = Math.round(qty * 100) / 100;
            const total = unit === 'unidad'
                ? `${rounded} ${rounded === 1 ? 'pieza' : 'piezas'}`
                : `${rounded} ${unit}`;
            return { name, total };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// ─────────────────────────────────────────────────────────────────
export default async function aiMealPlansRoutes(fastify) {
    const { prisma } = fastify;
    const guard = { preHandler: [fastify.authenticate] };

    // ─── POST /ai/meal-plans/generate ────────────────────────────
    fastify.post('/ai/meal-plans/generate', guard, async (req) => {
        const parsed = generateBody.safeParse(req.body || {});
        if (!parsed.success) {
            // Surface only the first issue's message instead of the full
            // ZodError JSON, which would leak as an unreadable blob in
            // the toast / inline error UI.
            const first = parsed.error.issues[0];
            const msg = first
                ? `${first.path.join('.') || 'campo'}: ${first.message}`
                : 'Datos inválidos';
            throw err('BAD_BODY', msg, 400);
        }

        const userId = req.user.sub || req.user.id;

        // Enforce plan-tier quota BEFORE spending OpenAI tokens.
        // The returned snapshot tells us whether the user is drawing
        // from the membership's monthly quota or from a paid add-on,
        // which we need below to decide if the addon should be marked
        // CONSUMED after persistence.
        const quotaSnapshot = await assertAIQuota(prisma, userId, 'MEAL_PLAN');

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                workspace_id: true,
                gender: true,
                fitness_profile: true,
                name: true,
                full_name: true,
            },
        });
        if (!user) throw err('USER_NOT_FOUND', 'Usuario no encontrado', 404);
        const firstName = (user.full_name || user.name || '').trim().split(/\s+/)[0] || '';

        const objective = parsed.data.objective || 'MAINTENANCE';
        const meals_per_day = parsed.data.meals_per_day || 5;
        const budget = parsed.data.budget || 'MEDIUM';
        const country = parsed.data.country || 'MX';
        const restrictions = parsed.data.restrictions || [];
        const allergies = parsed.data.allergies || [];
        const disliked_foods = parsed.data.disliked_foods || [];

        // 2. Auto-calc calories when not provided.
        let calories_target = parsed.data.calories_target;
        if (!calories_target) {
            calories_target =
                estimateCaloriesFromProfile(user.fitness_profile, user.gender, objective) ||
                fallbackCalories(user.gender);
        }

        const macros = computeMacros(calories_target, objective);

        // 3. Call OpenAI.
        const system = buildSystemPrompt();
        const userPrompt = buildUserPrompt({
            objective,
            calories_target,
            protein_g: macros.protein_g,
            carbs_g: macros.carbs_g,
            fats_g: macros.fats_g,
            restrictions,
            allergies,
            disliked_foods,
            meals_per_day,
            budget,
            country,
            firstName,
        });

        let aiResult;
        try {
            aiResult = await generateJSON({
                system,
                user: userPrompt,
                schema: mealPlanOutputSchema,
                kind: 'MEAL_PLAN',
                workspace_id: user.workspace_id,
                user_id: user.id,
            });
        } catch (e) {
            req.log.error({ err: e }, '[ai-meal-plans] OpenAI generation failed');
            throw err('AI_GENERATION_FAILED', 'No pudimos generar tu plan en este momento. Intenta de nuevo.', 502);
        }

        const { data, aiGenerationId } = aiResult || {};
        if (!data || !data.plan || !Array.isArray(data.meals)) {
            throw err('AI_GENERATION_FAILED', 'La IA devolvió un plan incompleto', 502);
        }

        // 4 + 5. Deactivate previous + create new plan in one transaction.
        const created = await prisma.$transaction(async (tx) => {
            await tx.mealPlan.updateMany({
                where: { user_id: user.id, is_active: true },
                data: { is_active: false, ended_at: new Date() },
            });

            const plan = await tx.mealPlan.create({
                data: {
                    workspace_id: user.workspace_id,
                    user_id: user.id,
                    name: data.plan.name,
                    goal: data.plan.goal,
                    calories_target: data.plan.calories_target,
                    protein_g: data.plan.protein_g,
                    carbs_g: data.plan.carbs_g,
                    fats_g: data.plan.fats_g,
                    restrictions: data.plan.restrictions || restrictions,
                    source: 'AI_GENERATED',
                    ai_generation_id: aiGenerationId || null,
                    is_active: true,
                    started_at: new Date(),
                },
            });

            if (data.meals.length) {
                await tx.meal.createMany({
                    data: data.meals.map((m) => ({
                        meal_plan_id: plan.id,
                        day_of_week: m.day_of_week,
                        meal_type: m.meal_type,
                        name: m.name,
                        description: m.description,
                        ingredients: m.ingredients,
                        calories: m.calories,
                        protein_g: m.protein_g,
                        carbs_g: m.carbs_g,
                        fats_g: m.fats_g,
                        prep_time_min: m.prep_time_min ?? null,
                        order_index: m.order_index,
                    })),
                });
            }

            const meals = await tx.meal.findMany({
                where: { meal_plan_id: plan.id },
                orderBy: [{ day_of_week: 'asc' }, { order_index: 'asc' }],
            });
            return { plan, meals };
        });

        // ── Post-generation: consume an add-on if the membership
        // plan didn't cover this generation. The new MealPlan is
        // already persisted at this point — if anything below fails
        // we log loud but DO NOT throw, since the user's plan exists.
        try {
            const planMeta = getPlanByCode(quotaSnapshot.plan);
            // No membership at all → entitlement came from the addon
            // (assertAIQuota above guarantees this), so we must consume.
            // Otherwise check whether the membership tier actually covered
            // this generation, or whether it spilled over to an addon.
            let planCoveredThisGeneration;
            if (!planMeta) {
                planCoveredThisGeneration = false;
            } else {
                const planLimit = planMeta.ai_meal_plans_per_month ?? null;
                const usedBefore = quotaSnapshot.meal_plan.used;
                planCoveredThisGeneration =
                    planLimit === null || usedBefore < planLimit;
            }

            if (!planCoveredThisGeneration) {
                const oldestAddon = await prisma.mealPlanAddon.findFirst({
                    where: { user_id: userId, status: 'ACTIVE' },
                    orderBy: { activated_at: 'asc' },
                });
                if (oldestAddon) {
                    await prisma.mealPlanAddon.update({
                        where: { id: oldestAddon.id },
                        data: {
                            status: 'CONSUMED',
                            consumed_at: new Date(),
                            consumed_by_meal_plan_id: created.plan.id,
                        },
                    });
                }
            }
        } catch (e) {
            req.log.warn(
                { err: e, userId, mealPlanId: created.plan.id },
                '[ai-meal-plans] addon consumption failed (plan still delivered)'
            );
        }

        return {
            plan: created.plan,
            meals: created.meals,
            ai: {
                generation_id: aiGenerationId || null,
                cost_usd: aiResult.costUsd ?? null,
                duration_ms: aiResult.durationMs ?? null,
            },
        };
    });

    // ─── GET /ai/meal-plans/me ──────────────────────────────────
    // Active plan with meals grouped by day_of_week (0..6).
    fastify.get('/ai/meal-plans/me', guard, async (req) => {
        const userId = req.user.sub || req.user.id;

        const plan = await prisma.mealPlan.findFirst({
            where: { user_id: userId, is_active: true },
            orderBy: { created_at: 'desc' },
            include: {
                meals: {
                    orderBy: [{ day_of_week: 'asc' }, { order_index: 'asc' }],
                },
            },
        });

        if (!plan) return { plan: null, days: [] };

        // Group by day_of_week.
        const days = Array.from({ length: 7 }, (_, d) => ({
            day_of_week: d,
            meals: [],
            total_calories: 0,
            total_protein_g: 0,
            total_carbs_g: 0,
            total_fats_g: 0,
        }));
        for (const m of plan.meals) {
            const bucket = days[m.day_of_week];
            if (!bucket) continue;
            bucket.meals.push(m);
            bucket.total_calories += m.calories || 0;
            bucket.total_protein_g += m.protein_g || 0;
            bucket.total_carbs_g += m.carbs_g || 0;
            bucket.total_fats_g += m.fats_g || 0;
        }

        const { meals: _omit, ...planHeader } = plan;
        return { plan: planHeader, days };
    });

    // ─── GET /ai/meal-plans/me/history ──────────────────────────
    fastify.get('/ai/meal-plans/me/history', guard, async (req) => {
        const userId = req.user.sub || req.user.id;
        const plans = await prisma.mealPlan.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
            take: 50,
            select: {
                id: true,
                name: true,
                goal: true,
                calories_target: true,
                protein_g: true,
                carbs_g: true,
                fats_g: true,
                restrictions: true,
                source: true,
                is_active: true,
                started_at: true,
                ended_at: true,
                created_at: true,
            },
        });
        return { plans };
    });

    // ─── GET /ai/meal-plans/:id/shopping-list ───────────────────
    fastify.get('/ai/meal-plans/:id/shopping-list', guard, async (req) => {
        const userId = req.user.sub || req.user.id;
        const isStaff = ['ADMIN', 'SUPERADMIN'].includes(req.user.role);

        const plan = await prisma.mealPlan.findUnique({
            where: { id: req.params.id },
            include: {
                meals: { select: { ingredients: true } },
            },
        });
        if (!plan) throw err('MEAL_PLAN_NOT_FOUND', 'Plan no encontrado', 404);
        if (plan.user_id !== userId && !isStaff) {
            throw err('FORBIDDEN', 'Este plan no te pertenece', 403);
        }

        const items = aggregateShoppingList(plan.meals);
        return { plan_id: plan.id, items };
    });
}
