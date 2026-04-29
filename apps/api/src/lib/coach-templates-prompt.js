// ─────────────────────────────────────────────────────────────────
// Coach-Templates Prompt Builder + Slot Validators (FASE 2 helper).
//
// Core idea: cuando COACH_TEMPLATES_V1=true, la IA deja de inventar
// rutinas y planes. En su lugar recibe un TEMPLATE del coach y su
// trabajo se restringe a "personalizar dentro de slots fijos":
//
//   ROUTINES — el shape es VERBATIM. La IA sólo puede:
//     · personalizar `routine.name` con el nombre del socio
//     · refinar la `notes` de cada día (≤120 chars)
//     · refinar la `notes` de cada ejercicio (≤120 chars)
//   La IA NO puede agregar/quitar/renombrar días o ejercicios, ni
//   cambiar sets/reps/exercise_name/day_of_week.
//
//   MEALS — el day 0 del template es VERBATIM. La IA debe generar
//   los días 1-6 manteniendo la MISMA estructura de slots:
//     · mismo número de comidas por día que el template (day 0)
//     · mismas meal_types en los mismos order_index
//     · macros por comida dentro de ±15% de la slot del template
//     · respeta `restrictions` y `allergies` SIN EXCEPCIÓN
//
// Si la respuesta de la IA viola la estructura del template, los
// validadores marcan `ok: false` y el llamador degrada a la rutina/
// plan determinista del template (cero costo, cero confusión).
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ── Feature flag ─────────────────────────────────────────────────
export function isCoachTemplatesV1Enabled() {
    return String(process.env.COACH_TEMPLATES_V1 || '').toLowerCase() === 'true';
}

// ── Constants shared with ai-routines / ai-meal-plans ────────────
const FITNESS_GOALS = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS'];
const LOCATIONS     = ['GYM', 'HOME', 'BOTH'];
const MEAL_TYPES    = ['BREAKFAST', 'SNACK_AM', 'LUNCH', 'SNACK_PM', 'DINNER'];

// ═════════════════════════════════════════════════════════════════
// ROUTINES
// ═════════════════════════════════════════════════════════════════

// AI must return an object with the same shape as our routine model.
// Reusing this exact schema in both helpers keeps validation tight.
export const routineAiResponseSchema = z.object({
    routine: z.object({
        name: z.string().min(1).max(200),
        goal: z.enum(FITNESS_GOALS),
        location: z.enum(LOCATIONS),
        days_per_week: z.number().int().min(2).max(7),
    }),
    days: z.array(
        z.object({
            day_of_week: z.number().int().min(0).max(6),
            title: z.string().min(1).max(200),
            notes: z.string().max(500).nullable().optional(),
            exercises: z.array(
                z.object({
                    exercise_id: z.string().nullable().optional(),
                    exercise_name: z.string().min(1).max(200),
                    video_url: z.string().nullable().optional(),
                    sets: z.number().int().min(1).max(20),
                    reps: z.string().min(1).max(48),
                    rest_sec: z.number().int().min(0).max(600),
                    notes: z.string().max(300).nullable().optional(),
                }),
            ).min(1).max(30),
        }),
    ).min(1).max(7),
});

const ROUTINE_SYSTEM_PROMPT = `Eres el asistente del Coach M.A. Samuel Oswaldo Rodríguez Jeffery (CED·GYM Chihuahua). Recibes un TEMPLATE OFICIAL del coach y tu único trabajo es PERSONALIZARLO para un socio. NO inventas, NO improvisas, NO agregas nada que no venga en el template.

REGLAS NEGOCIABLES:
- Devuelves la rutina con EL MISMO shape exacto del template: misma cantidad de días, mismos exercise_name por día (en el mismo orden), mismos sets, mismos reps, mismo day_of_week.
- Lo único que puedes cambiar:
  1. routine.name → personalizar con el nombre del socio (si existe). Mantén objetivo y días en el nombre.
  2. day.notes → refinar en voz coach mexicano (≤20 palabras). Si hay lesiones declaradas, agrega una nota breve recordando precauciones para esa lesión sin quitar el ejercicio.
  3. exercise.notes → refinar en voz coach mexicano (≤10 palabras). Frases tipo "sube lento y aprieta arriba", "espalda recta", "codos pegados".
  4. exercise.rest_sec → puedes ajustar ±15s si el nivel del socio lo amerita (BEGINNER = más descanso).

REGLAS PROHIBIDAS:
- NO agregues ni quites días.
- NO agregues ni quites ejercicios.
- NO cambies exercise_name (ni siquiera para variar).
- NO cambies sets, reps, day_of_week, ni el orden de los ejercicios.
- NO inventes campos nuevos.

Tono: mexicano norteño, directo, coach que lleva al atleta de la mano. Cero inglés innecesario.

Respondes SOLO con JSON válido siguiendo el esquema. Nada antes, nada después.`;

export function buildRoutinePromptFromTemplate(template, profile) {
    const firstName = (profile?.firstName || '').trim();
    const injuries = (profile?.injuries || []).filter(Boolean);
    const level = profile?.level || template.level;

    // Strip fields from the template that the AI shouldn't see/depend on.
    const tplShape = {
        name: template.name,
        goal: template.objective,
        location: template.location,
        days_per_week: template.days_per_week,
        days: template.days.map((d) => ({
            day_of_week: d.day_of_week,
            title: d.title,
            notes: d.notes ?? null,
            exercises: d.exercises.map((ex) => ({
                exercise_name: ex.exercise_name,
                sets: ex.sets,
                reps: ex.reps,
                rest_sec: ex.rest_sec,
                notes: ex.notes ?? null,
            })),
        })),
    };

    const userPrompt = `TEMPLATE OFICIAL DEL COACH (este es el shape exacto que debes devolver):
${JSON.stringify(tplShape, null, 2)}

PERFIL DEL SOCIO:
- Nombre: ${firstName || '(sin nombre)'}
- Nivel: ${level}
- Lesiones declaradas: ${injuries.length ? injuries.join(', ') : '(ninguna)'}
- Coach signature de este template: "${template.coach_signature || ''}"

TAREA:
1. Devuelve la rutina con el MISMO shape (mismos días, mismos ejercicios, mismo orden).
2. Reescribe \`routine.name\` para incluir el nombre del socio (si existe). Ejemplos válidos: "Rutina Hombre 2025 — Plan de ${firstName || 'Carlos'}", "Glúteo y Femoral — Plan de ${firstName || 'Ana'}".
3. Refina \`day.notes\` y cada \`exercise.notes\` en voz coach mexicano. Para lesiones, agrega cue de precaución sin quitar el ejercicio.
4. Si el nivel es BEGINNER, puedes subir \`rest_sec\` hasta +15s en ejercicios compuestos pesados; si es ADVANCED, puedes bajar hasta -15s. No toques nada más.
5. NO agregues, NO quites, NO renombres ejercicios.

SCHEMA JSON DE SALIDA (mismo del template, pero con tus refinamientos):
{
  "routine": { "name": string, "goal": "${template.objective}", "location": "${template.location}", "days_per_week": ${template.days_per_week} },
  "days": [
    {
      "day_of_week": int,
      "title": string,
      "notes": string,
      "exercises": [{ "exercise_name": string (verbatim), "sets": int (verbatim), "reps": string (verbatim), "rest_sec": int (puedes ajustar ±15s), "notes": string }]
    }
  ]
}`;

    return { system: ROUTINE_SYSTEM_PROMPT, user: userPrompt, schema: routineAiResponseSchema };
}

/**
 * Normaliza un string de `reps` para comparación estructural.
 * El coach mezcla formatos:  "15,12,10,8" / "15-12-10-8" / "15/12/10/8"
 *                            "1 min" / "1min" / "1 minuto"
 *                            "10 pesadas / 10 livianas" (con o sin espacios)
 * Esta función los lleva todos a una forma canónica:
 *   - lower-case
 *   - sin acentos
 *   - separadores ",-/" colapsados a ","
 *   - "1 min" → "1min", "60 segundos"/"60s" → "60s"
 *   - whitespace colapsado
 *
 * Dos reps son equivalentes si su forma canónica coincide.
 */
function _canonicalReps(s) {
    return String(s ?? '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/(\d+)\s*minutos?\b/g, '$1min')
        .replace(/(\d+)\s*min\b/g, '$1min')
        .replace(/(\d+)\s*segundos?\b/g, '$1s')
        .replace(/(\d+)\s*seg\b/g, '$1s')
        .replace(/[–—]/g, '-')         // unicode dashes → ASCII
        .replace(/\s*[,/\-]\s*/g, ',') // unify separators inside numeric runs
        .replace(/\s+/g, ' ')
        .replace(/\.+$/, '')
        .trim();
}

export function repsEquivalent(a, b) {
    return _canonicalReps(a) === _canonicalReps(b);
}

/**
 * Verifica que la respuesta de la IA respete el shape del template:
 * mismos días, mismos ejercicios por día, mismos exercise_name/sets,
 * y `reps` ESTRUCTURALMENTE equivalente (no string-exacto, gracias a
 * `repsEquivalent`).
 *
 * Retorna { ok, errors[] }. `ok=false` ⇒ el llamador debe descartar la
 * respuesta de la IA y caer al template determinista.
 */
export function validateRoutineAgainstTemplate(ai, template) {
    const errors = [];
    if (!ai || !Array.isArray(ai.days)) {
        return { ok: false, errors: ['ai response missing or no days array'] };
    }
    if (ai.routine?.days_per_week !== template.days_per_week) {
        errors.push(`days_per_week: expected ${template.days_per_week}, got ${ai.routine?.days_per_week}`);
    }
    if (ai.routine?.goal !== template.objective) {
        errors.push(`goal: expected ${template.objective}, got ${ai.routine?.goal}`);
    }
    if (ai.routine?.location !== template.location) {
        errors.push(`location: expected ${template.location}, got ${ai.routine?.location}`);
    }
    if (ai.days.length !== template.days.length) {
        errors.push(`days length: expected ${template.days.length}, got ${ai.days.length}`);
    }

    const n = Math.min(ai.days.length, template.days.length);
    for (let i = 0; i < n; i++) {
        const aiDay = ai.days[i];
        const tplDay = template.days[i];
        if (aiDay.day_of_week !== tplDay.day_of_week) {
            errors.push(`day[${i}].day_of_week: expected ${tplDay.day_of_week}, got ${aiDay.day_of_week}`);
        }
        if (!Array.isArray(aiDay.exercises) || aiDay.exercises.length !== tplDay.exercises.length) {
            errors.push(`day[${i}].exercises length: expected ${tplDay.exercises.length}, got ${aiDay.exercises?.length}`);
            continue;
        }
        for (let j = 0; j < tplDay.exercises.length; j++) {
            const aiEx = aiDay.exercises[j];
            const tplEx = tplDay.exercises[j];
            if (aiEx.exercise_name !== tplEx.exercise_name) {
                errors.push(`day[${i}].exercise[${j}].name: expected "${tplEx.exercise_name}", got "${aiEx.exercise_name}"`);
            }
            if (aiEx.sets !== tplEx.sets) {
                errors.push(`day[${i}].exercise[${j}].sets: expected ${tplEx.sets}, got ${aiEx.sets}`);
            }
            if (!repsEquivalent(aiEx.reps, tplEx.reps)) {
                errors.push(`day[${i}].exercise[${j}].reps: expected ~"${tplEx.reps}" (canonical "${_canonicalReps(tplEx.reps)}"), got "${aiEx.reps}"`);
            }
            // rest_sec puede variar ±15s
            if (Math.abs((aiEx.rest_sec ?? -1) - tplEx.rest_sec) > 15) {
                errors.push(`day[${i}].exercise[${j}].rest_sec: out of ±15s window (template ${tplEx.rest_sec}, got ${aiEx.rest_sec})`);
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

/**
 * Construye una respuesta determinista (el template como si la IA lo
 * hubiera devuelto verbatim) para usar como fallback cuando:
 *   - la IA falla
 *   - la respuesta no pasa validateRoutineAgainstTemplate
 *   - flag ON pero no hay OPENAI_API_KEY
 *
 * `firstName` se usa para personalizar el routine.name; el resto es
 * exactamente lo del template.
 */
export function deterministicRoutineFromTemplate(template, { firstName = '' } = {}) {
    const personalizedName = firstName
        ? `${template.name} — Plan de ${firstName}`
        : template.name;
    return {
        routine: {
            name: personalizedName,
            goal: template.objective,
            location: template.location,
            days_per_week: template.days_per_week,
        },
        days: template.days.map((d) => ({
            day_of_week: d.day_of_week,
            title: d.title,
            notes: d.notes ?? null,
            exercises: d.exercises.map((ex) => ({
                exercise_id: null,
                exercise_name: ex.exercise_name,
                video_url: null,
                sets: ex.sets,
                reps: ex.reps,
                rest_sec: ex.rest_sec,
                notes: ex.notes ?? null,
            })),
        })),
    };
}

// ═════════════════════════════════════════════════════════════════
// MEALS
// ═════════════════════════════════════════════════════════════════

export const mealAiResponseSchema = z.object({
    plan: z.object({
        name: z.string().min(1).max(200),
        goal: z.enum(FITNESS_GOALS),
        calories_target: z.number().int().positive(),
        protein_g: z.number().int().nonnegative(),
        carbs_g: z.number().int().nonnegative(),
        fats_g: z.number().int().nonnegative(),
        restrictions: z.array(z.string()).default([]),
    }),
    meals: z.array(
        z.object({
            day_of_week: z.number().int().min(0).max(6),
            meal_type: z.enum(MEAL_TYPES),
            name: z.string().min(1).max(200),
            description: z.string().min(1).max(2000),
            ingredients: z.array(z.string().min(1).max(200)).min(1).max(25),
            calories: z.number().int().nonnegative(),
            protein_g: z.number().int().nonnegative(),
            carbs_g: z.number().int().nonnegative(),
            fats_g: z.number().int().nonnegative(),
            prep_time_min: z.number().int().nonnegative().max(240).optional().nullable(),
            order_index: z.number().int().min(0).max(5),
        }),
    ).min(1).max(60),
});

const MEAL_SYSTEM_PROMPT = `Eres el asistente del nutriólogo de CED·GYM (equipo del Coach M.A. Samuel). Recibes un TEMPLATE OFICIAL de 1 día (day 0) y debes generar un plan SEMANAL (7 días) respetando exactamente la misma estructura de slots.

REGLAS NEGOCIABLES:
- Devuelves un array \`meals\` con 7 días × N comidas (N = comidas por día del template).
- Para day_of_week=0: USA EL TEMPLATE VERBATIM (mismo \`name\`, \`description\`, \`ingredients\`, macros, order_index, meal_type). Solo puedes ajustar \`name\` con el nombre del socio si lo crees apropiado.
- Para day_of_week 1..6: VARÍA ingredientes/recetas pero respeta:
  · Mismo \`meal_type\` en cada \`order_index\` que el template.
  · Misma cantidad de comidas por día que el template.
  · Calorías de cada comida dentro de ±15% de la slot equivalente en day 0.
  · Mismo balance macros (proteína/carbo/grasa) ±20% por comida.
  · Mismas reglas del coach: cantidades específicas en gramos/ml/piezas, recetas paso a paso (1., 2., 3., ... separadas por \\n), sin "al gusto".
  · Respeta restrictions y allergies SIN EXCEPCIÓN.

REGLAS PROHIBIDAS:
- NO agregues ni quites comidas en ningún día.
- NO cambies meal_type ni order_index respecto al day 0.
- NO uses ingredientes que aparecen en allergies / disliked_foods.
- NO inventes superfoods raros — usa ingredientes mexicanos accesibles.

TONO: mexicano, cercano, práctico. Las descripciones son recetas paso a paso.

Respondes SOLO con JSON válido. Nada antes, nada después.`;

export function buildMealPromptFromTemplate(template, profile) {
    const firstName = (profile?.firstName || '').trim();
    const restrictions = profile?.restrictions || [];
    const allergies = profile?.allergies || [];
    const dislikes = profile?.disliked_foods || [];
    const country = profile?.country || template.country || 'MX';

    // Day 0 strict: this is what the AI must echo verbatim and use as
    // the template for days 1-6.
    const day0 = template.meals
        .filter((m) => m.day_of_week === 0)
        .sort((a, b) => a.order_index - b.order_index)
        .map((m) => ({
            day_of_week: 0,
            meal_type: m.meal_type,
            order_index: m.order_index,
            name: m.name,
            description: m.description,
            ingredients: m.ingredients,
            calories: m.calories,
            protein_g: m.protein_g,
            carbs_g: m.carbs_g,
            fats_g: m.fats_g,
            prep_time_min: m.prep_time_min ?? null,
        }));

    const slotMap = day0.map((m) => ({ order_index: m.order_index, meal_type: m.meal_type, calories_target: m.calories }));

    const userPrompt = `TEMPLATE OFICIAL DEL COACH (1 día, este es el contrato de slots):
${JSON.stringify(day0, null, 2)}

ESTRUCTURA DE SLOTS (debes respetar esto en CADA día 0..6):
${JSON.stringify(slotMap, null, 2)}

PERFIL DEL SOCIO:
- Nombre: ${firstName || '(sin nombre)'}
- País: ${country}
- Restricciones: ${restrictions.join(', ') || '(ninguna)'}
- Alergias: ${allergies.join(', ') || '(ninguna)'}
- No le gusta: ${dislikes.join(', ') || '(nada)'}
- Coach signature: "${template.coach_signature || ''}"

TAREA:
1. Genera \`meals\`: array con 7 días × ${day0.length} comidas = ${day0.length * 7} entradas total.
2. Para day_of_week=0: USA EL TEMPLATE VERBATIM (mismos campos exactos).
3. Para days 1..6: VARÍA name/description/ingredients pero respeta meal_type, order_index, y calorías dentro de ±15% de la slot equivalente.
4. \`plan.name\` debe incluir el nombre del socio (si existe). Ejemplos: "Plan de Ana — base 2200 kcal", "Plan de Luis — Paty Herrera (5 comidas)".
5. \`plan.calories_target\` = ${template.calories_target_kcal}, macros = ${JSON.stringify(template.macros)}.
6. NO agregues meal_types nuevos ni quites slots.

SCHEMA JSON:
{
  "plan": {
    "name": string,
    "goal": "${template.objective}",
    "calories_target": ${template.calories_target_kcal},
    "protein_g": ${template.macros.protein_g},
    "carbs_g": ${template.macros.carbs_g},
    "fats_g": ${template.macros.fats_g},
    "restrictions": ${JSON.stringify(restrictions)}
  },
  "meals": [
    { "day_of_week": 0..6, "meal_type": (verbatim de slot), "order_index": (verbatim de slot), "name": string, "description": string (recetas paso a paso), "ingredients": [string], "calories": int, "protein_g": int, "carbs_g": int, "fats_g": int, "prep_time_min": int|null }
  ]
}`;

    return { system: MEAL_SYSTEM_PROMPT, user: userPrompt, schema: mealAiResponseSchema };
}

/**
 * Verifica que la respuesta IA respete los slots del template:
 *   - 7 días distintos (0..6)
 *   - cada día tiene exactamente N comidas (N = day-0 del template)
 *   - meal_type @ order_index === template.day0.meal_type @ same order_index
 *   - cada comida con calorías dentro de ±15% de la slot template
 *   - ningún ingrediente menciona los allergies del perfil (case-insensitive substring)
 */
export function validateMealAgainstTemplate(ai, template, profile = {}) {
    const errors = [];
    if (!ai || !Array.isArray(ai.meals)) {
        return { ok: false, errors: ['ai response missing or no meals array'] };
    }
    const day0 = template.meals
        .filter((m) => m.day_of_week === 0)
        .sort((a, b) => a.order_index - b.order_index);
    const expectedSlots = day0.length;

    // Group ai meals by day
    const byDay = new Map();
    for (const m of ai.meals) {
        if (!byDay.has(m.day_of_week)) byDay.set(m.day_of_week, []);
        byDay.get(m.day_of_week).push(m);
    }
    if (byDay.size !== 7) {
        errors.push(`expected 7 distinct days, got ${byDay.size}`);
    }
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
        const dayMeals = byDay.get(day) || [];
        if (dayMeals.length !== expectedSlots) {
            errors.push(`day ${day}: expected ${expectedSlots} meals, got ${dayMeals.length}`);
            continue;
        }
        dayMeals.sort((a, b) => a.order_index - b.order_index);
        for (let i = 0; i < expectedSlots; i++) {
            const aiM = dayMeals[i];
            const tplM = day0[i];
            if (aiM.order_index !== tplM.order_index) {
                errors.push(`day ${day} slot ${i}: order_index expected ${tplM.order_index}, got ${aiM.order_index}`);
            }
            if (aiM.meal_type !== tplM.meal_type) {
                errors.push(`day ${day} slot ${i}: meal_type expected ${tplM.meal_type}, got ${aiM.meal_type}`);
            }
            // calories within ±15% (allow generous floor for SNACK_AM-type tiny meals)
            const lo = Math.floor(tplM.calories * 0.85) - 30;
            const hi = Math.ceil(tplM.calories * 1.15) + 30;
            if (aiM.calories < lo || aiM.calories > hi) {
                errors.push(`day ${day} slot ${i}: calories ${aiM.calories} out of [${lo}, ${hi}] (template ${tplM.calories})`);
            }
        }
    }

    // Allergy/dislike crosscheck — substring match on lowered ingredient text
    const banned = [...(profile.allergies || []), ...(profile.disliked_foods || [])]
        .map((s) => String(s).toLowerCase().trim())
        .filter(Boolean);
    if (banned.length) {
        for (const m of ai.meals) {
            const text = (m.ingredients || []).join(' | ').toLowerCase();
            for (const word of banned) {
                if (text.includes(word)) {
                    errors.push(`day ${m.day_of_week} ${m.meal_type}: contains banned "${word}"`);
                    break;
                }
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

// ── Deterministic meal fallback: A/B/C variant rotation ──────────
//
// Antes el fallback replicaba day-0 a 7 días idéntico. Producto se
// quejó de que era aburrido. Ahora rotamos 3 "variantes" sin IA:
//
//   day 0 / 3 / 6 → variant A — template verbatim
//   day 1 / 4     → variant B — alterna proteína (pollo → pescado)
//   day 2 / 5     → variant C — alterna proteína (pollo → res magra)
//                                 + carbo (arroz → camote)
//
// La sustitución es regex case-insensitive sobre `name`, `description`
// y cada `ingredient[]`. Macros NO se tocan (la sustitución es por
// equivalentes calóricos / macro, no se recalcula). Si una variante
// no encuentra ningún match (templates futuros sin pollo/arroz),
// vuelve al day-0 verbatim — peor caso = comportamiento previo.

const VARIANT_BY_DAY = ['A', 'B', 'C', 'A', 'B', 'C', 'A'];

const VARIANT_SWAPS = {
    A: [],
    B: [
        // proteína: pollo → pescado
        ['Pechuga a la plancha con arroz y verdura', 'Pescado al limón con arroz y verdura'],
        ['pechuga de pollo', 'filete de pescado blanco'],
        ['pollo o carne magra o pescado', 'filete de pescado blanco'],
        ['pollo a la plancha', 'pescado a la plancha'],
        ['Pollo a la plancha', 'Pescado a la plancha'],
        ['pollo desmenuzado', 'atún desmenuzado'],
        ['salmón', 'atún fresco'],
        ['atún en agua', 'sardinas en agua'],
        ['Pollo', 'Pescado'],
    ],
    C: [
        // proteína: pollo → res; carbo: arroz → camote
        ['Pechuga a la plancha con arroz y verdura', 'Bistec de res magra con camote y verdura'],
        ['pechuga de pollo', 'bistec de res magra'],
        ['pollo o carne magra o pescado', 'bistec de res magra'],
        ['pollo a la plancha', 'carne magra a la plancha'],
        ['Pollo a la plancha', 'Bistec a la plancha'],
        ['pollo', 'carne magra'],
        ['Pollo', 'Bistec'],
        ['salmón', 'lomo de cerdo magro'],
        ['arroz integral cocido', 'camote al vapor'],
        ['arroz integral', 'camote al vapor'],
        ['arroz', 'camote'],
    ],
};

function _escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _applyVariantSwaps(meal, variant) {
    const swaps = VARIANT_SWAPS[variant];
    if (!swaps || swaps.length === 0) return meal;
    const swap = (str) => {
        if (!str) return str;
        let out = String(str);
        for (const [from, to] of swaps) {
            out = out.replace(new RegExp(_escapeRegex(from), 'g'), to);
        }
        return out;
    };
    return {
        ...meal,
        name: swap(meal.name),
        description: swap(meal.description),
        ingredients: (meal.ingredients || []).map(swap),
    };
}

/**
 * Plan determinista con variación A/B/C.
 *
 * Es el fallback cuando la IA falla o no pasa `validateMealAgainstTemplate`.
 * Cumple la regla "nunca dejar al socio sin plan" Y produce contenido
 * variado a través de la semana sin gastar tokens.
 *
 * Si las restricciones del socio incluyen una de las palabras del swap
 * (ej. el socio NO come pescado pero la variante B lo introduce),
 * filtramos los días-B/C correspondientes para evitar romper la
 * restricción y usamos variante A en su lugar.
 */
export function deterministicMealsFromTemplate(template, {
    firstName = '',
    restrictions = [],
    allergies = [],
    disliked_foods = [],
} = {}) {
    const day0 = template.meals
        .filter((m) => m.day_of_week === 0)
        .sort((a, b) => a.order_index - b.order_index);
    const personalizedName = firstName
        ? `${template.name} — Plan de ${firstName}`
        : template.name;

    // Si una variante introduce un alimento que el socio no come,
    // forzamos esa variante a A (verbatim del template).
    const banned = [...allergies, ...disliked_foods]
        .map((s) => String(s).toLowerCase().trim())
        .filter(Boolean);
    const variantSafe = (variant) => {
        if (variant === 'A' || banned.length === 0) return variant;
        const swaps = VARIANT_SWAPS[variant] || [];
        // Cualquier `to` (lo que la variante introduce) que coincida con
        // un banned ⇒ no usamos la variante.
        for (const [, to] of swaps) {
            const lo = to.toLowerCase();
            if (banned.some((b) => lo.includes(b))) return 'A';
        }
        return variant;
    };

    const meals = [];
    for (let day = 0; day < 7; day++) {
        const variant = variantSafe(VARIANT_BY_DAY[day]);
        for (const m of day0) {
            const variantMeal = _applyVariantSwaps(m, variant);
            meals.push({
                day_of_week: day,
                meal_type: variantMeal.meal_type,
                order_index: variantMeal.order_index,
                name: variantMeal.name,
                description: variantMeal.description,
                ingredients: variantMeal.ingredients,
                calories: variantMeal.calories,
                protein_g: variantMeal.protein_g,
                carbs_g: variantMeal.carbs_g,
                fats_g: variantMeal.fats_g,
                prep_time_min: variantMeal.prep_time_min ?? null,
            });
        }
    }
    return {
        plan: {
            name: personalizedName,
            goal: template.objective,
            calories_target: template.calories_target_kcal,
            protein_g: template.macros.protein_g,
            carbs_g: template.macros.carbs_g,
            fats_g: template.macros.fats_g,
            restrictions,
        },
        meals,
    };
}
