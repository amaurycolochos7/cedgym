// ─────────────────────────────────────────────────────────────────
// LOCAL pre-flight harness for the coach-templates pipeline.
//
// Exercises the SAME retry-loop logic as ai-routines.js / ai-meal-plans.js
// but WITHOUT touching OpenAI, the DB, or staging. Each scenario stubs an
// "openai" function that either returns a fabricated aiResponse or throws
// to simulate upstream failures. Validation, retries, and deterministic
// fallback all run against the real production helpers.
//
// Usage:
//   node src/coach-templates/staging-rehearsal.js                 # all
//   node src/coach-templates/staging-rehearsal.js <scenario-id>   # one
//   node src/coach-templates/staging-rehearsal.js --json          # JSON
// ─────────────────────────────────────────────────────────────────

import {
    select_routine_template,
    select_meal_template,
} from './loader.js';

import {
    buildRoutinePromptFromTemplate,
    buildMealPromptFromTemplate,
    deterministicRoutineFromTemplate,
    deterministicMealsFromTemplate,
} from '../lib/coach-templates-prompt.js';

import {
    validate_routine_response,
    validate_meal_response,
    buildRetryUserPrompt,
} from '../lib/template-validator.js';

// ── Profiles ─────────────────────────────────────────────────────
const ROUTINE_PROFILE = {
    objective: 'MUSCLE_GAIN',
    level: 'INTERMEDIATE',
    user_type: 'ADULT',
    location: 'GYM',
    days_per_week: 5,
    gender: 'MALE',
    firstName: 'Carlos',
    injuries: [],
};

const MEAL_PROFILE_BASE = {
    objective: 'MUSCLE_GAIN',
    meals_per_day: 5,
    country: 'MX',
    gender: 'MALE',
    firstName: 'Carlos',
    calories_target: 2200,
    restrictions: [],
    allergies: [],
    disliked_foods: [],
};

const MEAL_PROFILE_ALLERGY = {
    ...MEAL_PROFILE_BASE,
    allergies: ['cacahuate'],
};

// ── Pipeline runner (mirrors the route's retry loop) ─────────────
async function runPipeline(kind, template, profile, openaiStub) {
    const builder = kind === 'routine'
        ? buildRoutinePromptFromTemplate
        : buildMealPromptFromTemplate;
    const validator = kind === 'routine'
        ? validate_routine_response
        : validate_meal_response;
    const fallback = kind === 'routine'
        ? () => deterministicRoutineFromTemplate(template, { firstName: profile.firstName })
        : () => deterministicMealsFromTemplate(template, {
            firstName: profile.firstName,
            restrictions: profile.restrictions || [],
            allergies: profile.allergies || [],
            disliked_foods: profile.disliked_foods || [],
        });

    const { user: userPromptOriginal } = builder(template, profile);
    let userPromptCurrent = userPromptOriginal;
    let data = null;
    let lastValidation = null;
    let openai_threw = false;
    let used_fallback = false;
    let attempts = 0;
    let outcome = 'OK';

    for (attempts = 1; attempts <= 2; attempts++) {
        let aiResponse;
        try {
            aiResponse = await openaiStub(userPromptCurrent, attempts);
        } catch {
            data = fallback();
            used_fallback = true;
            openai_threw = true;
            lastValidation = { ok: true, errors: [], note: 'fallback (openai threw)' };
            break;
        }

        const v = validator(aiResponse, template, profile);
        lastValidation = v;
        if (v.ok) {
            data = aiResponse;
            break;
        }
        if (attempts < 2) {
            userPromptCurrent = buildRetryUserPrompt(userPromptOriginal, v.errors, kind);
        }
    }

    if (!data && !openai_threw) {
        outcome = '422';
    }

    // The for-loop semantics leave `attempts` post-incremented when the
    // loop exits via the `<=2` check failing (i.e. both attempts failed).
    // Clamp to the actual number of attempts spent (max 2) so the report
    // matches the route's response shape.
    const attemptsActual = Math.min(attempts, 2);

    return {
        attempts: attemptsActual,
        data,
        validation: lastValidation,
        used_fallback,
        openai_threw,
        outcome,
    };
}

// ── Mutation helpers ─────────────────────────────────────────────
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function mutateRoutineRenameExercise(payload) {
    const c = deepClone(payload);
    if (c.days[1] && c.days[1].exercises[2]) {
        c.days[1].exercises[2].exercise_name = c.days[1].exercises[2].exercise_name + ' (drift)';
    }
    return c;
}

function mutateRoutineExtraDay(payload, template) {
    const c = deepClone(payload);
    // Clone the last day with a different day_of_week to inflate count to 8.
    const last = deepClone(template.days[template.days.length - 1]);
    last.day_of_week = 6; // any value; the length check fails first anyway
    c.days.push({
        day_of_week: 6,
        title: last.title + ' EXTRA',
        notes: 'extra day drift',
        exercises: last.exercises.map((ex) => ({
            exercise_id: null,
            exercise_name: ex.exercise_name,
            video_url: null,
            sets: ex.sets,
            reps: ex.reps,
            rest_sec: ex.rest_sec,
            notes: ex.notes ?? null,
        })),
    });
    c.routine.days_per_week = c.routine.days_per_week + 1;
    return c;
}

function mutateMealKcal(payload) {
    const c = deepClone(payload);
    const lunchIdx = c.meals.findIndex((m) => m.meal_type === 'LUNCH');
    if (lunchIdx !== -1) {
        c.meals[lunchIdx].calories = Math.round(c.meals[lunchIdx].calories * 1.25);
    }
    return c;
}

function mutateMealAllergen(payload) {
    const c = deepClone(payload);
    const idx = c.meals.findIndex((m) => m.meal_type === 'LUNCH');
    if (idx !== -1) {
        c.meals[idx].ingredients = [...c.meals[idx].ingredients, 'cacahuate tostado 20g'];
    }
    return c;
}

function mutateMealLowProtein(payload) {
    const c = deepClone(payload);
    for (const m of c.meals) {
        if (m.meal_type === 'LUNCH') m.protein_g = 8;
    }
    return c;
}

// ── Stub factories ───────────────────────────────────────────────
function stubReturnDeterministicRoutine(tpl, profile) {
    return async () => deterministicRoutineFromTemplate(tpl, { firstName: profile.firstName });
}

function stubReturnDeterministicMeals(tpl, profile) {
    return async () => deterministicMealsFromTemplate(tpl, {
        firstName: profile.firstName,
        restrictions: profile.restrictions || [],
        allergies: profile.allergies || [],
        disliked_foods: profile.disliked_foods || [],
    });
}

// ── Deviation report (meals only) ────────────────────────────────
function computeMealDeviations(data, template) {
    if (!data || !Array.isArray(data.meals)) return [];
    const day0 = template.meals
        .filter((m) => m.day_of_week === 0)
        .sort((a, b) => a.order_index - b.order_index);
    const slotByOrder = new Map(day0.map((m) => [m.order_index, m]));
    const out = [];
    for (const m of data.meals) {
        const slot = slotByOrder.get(m.order_index);
        if (!slot) continue;
        const kcalDev = slot.calories ? (m.calories - slot.calories) / slot.calories : 0;
        const protDev = slot.protein_g ? (m.protein_g - slot.protein_g) / slot.protein_g : 0;
        out.push({ kcal_deviation_pct: kcalDev, protein_deviation_pct: protDev });
    }
    return out;
}

function aggregate(values) {
    if (values.length === 0) return { min: 0, avg: 0, max: 0, p95: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((s, v) => s + v, 0);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return {
        min: sorted[0],
        avg: sum / values.length,
        max: sorted[sorted.length - 1],
        p95: sorted[p95Idx],
    };
}

function fmtPct(n) {
    const pct = n * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
}

// ── Scenarios ────────────────────────────────────────────────────
function buildScenarios() {
    const routineTpl = select_routine_template(ROUTINE_PROFILE);
    const mealTpl = select_meal_template(MEAL_PROFILE_BASE);
    const mealTplAllergy = select_meal_template(MEAL_PROFILE_ALLERGY);

    if (!routineTpl) throw new Error('No routine template found for profile');
    if (!mealTpl) throw new Error('No meal template found for profile');

    const routineGold = deterministicRoutineFromTemplate(routineTpl, { firstName: ROUTINE_PROFILE.firstName });
    const mealGold = deterministicMealsFromTemplate(mealTpl, {
        firstName: MEAL_PROFILE_BASE.firstName,
        restrictions: [],
        allergies: [],
        disliked_foods: [],
    });
    const mealGoldAllergy = deterministicMealsFromTemplate(mealTplAllergy, {
        firstName: MEAL_PROFILE_ALLERGY.firstName,
        restrictions: [],
        allergies: MEAL_PROFILE_ALLERGY.allergies,
        disliked_foods: [],
    });

    return [
        {
            id: 'valid-routine',
            kind: 'routine',
            template: routineTpl,
            profile: ROUTINE_PROFILE,
            expected: { attempts: 1, outcome: 'OK', used_fallback: false },
            stub: async () => deepClone(routineGold),
        },
        {
            id: 'valid-meal',
            kind: 'meal',
            template: mealTpl,
            profile: MEAL_PROFILE_BASE,
            expected: { attempts: 1, outcome: 'OK', used_fallback: false },
            stub: async () => deepClone(mealGold),
        },
        {
            id: 'drift-routine-exercise-name',
            kind: 'routine',
            template: routineTpl,
            profile: ROUTINE_PROFILE,
            expected: { attempts: 2, outcome: 'OK', used_fallback: false },
            stub: async (_p, attempt) => {
                if (attempt === 1) return mutateRoutineRenameExercise(routineGold);
                return deepClone(routineGold);
            },
        },
        {
            id: 'drift-meal-kcal',
            kind: 'meal',
            template: mealTpl,
            profile: MEAL_PROFILE_BASE,
            expected: { attempts: 2, outcome: 'OK', used_fallback: false },
            stub: async (_p, attempt) => {
                if (attempt === 1) return mutateMealKcal(mealGold);
                return deepClone(mealGold);
            },
        },
        {
            id: 'drift-meal-allergen',
            kind: 'meal',
            template: mealTplAllergy,
            profile: MEAL_PROFILE_ALLERGY,
            expected: { attempts: 2, outcome: 'OK', used_fallback: false },
            stub: async (_p, attempt) => {
                if (attempt === 1) return mutateMealAllergen(mealGoldAllergy);
                return deepClone(mealGoldAllergy);
            },
        },
        {
            id: 'drift-routine-extra-day',
            kind: 'routine',
            template: routineTpl,
            profile: ROUTINE_PROFILE,
            expected: { attempts: 2, outcome: '422', used_fallback: false },
            stub: async () => mutateRoutineExtraDay(routineGold, routineTpl),
        },
        {
            id: 'drift-meal-low-protein',
            kind: 'meal',
            template: mealTpl,
            profile: MEAL_PROFILE_BASE,
            expected: { attempts: 2, outcome: '422', used_fallback: false },
            stub: async () => mutateMealLowProtein(mealGold),
        },
        {
            id: 'openai-throw-routine',
            kind: 'routine',
            template: routineTpl,
            profile: ROUTINE_PROFILE,
            expected: { attempts: 1, outcome: 'OK', used_fallback: true },
            stub: async () => { throw new Error('AI_UPSTREAM_ERROR: simulated'); },
        },
        {
            id: 'openai-throw-meal',
            kind: 'meal',
            template: mealTpl,
            profile: MEAL_PROFILE_BASE,
            expected: { attempts: 1, outcome: 'OK', used_fallback: true },
            stub: async () => { throw new Error('AI_UPSTREAM_ERROR: simulated'); },
        },
    ];
}

// ── Runner ───────────────────────────────────────────────────────
async function runScenario(s) {
    const result = await runPipeline(s.kind, s.template, s.profile, s.stub);
    let deviations = [];
    if (s.kind === 'meal' && result.data) {
        deviations = computeMealDeviations(result.data, s.template);
    }
    return { ...result, id: s.id, kind: s.kind, expected: s.expected, deviations };
}

function classify(r) {
    if (r.outcome === '422') return '422 (validation_failed)';
    if (r.used_fallback) return 'OK (fallback)';
    if (r.attempts === 2) return 'OK (retry succeeded)';
    return 'OK';
}

function printSummary(results) {
    const total = results.length;
    const retried = results.filter((r) => r.attempts === 2 && !r.used_fallback && r.outcome !== '422').length;
    const failed422 = results.filter((r) => r.outcome === '422').length;
    const fallback = results.filter((r) => r.used_fallback).length;
    const firstTry = results.filter((r) => r.attempts === 1 && !r.used_fallback).length;

    const allKcal = [];
    const allProt = [];
    for (const r of results) {
        if (r.kind !== 'meal') continue;
        for (const d of r.deviations) {
            allKcal.push(d.kcal_deviation_pct);
            allProt.push(d.protein_deviation_pct);
        }
    }
    const kcalAgg = aggregate(allKcal);
    const protAgg = aggregate(allProt);

    const pct = (n) => `${((n / total) * 100).toFixed(0)}%`;

    let conclusion = 'SYSTEM STABLE';
    const unexpected = results.filter((r) => {
        if (r.expected.attempts !== r.attempts) return true;
        if (r.expected.outcome !== r.outcome) return true;
        if (r.expected.used_fallback !== r.used_fallback) return true;
        return false;
    });
    if (unexpected.length > 0) conclusion = 'CRITICAL ISSUE';
    else if (Math.abs(kcalAgg.max) > 0.30 || Math.abs(protAgg.max) > 0.50) conclusion = 'NEEDS TUNING';

    const lines = [];
    lines.push('');
    lines.push('─── PRE-FLIGHT REPORT ──────────────────────────────────────');
    lines.push(`Scenarios run: ${total}`);
    lines.push(`% with retry (attempts=2): ${pct(retried)}`);
    lines.push(`% AI_VALIDATION_FAILED (422): ${pct(failed422)}`);
    lines.push(`% used_fallback (OpenAI throw): ${pct(fallback)}`);
    lines.push(`% first-try success: ${pct(firstTry)}`);
    lines.push('');
    lines.push('Meal kcal deviation across all attempts:');
    lines.push(`  min: ${fmtPct(kcalAgg.min)}, avg: ${fmtPct(kcalAgg.avg)}, max: ${fmtPct(kcalAgg.max)}, p95: ${fmtPct(kcalAgg.p95)}`);
    lines.push('');
    lines.push('Meal protein deviation:');
    lines.push(`  min: ${fmtPct(protAgg.min)}, avg: ${fmtPct(protAgg.avg)}, max: ${fmtPct(protAgg.max)}, p95: ${fmtPct(protAgg.p95)}`);
    lines.push('');
    lines.push('By-scenario:');
    const labelWidth = Math.max(...results.map((r) => r.id.length));
    for (const r of results) {
        const label = r.id.padEnd(labelWidth, ' ');
        const expectedMatch =
            r.expected.attempts === r.attempts &&
            r.expected.outcome === r.outcome &&
            r.expected.used_fallback === r.used_fallback;
        const tag = expectedMatch ? '' : '  [UNEXPECTED]';
        lines.push(`  ${label} -> attempts=${r.attempts}, ${classify(r)}${tag}`);
    }
    lines.push('');
    lines.push(`Conclusion: ${conclusion}`);
    lines.push('────────────────────────────────────────────────────────────');
    process.stdout.write(lines.join('\n') + '\n');
}

function printDetail(r) {
    process.stdout.write(JSON.stringify({
        id: r.id,
        kind: r.kind,
        attempts: r.attempts,
        outcome: r.outcome,
        used_fallback: r.used_fallback,
        openai_threw: r.openai_threw,
        validation: r.validation,
        deviations_summary: r.kind === 'meal'
            ? {
                kcal: aggregate(r.deviations.map((d) => d.kcal_deviation_pct)),
                protein: aggregate(r.deviations.map((d) => d.protein_deviation_pct)),
                count: r.deviations.length,
            }
            : null,
        data_top_level: r.data
            ? (r.kind === 'routine'
                ? { routine: r.data.routine, day_count: r.data.days?.length }
                : { plan: r.data.plan, meal_count: r.data.meals?.length })
            : null,
    }, null, 2) + '\n');
}

// ── CLI ──────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const jsonMode = args.includes('--json');
    const targetId = args.find((a) => !a.startsWith('--'));

    const scenarios = buildScenarios();
    const filtered = targetId
        ? scenarios.filter((s) => s.id === targetId)
        : scenarios;

    if (filtered.length === 0) {
        process.stderr.write(`No scenario matches "${targetId}". Known: ${scenarios.map((s) => s.id).join(', ')}\n`);
        process.exit(2);
    }

    const results = [];
    for (const s of filtered) {
        results.push(await runScenario(s));
    }

    if (jsonMode) {
        const allKcal = results.flatMap((r) => r.kind === 'meal' ? r.deviations.map((d) => d.kcal_deviation_pct) : []);
        const allProt = results.flatMap((r) => r.kind === 'meal' ? r.deviations.map((d) => d.protein_deviation_pct) : []);
        process.stdout.write(JSON.stringify({
            scenarios: results.map((r) => ({
                id: r.id,
                kind: r.kind,
                attempts: r.attempts,
                outcome: r.outcome,
                used_fallback: r.used_fallback,
                openai_threw: r.openai_threw,
                validation_ok: r.validation?.ok ?? false,
                validation_errors: r.validation?.errors?.slice(0, 5) ?? [],
                expected: r.expected,
                expected_match:
                    r.expected.attempts === r.attempts &&
                    r.expected.outcome === r.outcome &&
                    r.expected.used_fallback === r.used_fallback,
            })),
            aggregates: {
                kcal: aggregate(allKcal),
                protein: aggregate(allProt),
            },
        }, null, 2) + '\n');
        return;
    }

    if (targetId) {
        for (const r of results) printDetail(r);
        return;
    }

    printSummary(results);
}

main().catch((e) => {
    process.stderr.write(`harness crashed: ${e?.stack || e?.message || e}\n`);
    process.exit(1);
});
