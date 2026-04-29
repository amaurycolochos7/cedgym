// ─────────────────────────────────────────────────────────────────
// Coach-Templates loader.
//
// Loads deterministic Coach-Samuel routines and meal-plan templates
// from disk on first call (then cached in memory).
//
// Two tiers:
//   - source: 'COACH_EXCEL'  → template literal de los Excels reales
//                              (rutina hombre 2025, Francia Pavón, DIETA PATY).
//                              SIEMPRE se prefiere sobre GENERIC en empates.
//   - source: 'GENERIC'      → fallback que cubre casos sin Excel real.
//
// Public API:
//   load_all_routine_templates()     → RoutineTemplate[]
//   load_all_meal_templates()        → MealTemplate[]
//   select_routine_template(profile) → RoutineTemplate | null
//   select_meal_template(profile)    → MealTemplate    | null
//
// Schema documented in ./SCHEMA.md.
// ─────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTINES_DIR = path.join(__dirname, 'routines');
const MEALS_DIR    = path.join(__dirname, 'meals');

// ── Enums (must match ai-routines.js / ai-meal-plans.js) ─────────
const FITNESS_GOALS = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS'];
const USER_TYPES    = ['ADULT', 'SENIOR', 'KID', 'ATHLETE'];
const LEVELS        = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LOCATIONS     = ['GYM', 'HOME', 'BOTH'];
const DISCIPLINES   = [
    'STRENGTH', 'HYROX', 'POWERLIFTING', 'FUNCTIONAL',
    'FOOTBALL_US', 'FOOTBALL_SOCCER', 'BASKETBALL', 'TENNIS', 'BOXING', 'CROSSFIT',
];
const MEAL_TYPES    = ['BREAKFAST', 'SNACK_AM', 'LUNCH', 'SNACK_PM', 'DINNER'];
const SOURCES       = ['COACH_EXCEL', 'GENERIC'];
const GENDERS       = ['MALE', 'FEMALE'];

// ── Zod schemas ──────────────────────────────────────────────────
const routineExerciseSchema = z.object({
    exercise_name: z.string().min(1).max(200),
    sets: z.number().int().min(1).max(20),
    reps: z.string().min(1).max(48),
    rest_sec: z.number().int().min(0).max(600),
    notes: z.string().max(300).nullable().optional(),
});

const routineDaySchema = z.object({
    day_of_week: z.number().int().min(0).max(6),
    title: z.string().min(1).max(200),
    notes: z.string().max(500).nullable().optional(),
    exercises: z.array(routineExerciseSchema).min(1).max(30),
});

export const routineTemplateSchema = z.object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().default(''),
    source: z.enum(SOURCES).default('GENERIC'),
    coach_signature: z.string().max(300).optional().default(''),
    objective: z.enum(FITNESS_GOALS),
    user_type: z.enum(USER_TYPES),
    level: z.enum(LEVELS),
    days_per_week: z.number().int().min(2).max(7),
    location: z.enum(LOCATIONS),
    discipline: z.enum(DISCIPLINES).nullable().optional(),
    gender: z.enum(GENDERS).nullable().optional().default(null),
    days: z.array(routineDaySchema).min(1).max(7),
});

const mealItemSchema = z.object({
    day_of_week: z.number().int().min(0).max(6),
    meal_type: z.enum(MEAL_TYPES),
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(2000),
    ingredients: z.array(z.string().min(1).max(120)).min(1).max(25),
    calories: z.number().int().nonnegative(),
    protein_g: z.number().int().nonnegative(),
    carbs_g: z.number().int().nonnegative(),
    fats_g: z.number().int().nonnegative(),
    prep_time_min: z.number().int().nonnegative().max(240).optional().nullable(),
    order_index: z.number().int().min(0).max(5),
});

export const mealTemplateSchema = z.object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).optional().default(''),
    source: z.enum(SOURCES).default('GENERIC'),
    coach_signature: z.string().max(300).optional().default(''),
    objective: z.enum(FITNESS_GOALS),
    meals_per_day: z.union([z.literal(3), z.literal(4), z.literal(5)]),
    country: z.string().min(2).max(3).default('MX'),
    gender: z.enum(GENDERS).nullable().optional().default(null),
    calories_target_kcal: z.number().int().positive().max(6000),
    macros: z.object({
        protein_g: z.number().int().nonnegative(),
        carbs_g:   z.number().int().nonnegative(),
        fats_g:    z.number().int().nonnegative(),
    }),
    restrictions: z.array(z.string()).default([]),
    meals: z.array(mealItemSchema).min(1).max(60),
});

// ── In-memory cache (lazy, loaded on first call) ─────────────────
let _routineCache = null;
let _mealCache    = null;

// ── Helpers ──────────────────────────────────────────────────────
function _readJsonDir(dir, schema, kind) {
    if (!fs.existsSync(dir)) {
        return { items: [], errors: [{ file: dir, error: 'directory missing' }] };
    }
    const items = [];
    const errors = [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
        const full = path.join(dir, f);
        try {
            const raw = fs.readFileSync(full, 'utf8');
            const json = JSON.parse(raw);
            const parsed = schema.safeParse(json);
            if (!parsed.success) {
                errors.push({ file: f, error: parsed.error.flatten() });
                continue;
            }
            // The seed convention prefixes ids with `rt-` (routines) or
            // `mp-` (meal plans) while the filename omits the prefix —
            // accept either: id with leading `rt-`/`mp-` stripped must
            // equal the filename slug.
            const slug = path.basename(f, '.json');
            const idCore = parsed.data.id.replace(/^(rt-|mp-)/, '');
            if (idCore !== slug) {
                errors.push({
                    file: f,
                    error: `id "${parsed.data.id}" does not match filename slug "${slug}"`,
                });
                continue;
            }
            items.push(parsed.data);
        } catch (e) {
            errors.push({ file: f, error: e.message });
        }
    }
    if (errors.length) {
        // Don't throw — log and skip bad files. The selector degrades
        // gracefully if the catalog is empty (returns null).
        console.warn(
            `[coach-templates] ${kind}: ${errors.length} file(s) failed validation:`,
            JSON.stringify(errors, null, 2),
        );
    }
    return { items, errors };
}

// ── Public loaders ───────────────────────────────────────────────
export function load_all_routine_templates({ force_reload = false } = {}) {
    if (_routineCache && !force_reload) return _routineCache;
    const { items } = _readJsonDir(ROUTINES_DIR, routineTemplateSchema, 'routines');
    _routineCache = items;
    return items;
}

export function load_all_meal_templates({ force_reload = false } = {}) {
    if (_mealCache && !force_reload) return _mealCache;
    const { items } = _readJsonDir(MEALS_DIR, mealTemplateSchema, 'meals');
    _mealCache = items;
    return items;
}

// Force a fresh disk read — handy in tests.
export function reset_template_cache() {
    _routineCache = null;
    _mealCache = null;
}

// ── Selectors ────────────────────────────────────────────────────
//
// `profile` looks like the merged user profile in ai-routines.js /
// ai-meal-plans.js. Missing fields are wildcards.
//
// PRODUCT RULE: nunca devolvemos null si el catálogo no está vacío.
// El selector relaja constraints en capas hasta encontrar al menos
// un candidato. En cada capa el tie-break prefiere COACH_EXCEL.
//
// Capas para routines (de más a menos estricto):
//   L1. all match (objective, gender-compat, location-compat, discipline,
//                  user_type, level, days_per_week)
//   L2. drop level
//   L3. drop user_type
//   L4. drop days_per_week (cercanía cuenta en tie-break)
//   L5. drop discipline
//   L6. drop location
//   L7. drop gender (cualquier template — incluso si gender no coincide)
//   L8. drop objective — último recurso, "el COACH_EXCEL más cercano"
//
// Mismo principio para meals con sus propias capas.
//
// TIE-BREAK dentro de cualquier capa (menor gana):
//   1. source: COACH_EXCEL (0) antes que GENERIC (1)
//   2. distancia de days_per_week / calories_target al perfil
//   3. id alfabético

const SOURCE_RANK = { COACH_EXCEL: 0, GENERIC: 1 };

function _filter(list, pred) {
    return list.filter(pred);
}

function _pickBest(pool, rankFn) {
    if (pool.length === 0) return null;
    let best = pool[0];
    let bestKey = rankFn(best);
    for (let i = 1; i < pool.length; i++) {
        const key = rankFn(pool[i]);
        for (let j = 0; j < key.length; j++) {
            if (key[j] < bestKey[j]) { best = pool[i]; bestKey = key; break; }
            if (key[j] > bestKey[j]) break;
        }
    }
    return best;
}

// Per-constraint matchers. Each takes (template, profile) and returns
// boolean. Profile field absent ⇒ true (wildcard).
const R_MATCH = {
    objective:    (t, p) => !p.objective    || t.objective === p.objective,
    gender:       (t, p) => !p.gender       || !t.gender || t.gender === p.gender,
    location:     (t, p) => !p.location     || t.location === p.location || t.location === 'BOTH',
    discipline:   (t, p) => !p.discipline   || t.discipline === p.discipline,
    user_type:    (t, p) => !p.user_type    || t.user_type === p.user_type,
    level:        (t, p) => !p.level        || t.level === p.level,
    days_per_week:(t, p) => !p.days_per_week|| t.days_per_week === p.days_per_week,
};

function _routineRankKey(t, profile) {
    const dpw = profile?.days_per_week;
    return [
        SOURCE_RANK[t.source] ?? 99,
        dpw == null ? 0 : Math.abs(t.days_per_week - dpw),
        t.id,
    ];
}

export function select_routine_template(profile = {}) {
    const all = load_all_routine_templates();
    if (all.length === 0) return null;

    // Each layer = list of constraint keys that MUST match. Drop them
    // one at a time from the tail. Last layer = no constraints — picks
    // by source/days/id from the entire catalog.
    const layers = [
        ['objective', 'gender', 'location', 'discipline', 'user_type', 'level', 'days_per_week'],
        ['objective', 'gender', 'location', 'discipline', 'user_type', 'days_per_week'], // drop level
        ['objective', 'gender', 'location', 'discipline', 'days_per_week'],               // drop user_type
        ['objective', 'gender', 'location', 'discipline'],                                // drop days_per_week
        ['objective', 'gender', 'location'],                                              // drop discipline
        ['objective', 'gender'],                                                          // drop location
        ['objective'],                                                                    // drop gender
        [],                                                                               // drop objective — last resort
    ];

    for (const keys of layers) {
        const pool = _filter(all, (t) => keys.every((k) => R_MATCH[k](t, profile)));
        const best = _pickBest(pool, (t) => _routineRankKey(t, profile));
        if (best) return best;
    }
    return null; // unreachable when catalog non-empty (last layer is unconditional)
}

const M_MATCH = {
    objective:    (t, p) => !p.objective    || t.objective === p.objective,
    gender:       (t, p) => !p.gender       || !t.gender || t.gender === p.gender,
    country:      (t, p) => !p.country      || t.country === String(p.country).toUpperCase(),
    meals_per_day:(t, p) => !p.meals_per_day|| t.meals_per_day === p.meals_per_day,
};

function _mealRankKey(t, profile) {
    const cal = profile?.calories_target;
    const mpd = profile?.meals_per_day;
    return [
        SOURCE_RANK[t.source] ?? 99,
        cal == null ? 0 : Math.abs(t.calories_target_kcal - cal),
        mpd == null ? 0 : Math.abs(t.meals_per_day - mpd),
        t.id,
    ];
}

export function select_meal_template(profile = {}) {
    const all = load_all_meal_templates();
    if (all.length === 0) return null;

    const layers = [
        ['objective', 'gender', 'country', 'meals_per_day'],
        ['objective', 'gender', 'country'],   // drop meals_per_day (cercanía cuenta en tie-break)
        ['objective', 'gender'],              // drop country
        ['gender'],                           // drop objective
        [],                                   // drop gender — last resort
    ];

    for (const keys of layers) {
        const pool = _filter(all, (t) => keys.every((k) => M_MATCH[k](t, profile)));
        const best = _pickBest(pool, (t) => _mealRankKey(t, profile));
        if (best) return best;
    }
    return null; // unreachable when catalog non-empty
}
