// ─────────────────────────────────────────────────────────────────
// Integration test for FASE 2 — IA Controlada.
//
// Ejercita el helper coach-templates-prompt con respuestas IA
// SIMULADAS (buenas y malas) sin llamar a OpenAI. Verifica:
//
//   1. Builders de prompt no crashan y producen system+user+schema.
//   2. Schemas zod aceptan respuestas válidas y rechazan inválidas.
//   3. Slot validators detectan TODAS las violaciones esperadas:
//        · IA agrega un día           → flag
//        · IA agrega un ejercicio     → flag
//        · IA renombra exercise_name  → flag
//        · IA cambia sets/reps        → flag
//        · meals: IA quita una comida → flag
//        · meals: IA cambia meal_type → flag
//        · meals: IA mete alergeno    → flag
//        · meals: IA fuera de ±15% kcal → flag
//   4. Deterministic fallback produce shape válido.
//
// Run:  node src/coach-templates/integration-test.js
// ─────────────────────────────────────────────────────────────────

import {
    load_all_routine_templates,
    load_all_meal_templates,
} from './loader.js';
import {
    buildRoutinePromptFromTemplate,
    validateRoutineAgainstTemplate,
    deterministicRoutineFromTemplate,
    routineAiResponseSchema,
    buildMealPromptFromTemplate,
    validateMealAgainstTemplate,
    deterministicMealsFromTemplate,
    mealAiResponseSchema,
    isCoachTemplatesV1Enabled,
    repsEquivalent,
} from '../lib/coach-templates-prompt.js';
import {
    validate_routine_response,
    validate_meal_response,
    buildRetryUserPrompt,
} from '../lib/template-validator.js';

let pass = 0;
let fail = 0;
const failures = [];
function check(label, cond, info) {
    if (cond) { pass++; console.log(`  ✓ ${label}`); }
    else { fail++; failures.push({ label, info });
        console.log(`  ✗ ${label}${info ? '  → ' + JSON.stringify(info) : ''}`); }
}

console.log('\n── 0. Feature flag helper ────────────────────────────');
delete process.env.COACH_TEMPLATES_V1;
check('flag default OFF', isCoachTemplatesV1Enabled() === false);
process.env.COACH_TEMPLATES_V1 = 'true';
check('flag ON con "true"', isCoachTemplatesV1Enabled() === true);
process.env.COACH_TEMPLATES_V1 = 'TRUE';
check('flag ON con "TRUE"', isCoachTemplatesV1Enabled() === true);
process.env.COACH_TEMPLATES_V1 = '1';
check('flag OFF con "1" (sólo "true" cuenta)', isCoachTemplatesV1Enabled() === false);
delete process.env.COACH_TEMPLATES_V1;

console.log('\n── 1. Routine prompt builder ─────────────────────────');
const routines = load_all_routine_templates();
const tplRoutine = routines.find((r) => r.id === 'rt-hombre-real-5d-musclegain');
check('template hombre real cargado', !!tplRoutine);

const routineProfile = { firstName: 'Carlos', level: 'INTERMEDIATE', injuries: [] };
const routineP = buildRoutinePromptFromTemplate(tplRoutine, routineProfile);
check('builder retorna { system, user, schema }',
    !!routineP.system && !!routineP.user && !!routineP.schema);
check('user prompt incluye firstName',
    routineP.user.includes('Carlos'));
check('user prompt incluye exercise_name del template (verbatim de slots)',
    routineP.user.includes('Press de banco'));
check('system prompt prohibe agregar/quitar',
    /NO agregues ni quites/.test(routineP.system));

console.log('\n── 2. Routine schema (zod) ───────────────────────────');
// Build a "good" AI response: deterministic fallback es por definición válido.
const goodRoutineAI = deterministicRoutineFromTemplate(tplRoutine, { firstName: 'Carlos' });
const r1 = routineAiResponseSchema.safeParse(goodRoutineAI);
check('schema acepta respuesta válida (deterministic)', r1.success,
    r1.success ? null : r1.error.issues.slice(0, 2));

// Bad: missing field
const badNoGoal = JSON.parse(JSON.stringify(goodRoutineAI));
delete badNoGoal.routine.goal;
const r2 = routineAiResponseSchema.safeParse(badNoGoal);
check('schema rechaza routine.goal faltante', !r2.success);

console.log('\n── 3. Routine slot validator ─────────────────────────');
// 3a. Verbatim fallback debe pasar
{
    const v = validateRoutineAgainstTemplate(goodRoutineAI, tplRoutine);
    check('verbatim deterministic pasa validación', v.ok, v.errors.slice(0, 2));
}
// 3b. AI agrega un día extra
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.days.push({ ...ai.days[0], day_of_week: 5 });
    ai.routine.days_per_week = ai.days.length;
    const v = validateRoutineAgainstTemplate(ai, tplRoutine);
    check('detecta día extra', !v.ok, v.errors.slice(0, 2));
}
// 3c. AI agrega un ejercicio
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.days[0].exercises.push({
        exercise_name: 'Inventado', sets: 3, reps: '12', rest_sec: 60, notes: '',
    });
    const v = validateRoutineAgainstTemplate(ai, tplRoutine);
    check('detecta ejercicio extra', !v.ok, v.errors.slice(0, 2));
}
// 3d. AI renombra exercise_name
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.days[0].exercises[1].exercise_name = 'Cambiado por la IA';
    const v = validateRoutineAgainstTemplate(ai, tplRoutine);
    check('detecta exercise_name cambiado', !v.ok, v.errors.slice(0, 2));
}
// 3e. AI cambia sets
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.days[0].exercises[1].sets = 99;
    const v = validateRoutineAgainstTemplate(ai, tplRoutine);
    check('detecta sets fuera de slot', !v.ok, v.errors.slice(0, 2));
}
// 3f. AI cambia reps
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.days[0].exercises[1].reps = 'AMRAP';
    const v = validateRoutineAgainstTemplate(ai, tplRoutine);
    check('detecta reps cambiados', !v.ok, v.errors.slice(0, 2));
}
// 3g. rest_sec dentro de ±15s pasa, fuera no
{
    const aiOk = JSON.parse(JSON.stringify(goodRoutineAI));
    const original = aiOk.days[0].exercises[1].rest_sec;
    aiOk.days[0].exercises[1].rest_sec = original + 15;
    const vOk = validateRoutineAgainstTemplate(aiOk, tplRoutine);
    check('rest_sec +15s permitido', vOk.ok, vOk.errors.slice(0, 2));

    const aiBad = JSON.parse(JSON.stringify(goodRoutineAI));
    aiBad.days[0].exercises[1].rest_sec = original + 60;
    const vBad = validateRoutineAgainstTemplate(aiBad, tplRoutine);
    check('rest_sec +60s rechazado', !vBad.ok, vBad.errors.slice(0, 2));
}
// 3h. AI sólo personaliza name + notes (válido)
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.routine.name = 'Plan personalizado de Carlos — hipertrofia 5 días';
    ai.days[0].notes = 'Carlos, calienta bien antes de pisar el peso.';
    ai.days[0].exercises[0].notes = 'sube lento y controla la bajada';
    const v = validateRoutineAgainstTemplate(ai, tplRoutine);
    check('personalización legítima de name/notes pasa', v.ok, v.errors.slice(0, 2));
}

console.log('\n── 4. Meal prompt builder ────────────────────────────');
const meals = load_all_meal_templates();
const tplMeal = meals.find((m) => m.id === 'mp-cs-diet-base-unisex');
check('template CS-DIET-BASE-UNISEX cargado', !!tplMeal);

const mealProfile = {
    firstName: 'Ana', country: 'MX',
    restrictions: [],
    allergies: ['cacahuate'],
    disliked_foods: ['hígado'],
};
const mealP = buildMealPromptFromTemplate(tplMeal, mealProfile);
check('builder retorna { system, user, schema }',
    !!mealP.system && !!mealP.user && !!mealP.schema);
check('user prompt incluye firstName',
    mealP.user.includes('Ana'));
check('user prompt menciona alergia',
    mealP.user.toLowerCase().includes('cacahuate'));
check('system prompt prohibe agregar/quitar comidas',
    /NO agregues ni quites/.test(mealP.system));

console.log('\n── 5. Meal schema (zod) ──────────────────────────────');
const goodMealAI = deterministicMealsFromTemplate(tplMeal, { firstName: 'Ana', restrictions: [] });
const m1 = mealAiResponseSchema.safeParse(goodMealAI);
check('schema acepta respuesta válida (deterministic)', m1.success,
    m1.success ? null : m1.error.issues.slice(0, 2));

// Bad: meal_type inválido
const mBad = JSON.parse(JSON.stringify(goodMealAI));
mBad.meals[0].meal_type = 'BRUNCH';
const m2 = mealAiResponseSchema.safeParse(mBad);
check('schema rechaza meal_type inválido', !m2.success);

console.log('\n── 6. Meal slot validator ────────────────────────────');
// 6a. A/B/C variant fallback pasa (días 0/3/6 = A; 1/4 = B; 2/5 = C)
{
    const v = validateMealAgainstTemplate(goodMealAI, tplMeal, mealProfile);
    check('deterministic A/B/C pasa el validador de slots', v.ok, v.errors.slice(0, 2));
}
// 6b. IA quita una comida del día 3
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    ai.meals = ai.meals.filter((m) => !(m.day_of_week === 3 && m.order_index === 2));
    const v = validateMealAgainstTemplate(ai, tplMeal, mealProfile);
    check('detecta comida faltante en día 3', !v.ok, v.errors.slice(0, 2));
}
// 6c. IA cambia meal_type @ slot 1 día 4
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    const target = ai.meals.find((m) => m.day_of_week === 4 && m.order_index === 1);
    target.meal_type = 'SNACK_AM';
    const v = validateMealAgainstTemplate(ai, tplMeal, mealProfile);
    check('detecta meal_type cambiado', !v.ok, v.errors.slice(0, 2));
}
// 6d. IA mete cacahuate (alergia) en day 2 BREAKFAST
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    const target = ai.meals.find((m) => m.day_of_week === 2 && m.meal_type === 'BREAKFAST');
    target.ingredients.push('20g cacahuate tostado');
    const v = validateMealAgainstTemplate(ai, tplMeal, mealProfile);
    check('detecta ingrediente con alergeno (cacahuate)', !v.ok,
        v.errors.find((e) => e.includes('cacahuate')) || v.errors.slice(0, 2));
}
// 6e. IA mete hígado (dislike)
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    ai.meals[10].ingredients.push('hígado encebollado 80g');
    const v = validateMealAgainstTemplate(ai, tplMeal, mealProfile);
    check('detecta ingrediente disliked (hígado)', !v.ok,
        v.errors.find((e) => e.includes('hígado')) || v.errors.slice(0, 2));
}
// 6f. IA fuera del rango ±15% kcal
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    const target = ai.meals.find((m) => m.day_of_week === 5 && m.meal_type === 'LUNCH');
    target.calories = 9999;
    const v = validateMealAgainstTemplate(ai, tplMeal, mealProfile);
    check('detecta calorías fuera de ±15%', !v.ok,
        v.errors.find((e) => e.includes('calories')) || v.errors.slice(0, 2));
}
// 6g. IA agrega comida extra (8 en día 0)
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    const sample = ai.meals.find((m) => m.day_of_week === 0);
    ai.meals.push({ ...sample, order_index: 4, meal_type: 'DINNER' });
    const v = validateMealAgainstTemplate(ai, tplMeal, mealProfile);
    check('detecta comida extra en un día', !v.ok, v.errors.slice(0, 2));
}
// 6h. IA respeta todo (variación de days 1-6 dentro de ±15% y meal_type fijo) → válido
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    // Vary names/descriptions in days 1-6 — keep slots intact
    for (const m of ai.meals) {
        if (m.day_of_week === 0) continue;
        m.name = `${m.name} (variación día ${m.day_of_week})`;
        m.description = `1. Receta variada para día ${m.day_of_week}.\n2. Sazona y cocina.\n3. Sirve.`;
        // small jitter ±10% kcal
        m.calories = Math.round(m.calories * (1 + (m.day_of_week % 2 === 0 ? 0.05 : -0.05)));
    }
    const v = validateMealAgainstTemplate(ai, tplMeal, mealProfile);
    check('variaciones legítimas día 1-6 (mismo slot, ±10% kcal) pasan', v.ok,
        v.errors.slice(0, 2));
}

console.log('\n── 6.bis Variant rotation (A/B/C) ────────────────────');
{
    // Use the WL template (4 meals, has "Pechuga a la plancha" → swappable)
    const tplWL = meals.find((m) => m.id === 'mp-weightloss-4m-mx');
    const det = deterministicMealsFromTemplate(tplWL, { firstName: 'Luis' });

    const day0Meal = det.meals.find((m) => m.day_of_week === 0 && m.meal_type === 'LUNCH');
    const day1Meal = det.meals.find((m) => m.day_of_week === 1 && m.meal_type === 'LUNCH');
    const day2Meal = det.meals.find((m) => m.day_of_week === 2 && m.meal_type === 'LUNCH');

    check('variant A (día 0) — verbatim del template (Pechuga a la plancha)',
        day0Meal?.name?.includes('Pechuga'), { day0Name: day0Meal?.name });

    check('variant B (día 1) — proteína cambió a pescado',
        day1Meal?.name?.toLowerCase().includes('pescado'),
        { day1Name: day1Meal?.name });

    check('variant C (día 2) — proteína cambió a res',
        day2Meal?.name?.toLowerCase().includes('res') || day2Meal?.name?.toLowerCase().includes('bistec'),
        { day2Name: day2Meal?.name });

    check('variant rotation produce ≥3 meal names distintos en LUNCH',
        new Set(det.meals.filter((m) => m.meal_type === 'LUNCH').map((m) => m.name)).size >= 3);

    // Alergeno a "pescado" debe forzar variant A en días B
    const detWithAllergy = deterministicMealsFromTemplate(tplWL, {
        firstName: 'Luis', allergies: ['pescado'],
    });
    const day1Allergy = detWithAllergy.meals.find((m) => m.day_of_week === 1 && m.meal_type === 'LUNCH');
    check('alergia a pescado fuerza variante A (no introduce pescado en día 1)',
        !day1Allergy?.name?.toLowerCase().includes('pescado') &&
        !day1Allergy?.ingredients?.some((i) => i.toLowerCase().includes('pescado')),
        { day1Name: day1Allergy?.name });

    // El plan completo con alergia a pescado debe pasar el validador
    const vAllergy = validateMealAgainstTemplate(detWithAllergy, tplWL,
        { allergies: ['pescado'], disliked_foods: [] });
    check('plan con alergia activa pasa validador (sin pescado)', vAllergy.ok,
        vAllergy.errors.slice(0, 3));
}

console.log('\n── 6.ter reps equivalence (loose validator) ─────────');
// Build a routine AI response that is verbatim except for `reps` formatting
{
    const aiLoose = JSON.parse(JSON.stringify(goodRoutineAI));
    // Cambia formato sin cambiar estructura
    for (const d of aiLoose.days) {
        for (const ex of d.exercises) {
            if (ex.reps === '15,12,10,8') ex.reps = '15-12-10-8';
            else if (ex.reps === '20 min') ex.reps = '20min';
            else if (ex.reps === '10 min') ex.reps = '10 minutos';
            else if (ex.reps === '1 min') ex.reps = '1min';
            else if (ex.reps === '1:30 min') ex.reps = '1:30min';
        }
    }
    const v = validateRoutineAgainstTemplate(aiLoose, tplRoutine);
    check('reps con separadores y unidades equivalentes pasan', v.ok, v.errors.slice(0, 3));
}

// Direct repsEquivalent unit checks
check('repsEquivalent: "15,12,10,8" ≡ "15-12-10-8"',
    repsEquivalent('15,12,10,8', '15-12-10-8'));
check('repsEquivalent: "15,12,10,8" ≡ "15 / 12 / 10 / 8"',
    repsEquivalent('15,12,10,8', '15 / 12 / 10 / 8'));
check('repsEquivalent: "1 min" ≡ "1min" ≡ "1 minuto"',
    repsEquivalent('1 min', '1min') && repsEquivalent('1 min', '1 minuto'));
check('repsEquivalent: "60s" ≡ "60 segundos"',
    repsEquivalent('60s', '60 segundos'));
check('repsEquivalent: "10 pesadas / 10 livianas" ≡ "10 pesadas/10 livianas"',
    repsEquivalent('10 pesadas / 10 livianas', '10 pesadas/10 livianas'));
check('repsEquivalent rechaza estructura distinta: "15,12,10,8" ≠ "5,5,5,5"',
    !repsEquivalent('15,12,10,8', '5,5,5,5'));
check('repsEquivalent rechaza diferente número de bloques: "15,12,10,8" ≠ "15,12,10"',
    !repsEquivalent('15,12,10,8', '15,12,10'));

console.log('\n── 7. Deterministic fallback shape ──────────────────');
const detR = deterministicRoutineFromTemplate(tplRoutine, { firstName: 'Carlos' });
check('detRoutine pasa schema zod',
    routineAiResponseSchema.safeParse(detR).success);
check('detRoutine pasa slot validator',
    validateRoutineAgainstTemplate(detR, tplRoutine).ok);
check('detRoutine.name incluye firstName',
    detR.routine.name.includes('Carlos'));

const detM = deterministicMealsFromTemplate(tplMeal, { firstName: 'Ana', restrictions: [] });
check('detMeal pasa schema zod',
    mealAiResponseSchema.safeParse(detM).success);
check('detMeal pasa slot validator',
    validateMealAgainstTemplate(detM, tplMeal, mealProfile).ok);
check('detMeal tiene 7 días × N comidas',
    detM.meals.length === 7 * tplMeal.meals.filter((m) => m.day_of_week === 0).length);

// Sanity: kcal target del plan se preserva al sumar día 0
{
    const kcalDay0 = detM.meals
        .filter((m) => m.day_of_week === 0)
        .reduce((s, m) => s + m.calories, 0);
    const target = detM.plan.calories_target;
    check(`detMeal day 0 kcal (${kcalDay0}) dentro de ±10% del target (${target})`,
        Math.abs(kcalDay0 - target) <= target * 0.10);
}

console.log('\n── 8. FASE 3 strict validator — routines ─────────────');

// 8a. Verbatim deterministic passes
{
    const v = validate_routine_response(goodRoutineAI, tplRoutine);
    check('FASE 3: deterministic verbatim pasa strict', v.ok, v.errors.slice(0, 3));
}
// 8b. routine.goal divergente → falla
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.routine.goal = 'WEIGHT_LOSS';
    const v = validate_routine_response(ai, tplRoutine);
    check('FASE 3: detecta routine.goal cambiado', !v.ok,
        v.errors.find((e) => e.includes('goal')) || v.errors.slice(0, 2));
}
// 8c. AI quita ejercicios y deja un día con < 4 → falla MIN_EXERCISES + estructura
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.days[0].exercises = ai.days[0].exercises.slice(0, 3);
    const v = validate_routine_response(ai, tplRoutine);
    check('FASE 3: detecta día con < 4 ejercicios', !v.ok, v.errors.slice(0, 2));
}
// 8d. AI cambia exercise_name → falla
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    ai.days[1].exercises[2].exercise_name = 'Sentadilla inventada';
    const v = validate_routine_response(ai, tplRoutine);
    check('FASE 3: detecta exercise_name renombrado', !v.ok, v.errors.slice(0, 2));
}
// 8e. AI con reps "15-12-10-8" en vez de "15,12,10,8" → debe pasar (equivalencia estructural)
{
    const ai = JSON.parse(JSON.stringify(goodRoutineAI));
    for (const d of ai.days) for (const ex of d.exercises) {
        if (ex.reps === '15,12,10,8') ex.reps = '15-12-10-8';
    }
    const v = validate_routine_response(ai, tplRoutine);
    check('FASE 3: tolera reps separadores equivalentes', v.ok, v.errors.slice(0, 2));
}

console.log('\n── 9. FASE 3 strict validator — meals ───────────────');

// 9a. CS-DIET-BASE-UNISEX deterministic A/B/C deberá pasar
{
    const v = validate_meal_response(goodMealAI, tplMeal, mealProfile);
    check('FASE 3: deterministic A/B/C de CS pasa strict',
        v.ok, v.errors.slice(0, 3));
}
// 9b. AI mete una comida con kcal +20% (fuera de ±8%) → falla
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    const target = ai.meals.find((m) => m.day_of_week === 4 && m.meal_type === 'LUNCH');
    target.calories = Math.round(target.calories * 1.20);
    const v = validate_meal_response(ai, tplMeal, mealProfile);
    check('FASE 3: detecta kcal slot fuera de ±8%', !v.ok,
        v.errors.find((e) => e.includes('±8%')) || v.errors.slice(0, 2));
}
// 9c. AI con LUNCH proteína = 8g (< 20g) → falla protein floor
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    const target = ai.meals.find((m) => m.day_of_week === 5 && m.meal_type === 'LUNCH');
    target.protein_g = 8;
    const v = validate_meal_response(ai, tplMeal, mealProfile);
    check('FASE 3: detecta LUNCH con proteína < 20g', !v.ok,
        v.errors.find((e) => e.includes('proteína') && e.includes('LUNCH')) || v.errors.slice(0, 2));
}
// 9d. AI con todas las comidas del día con proteína = 5g → falla day-protein floor
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    for (const m of ai.meals) {
        if (m.day_of_week === 6) m.protein_g = 5;
    }
    const v = validate_meal_response(ai, tplMeal, mealProfile);
    check('FASE 3: detecta proteína día total < 90% target', !v.ok,
        v.errors.find((e) => e.includes('proteína total')) || v.errors.slice(0, 2));
}
// 9e. AI mete cacahuate (alergia) en el campo NAME (no sólo ingredients) → debe detectarlo
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    const target = ai.meals.find((m) => m.day_of_week === 2 && m.meal_type === 'BREAKFAST');
    target.name = 'Avena con CACAHUATE tostado';
    const v = validate_meal_response(ai, tplMeal, mealProfile);
    check('FASE 3: detecta alergeno en meal.name (no sólo ingredients)', !v.ok,
        v.errors.find((e) => e.includes('cacahuate')) || v.errors.slice(0, 2));
}
// 9f. AI mete hígado en description (no en name ni ingredients)
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    const target = ai.meals.find((m) => m.day_of_week === 3 && m.meal_type === 'DINNER');
    target.description = '1. Saltea 100g de hígado de res en sartén.\n2. Sirve con verduras.';
    const v = validate_meal_response(ai, tplMeal, mealProfile);
    check('FASE 3: detecta dislike en meal.description', !v.ok,
        v.errors.find((e) => e.includes('hígado')) || v.errors.slice(0, 2));
}
// 9g. AI con 6 días en vez de 7 → falla
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    ai.meals = ai.meals.filter((m) => m.day_of_week !== 5);
    const v = validate_meal_response(ai, tplMeal, mealProfile);
    check('FASE 3: detecta < 7 días', !v.ok,
        v.errors.find((e) => e.includes('7 días')) || v.errors.slice(0, 2));
}
// 9h. Day total kcal +20% → falla day kcal ±8%
{
    const ai = JSON.parse(JSON.stringify(goodMealAI));
    for (const m of ai.meals) {
        if (m.day_of_week === 1) m.calories = Math.round(m.calories * 1.20);
    }
    const v = validate_meal_response(ai, tplMeal, mealProfile);
    check('FASE 3: detecta day total kcal fuera ±8%', !v.ok,
        v.errors.find((e) => e.includes('total') && e.includes('kcal')) || v.errors.slice(0, 2));
}

console.log('\n── 10. Retry feedback prompt builder ────────────────');
{
    const errors = [
        'day 3 LUNCH: calorías 800 fuera de [478, 562] (template 520, ±8%)',
        'day 5 BREAKFAST: proteína 8g < 20g mínimo',
        'day 2 BREAKFAST: contiene "cacahuate" (alergia o dislike del socio)',
    ];
    const retry = buildRetryUserPrompt('PROMPT ORIGINAL del primer intento', errors, 'meal');
    check('retry prompt incluye original',
        retry.includes('PROMPT ORIGINAL del primer intento'));
    check('retry prompt anuncia falla',
        /INTENTO ANTERIOR FALL/i.test(retry));
    check('retry prompt enumera los 3 errores',
        errors.every((e) => retry.includes(e.slice(0, 40))));
    check('retry prompt incluye reglas (kind=meal): ±8% kcal, 20g proteína',
        /±8%/.test(retry) && /20g/.test(retry));

    const retryR = buildRetryUserPrompt('ROUTINE PROMPT ORIG', ['day[0].exercises: faltan 2'], 'routine');
    check('retry prompt routine incluye reglas distintas (sin ±8% kcal)',
        !/±8%/.test(retryR) && /verbatim/i.test(retryR));

    // Trunca si hay > 8 errores
    const many = Array.from({ length: 12 }, (_, i) => `error ${i + 1}: dummy`);
    const retryMany = buildRetryUserPrompt('orig', many, 'meal');
    check('retry prompt trunca a 8 errores y anuncia el resto',
        /4 error\(es\) m[aá]s/.test(retryMany));
}

console.log('\n── Summary ──────────────────────────────────────────');
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  -', f.label, f.info ?? '');
    process.exit(1);
}
process.exit(0);
