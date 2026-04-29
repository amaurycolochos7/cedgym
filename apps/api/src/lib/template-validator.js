// ─────────────────────────────────────────────────────────────────
// FASE 3 — Strict post-IA validation gate.
//
// Runs AFTER `generateJSON()` and BEFORE the DB write. If it fails
// the route retries the IA call ONCE with the validation errors
// piped back as feedback; if the second attempt also fails the route
// throws 422 instead of silently degrading.
//
// ── Reglas (más estricto que la versión "slot-only" de FASE 2): ──
//
//   ROUTINES
//     · Estructura idéntica al template (mismos days, mismos
//       exercise_name/sets, reps estructuralmente equivalente,
//       rest_sec ±15s, day_of_week sin movimiento).
//     · Cada día con ≥ 4 ejercicios (anti-template-pobre).
//     · routine.goal y routine.location coinciden con el template.
//
//   MEALS
//     · Estructura idéntica: 7 días distintos × N comidas, con
//       meal_type @ order_index igual al day-0 del template.
//     · CALORIES per-slot dentro de ±8% del template (vs ±15% en FASE 2).
//     · CALORIES per-day total dentro de ±8% de
//       template.calories_target_kcal.
//     · PROTEINA mínima por meal_type:
//         BREAKFAST/LUNCH/DINNER ≥ 20g
//         SNACK_AM/SNACK_PM      ≥ 5g
//     · PROTEINA día total ≥ 90% de template.macros.protein_g.
//     · Allergies / disliked_foods AUSENTES de:
//         meal.name, meal.description, ingredients[]
//       (substring case-insensitive sobre los 3 campos).
//
// El validador devuelve `{ ok, errors[] }`. Cada error es un string
// pensado para ser leído por la IA en el retry (corto, accionable).
// ─────────────────────────────────────────────────────────────────

import { repsEquivalent } from './coach-templates-prompt.js';

// ── Tunables ─────────────────────────────────────────────────────
const KCAL_SLOT_TOLERANCE_PCT  = 0.08;  // ±8%
const KCAL_DAY_TOLERANCE_PCT   = 0.08;  // ±8%
const PROTEIN_DAY_FLOOR_PCT    = 0.90;  // ≥90% del target

const PROTEIN_FLOOR_BY_MEAL = {
    BREAKFAST: 20,
    LUNCH:     20,
    DINNER:    20,
    SNACK_AM:   5,
    SNACK_PM:   5,
};

const MIN_EXERCISES_PER_DAY = 4;
const REST_SEC_TOLERANCE   = 15;

// ═════════════════════════════════════════════════════════════════
// ROUTINES
// ═════════════════════════════════════════════════════════════════

/**
 * @param {object} ai       The parsed IA response (`{ routine, days }`)
 * @param {object} template The selected coach-template
 * @param {object} profile  Optional, reserved for future use
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validate_routine_response(ai, template, _profile = {}) {
    const errors = [];

    if (!ai || typeof ai !== 'object') {
        return { ok: false, errors: ['routine: respuesta IA vacía o no objeto'] };
    }
    if (!ai.routine || !Array.isArray(ai.days)) {
        return { ok: false, errors: ['routine: faltan campos top-level "routine" o "days"'] };
    }

    // ── Top-level shape ──────────────────────────────────────
    if (ai.routine.goal !== template.objective) {
        errors.push(`routine.goal: esperaba "${template.objective}", recibí "${ai.routine.goal}"`);
    }
    if (ai.routine.location !== template.location) {
        errors.push(`routine.location: esperaba "${template.location}", recibí "${ai.routine.location}"`);
    }
    if (ai.routine.days_per_week !== template.days_per_week) {
        errors.push(`routine.days_per_week: esperaba ${template.days_per_week}, recibí ${ai.routine.days_per_week}`);
    }
    if (typeof ai.routine.name !== 'string' || ai.routine.name.trim().length < 4) {
        errors.push('routine.name: vacío o muy corto');
    }

    // ── Days length ──────────────────────────────────────────
    if (ai.days.length !== template.days.length) {
        errors.push(`days: esperaba ${template.days.length} días, recibí ${ai.days.length}`);
    }

    const n = Math.min(ai.days.length, template.days.length);
    for (let i = 0; i < n; i++) {
        const aiDay = ai.days[i];
        const tplDay = template.days[i];

        if (aiDay.day_of_week !== tplDay.day_of_week) {
            errors.push(`day[${i}].day_of_week: esperaba ${tplDay.day_of_week}, recibí ${aiDay.day_of_week}`);
        }

        const aiExercises = Array.isArray(aiDay.exercises) ? aiDay.exercises : [];
        if (aiExercises.length !== tplDay.exercises.length) {
            errors.push(`day[${i}].exercises: esperaba ${tplDay.exercises.length}, recibí ${aiExercises.length}`);
            continue; // sin alineación 1:1 no podemos comparar slot-a-slot
        }
        if (aiExercises.length < MIN_EXERCISES_PER_DAY) {
            errors.push(`day[${i}]: muy pocos ejercicios (${aiExercises.length}, mínimo ${MIN_EXERCISES_PER_DAY})`);
        }

        for (let j = 0; j < tplDay.exercises.length; j++) {
            const aiEx = aiExercises[j];
            const tplEx = tplDay.exercises[j];
            if (aiEx.exercise_name !== tplEx.exercise_name) {
                errors.push(`day[${i}].exercise[${j}].name: esperaba "${tplEx.exercise_name}", recibí "${aiEx.exercise_name}"`);
            }
            if (aiEx.sets !== tplEx.sets) {
                errors.push(`day[${i}].exercise[${j}].sets: esperaba ${tplEx.sets}, recibí ${aiEx.sets}`);
            }
            if (!repsEquivalent(aiEx.reps, tplEx.reps)) {
                errors.push(`day[${i}].exercise[${j}].reps: esperaba ~"${tplEx.reps}", recibí "${aiEx.reps}"`);
            }
            if (Math.abs((aiEx.rest_sec ?? -1) - tplEx.rest_sec) > REST_SEC_TOLERANCE) {
                errors.push(`day[${i}].exercise[${j}].rest_sec: fuera de ±${REST_SEC_TOLERANCE}s del template (${tplEx.rest_sec})`);
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

// ═════════════════════════════════════════════════════════════════
// MEALS
// ═════════════════════════════════════════════════════════════════

function _normalize(s) {
    return String(s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/**
 * @param {object} ai       The parsed IA response (`{ plan, meals }`)
 * @param {object} template The selected coach-template
 * @param {object} profile  Lleva `allergies` y `disliked_foods` (arrays de strings)
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validate_meal_response(ai, template, profile = {}) {
    const errors = [];

    if (!ai || typeof ai !== 'object') {
        return { ok: false, errors: ['meal: respuesta IA vacía o no objeto'] };
    }
    if (!ai.plan || !Array.isArray(ai.meals)) {
        return { ok: false, errors: ['meal: faltan campos top-level "plan" o "meals"'] };
    }

    // ── Top-level plan ───────────────────────────────────────
    if (ai.plan.goal !== template.objective) {
        errors.push(`plan.goal: esperaba "${template.objective}", recibí "${ai.plan.goal}"`);
    }
    if (typeof ai.plan.name !== 'string' || ai.plan.name.trim().length < 4) {
        errors.push('plan.name: vacío o muy corto');
    }

    // ── Slots derivados del day-0 del template ───────────────
    const day0 = template.meals
        .filter((m) => m.day_of_week === 0)
        .sort((a, b) => a.order_index - b.order_index);
    if (day0.length === 0) {
        return { ok: false, errors: ['template: day-0 vacío (template inválido)'] };
    }
    const expectedSlots = day0.length;
    const slotKcalByOrder = new Map(day0.map((m) => [m.order_index, m.calories]));
    const slotMealTypeByOrder = new Map(day0.map((m) => [m.order_index, m.meal_type]));

    // ── Group meals by day ───────────────────────────────────
    const byDay = new Map();
    for (const m of ai.meals) {
        if (!byDay.has(m.day_of_week)) byDay.set(m.day_of_week, []);
        byDay.get(m.day_of_week).push(m);
    }
    if (byDay.size !== 7) {
        errors.push(`meals: esperaba 7 días distintos, recibí ${byDay.size}`);
    }

    const dayKcalTarget = template.calories_target_kcal;
    const dayKcalLo = Math.floor(dayKcalTarget * (1 - KCAL_DAY_TOLERANCE_PCT));
    const dayKcalHi = Math.ceil(dayKcalTarget * (1 + KCAL_DAY_TOLERANCE_PCT));

    const dayProteinTarget = template.macros.protein_g;
    const dayProteinFloor = Math.floor(dayProteinTarget * PROTEIN_DAY_FLOOR_PCT);

    // ── Per-day validation ───────────────────────────────────
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
        const dayMeals = byDay.get(day) || [];
        if (dayMeals.length !== expectedSlots) {
            errors.push(`day ${day}: esperaba ${expectedSlots} comidas, recibí ${dayMeals.length}`);
            continue;
        }
        dayMeals.sort((a, b) => a.order_index - b.order_index);

        // (a) slot shape: meal_type @ order_index
        for (let i = 0; i < expectedSlots; i++) {
            const m = dayMeals[i];
            const expectedOrder = day0[i].order_index;
            const expectedType = day0[i].meal_type;
            if (m.order_index !== expectedOrder) {
                errors.push(`day ${day} slot ${i}: order_index esperaba ${expectedOrder}, recibí ${m.order_index}`);
            }
            if (m.meal_type !== expectedType) {
                errors.push(`day ${day} slot ${i}: meal_type esperaba ${expectedType}, recibí ${m.meal_type}`);
            }

            // (b) per-slot kcal ±8%
            const slotTarget = slotKcalByOrder.get(m.order_index) ?? slotKcalByOrder.get(expectedOrder) ?? 0;
            const slotLo = Math.floor(slotTarget * (1 - KCAL_SLOT_TOLERANCE_PCT));
            const slotHi = Math.ceil(slotTarget * (1 + KCAL_SLOT_TOLERANCE_PCT));
            if (m.calories < slotLo || m.calories > slotHi) {
                errors.push(`day ${day} ${m.meal_type}: calorías ${m.calories} fuera de [${slotLo}, ${slotHi}] (template ${slotTarget}, ±8%)`);
            }

            // (c) per-meal protein floor by meal_type
            const proteinFloor = PROTEIN_FLOOR_BY_MEAL[m.meal_type] ?? 0;
            if ((m.protein_g ?? 0) < proteinFloor) {
                errors.push(`day ${day} ${m.meal_type}: proteína ${m.protein_g}g < ${proteinFloor}g mínimo`);
            }
        }

        // (d) per-day kcal total ±8%
        const dayKcal = dayMeals.reduce((s, m) => s + (m.calories || 0), 0);
        if (dayKcal < dayKcalLo || dayKcal > dayKcalHi) {
            errors.push(`day ${day}: total ${dayKcal} kcal fuera de [${dayKcalLo}, ${dayKcalHi}] (target ${dayKcalTarget}, ±8%)`);
        }

        // (e) per-day protein total ≥ 90% target
        const dayProtein = dayMeals.reduce((s, m) => s + (m.protein_g || 0), 0);
        if (dayProtein < dayProteinFloor) {
            errors.push(`day ${day}: proteína total ${dayProtein}g < piso ${dayProteinFloor}g (90% del target ${dayProteinTarget}g)`);
        }
    }

    // ── Allergy / dislike crosscheck (name + description + ingredients) ──
    const banned = [
        ...(profile.allergies || []),
        ...(profile.disliked_foods || []),
    ]
        .map((s) => _normalize(s).trim())
        .filter(Boolean);

    if (banned.length) {
        for (const m of ai.meals) {
            const haystack = [
                m.name,
                m.description,
                ...(Array.isArray(m.ingredients) ? m.ingredients : []),
            ]
                .map(_normalize)
                .join(' | ');

            for (const word of banned) {
                if (haystack.includes(word)) {
                    errors.push(`day ${m.day_of_week} ${m.meal_type}: contiene "${word}" (alergia o dislike del socio)`);
                    break; // un hit por meal es suficiente
                }
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

// ═════════════════════════════════════════════════════════════════
// Retry feedback prompt
// ═════════════════════════════════════════════════════════════════

/**
 * Construye el user-prompt del segundo intento. Mantiene el original
 * (para que la IA tenga el contexto del template + perfil) y lo
 * apila con un bloque de errores en español, accionable y corto.
 *
 * @param {string}   originalUserPrompt  El prompt usado en attempt 1
 * @param {string[]} errors              Errores devueltos por el validador
 * @param {'routine'|'meal'} kind        Determina las "reglas" recordadas
 */
export function buildRetryUserPrompt(originalUserPrompt, errors, kind) {
    // Limita a los primeros 8 errores — más allá de eso satura el prompt
    // y el modelo se confunde. Si hay más, anuncia el truncamiento.
    const head = errors.slice(0, 8);
    const truncatedNote = errors.length > head.length
        ? `\n... y ${errors.length - head.length} error(es) más en la misma línea.`
        : '';

    const rules = kind === 'meal'
        ? [
            'Mantén el shape exacto: 7 días × N comidas, mismas meal_types en los mismos order_index que el template.',
            'Calorías por comida dentro de ±8% del slot del template.',
            'Calorías totales por día dentro de ±8% del calories_target del plan.',
            'Cada BREAKFAST/LUNCH/DINNER con ≥ 20g de proteína. Cada SNACK con ≥ 5g.',
            'Proteína total por día ≥ 90% del macros.protein_g del plan.',
            'NO uses ingredientes que aparezcan en allergies o disliked_foods (chequea name, description e ingredients).',
        ]
        : [
            'Mantén el shape exacto del template: mismos días, mismos exercise_name (verbatim), mismos sets, mismos reps.',
            'rest_sec puede variar a lo más ±15s respecto al template.',
            'NO agregues ni quites días ni ejercicios.',
            'Lo único que personalizas: routine.name, day.notes, exercise.notes.',
        ];

    return `${originalUserPrompt}

⚠️ TU INTENTO ANTERIOR FALLÓ LA VALIDACIÓN.
Estos son los errores específicos que debes corregir:
${head.map((e, i) => `${i + 1}. ${e}`).join('\n')}${truncatedNote}

REGLAS QUE NO DEBES VOLVER A ROMPER:
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Devuelve SOLO el JSON corregido. Nada antes, nada después.`;
}
