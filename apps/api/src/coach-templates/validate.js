// ─────────────────────────────────────────────────────────────────
// Standalone validation runner for coach-templates.
// Run with:  node src/coach-templates/validate.js
//
//   1. Carga + valida zod de los templates en disco.
//   2. Verifica límites del catálogo (≤4 routines, ≤3 meals).
//   3. Ejercita los selectores con perfiles realistas.
//   4. Verifica regla de producto: nunca null si el catálogo no está vacío.
//   5. Verifica priorización COACH_EXCEL > GENERIC.
//   6. Verifica casos que ANTES devolvían null y AHORA tienen respuesta.
// ─────────────────────────────────────────────────────────────────

import {
    load_all_routine_templates,
    load_all_meal_templates,
    select_routine_template,
    select_meal_template,
    reset_template_cache,
} from './loader.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(label, cond, info) {
    if (cond) {
        pass++;
        console.log(`  ✓ ${label}`);
    } else {
        fail++;
        failures.push({ label, info });
        console.log(`  ✗ ${label}${info ? `  → ${JSON.stringify(info)}` : ''}`);
    }
}

console.log('\n── 1. Carga de routines ──────────────────────────────');
reset_template_cache();
const routines = load_all_routine_templates();
check(`routines loaded (${routines.length} files)`, routines.length > 0, { count: routines.length });
check('routines.length ≤ 4', routines.length <= 4, { count: routines.length });
check('todas las ids únicas', new Set(routines.map((r) => r.id)).size === routines.length);
check('días.length === days_per_week en cada routine',
    routines.every((r) => r.days.length === r.days_per_week),
    routines.filter((r) => r.days.length !== r.days_per_week).map((r) => r.id));
check('al menos 1 routine source=COACH_EXCEL',
    routines.some((r) => r.source === 'COACH_EXCEL'));

console.log('\n── 2. Carga de meals ─────────────────────────────────');
const meals = load_all_meal_templates();
check(`meals loaded (${meals.length} files)`, meals.length > 0, { count: meals.length });
check('meals.length ≤ 3', meals.length <= 3, { count: meals.length });
check('todas las ids únicas', new Set(meals.map((m) => m.id)).size === meals.length);
check('al menos 2 meal source=COACH_EXCEL',
    meals.filter((m) => m.source === 'COACH_EXCEL').length >= 2);
check('Paty ahora gender=null (universal)',
    meals.find((m) => m.id === 'mp-paty-herrera-5m-musclegain')?.gender === null);
check('mp-cs-diet-base-unisex existe y gender=null',
    meals.find((m) => m.id === 'mp-cs-diet-base-unisex')?.gender === null);

console.log('\n── 3. Selector — routines (matches y prioridad) ─────');

{ const t = select_routine_template({
    objective: 'MUSCLE_GAIN', user_type: 'ADULT', days_per_week: 5,
    level: 'INTERMEDIATE', location: 'GYM', gender: 'MALE',
});
  check('MALE/MUSCLE_GAIN/5d/GYM → rt-hombre-real-5d-musclegain',
    t?.id === 'rt-hombre-real-5d-musclegain', { picked: t?.id }); }

{ const t = select_routine_template({
    objective: 'MUSCLE_GAIN', user_type: 'ADULT', days_per_week: 5,
    level: 'INTERMEDIATE', location: 'GYM', gender: 'FEMALE',
});
  check('FEMALE/MUSCLE_GAIN/5d/GYM → rt-mujer-gluteo-5d-musclegain',
    t?.id === 'rt-mujer-gluteo-5d-musclegain', { picked: t?.id }); }

{ const t = select_routine_template({
    objective: 'MUSCLE_GAIN', user_type: 'ADULT', days_per_week: 5,
});
  check('sin gender → COACH_EXCEL primero (no GENERIC)',
    t?.source === 'COACH_EXCEL', { picked: t?.id, source: t?.source }); }

{ const t = select_routine_template({
    objective: 'MUSCLE_GAIN', user_type: 'ADULT', days_per_week: 3, location: 'HOME',
});
  check('HOME → rt-musclegain-3d-adult-intermediate-home (único compatible)',
    t?.id === 'rt-musclegain-3d-adult-intermediate-home', { picked: t?.id }); }

{ const t = select_routine_template({
    objective: 'GENERAL_FITNESS', user_type: 'SENIOR', days_per_week: 3,
});
  check('SENIOR/GENERAL_FITNESS → rt-generalfitness-3d-senior-beginner',
    t?.id === 'rt-generalfitness-3d-senior-beginner', { picked: t?.id }); }

console.log('\n── 4. Selector — routines NEVER NULL (antes null) ───');

// Antes null: STRENGTH/KID — ahora cae al COACH_EXCEL más cercano
{ const t = select_routine_template({
    objective: 'STRENGTH', user_type: 'KID', days_per_week: 3,
});
  check('STRENGTH/KID → ya no null, devuelve COACH_EXCEL',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id, source: t?.source }); }

// Antes null: ENDURANCE (no existe en catálogo) — ahora COACH_EXCEL más cercano
{ const t = select_routine_template({ objective: 'ENDURANCE' });
  check('ENDURANCE (sin template) → ya no null, devuelve COACH_EXCEL',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id }); }

// Antes null: WEIGHT_LOSS routine — ahora COACH_EXCEL más cercano
{ const t = select_routine_template({ objective: 'WEIGHT_LOSS', days_per_week: 4 });
  check('WEIGHT_LOSS routine → ya no null, devuelve COACH_EXCEL',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id }); }

// Antes null: ATHLETE / FOOTBALL_US (cuando no había template ATHLETE) — ahora coach
{ const t = select_routine_template({
    objective: 'MUSCLE_GAIN', user_type: 'ATHLETE', days_per_week: 4, discipline: 'FOOTBALL_US',
});
  check('ATHLETE/FOOTBALL_US → ya no null, devuelve COACH_EXCEL',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id }); }

// Empty profile siempre algo
{ const t = select_routine_template({});
  check('perfil vacío → no null, COACH_EXCEL primero',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id }); }

// gender hard se respeta cuando hay match: MALE no debe aterrizar en mujer-gluteo si hay alternativa
{ const t = select_routine_template({
    objective: 'MUSCLE_GAIN', user_type: 'ADULT', days_per_week: 5, gender: 'MALE', location: 'GYM',
});
  check('MALE en GYM/5d → hombre-real (no mujer-gluteo)',
    t?.id === 'rt-hombre-real-5d-musclegain', { picked: t?.id }); }

console.log('\n── 5. Selector — meals (matches y prioridad) ────────');

{ const t = select_meal_template({
    objective: 'MUSCLE_GAIN', meals_per_day: 5, country: 'MX',
});
  check('MUSCLE_GAIN/5/MX → mp-paty-herrera-5m-musclegain',
    t?.id === 'mp-paty-herrera-5m-musclegain', { picked: t?.id }); }

{ const t = select_meal_template({
    objective: 'MAINTENANCE', meals_per_day: 4, country: 'MX',
});
  check('MAINTENANCE/4/MX → mp-cs-diet-base-unisex',
    t?.id === 'mp-cs-diet-base-unisex', { picked: t?.id }); }

{ const t = select_meal_template({
    objective: 'WEIGHT_LOSS', meals_per_day: 4, country: 'MX',
});
  check('WEIGHT_LOSS/4/MX → mp-weightloss-4m-mx',
    t?.id === 'mp-weightloss-4m-mx', { picked: t?.id }); }

console.log('\n── 6. Selector — meals NEVER NULL (antes null) ──────');

// Antes null: MALE pidiendo MUSCLE_GAIN (Paty era FEMALE-only). Ahora Paty unisex → match.
{ const t = select_meal_template({
    objective: 'MUSCLE_GAIN', meals_per_day: 5, country: 'MX', gender: 'MALE',
});
  check('MALE/MUSCLE_GAIN/5 → ya no null, ahora Paty (gender:null)',
    t?.id === 'mp-paty-herrera-5m-musclegain', { picked: t?.id }); }

// Antes null: MAINTENANCE — ahora cae a CS-DIET-BASE-UNISEX
{ const t = select_meal_template({
    objective: 'MAINTENANCE', meals_per_day: 3,
});
  check('MAINTENANCE → ya no null, mp-cs-diet-base-unisex',
    t?.id === 'mp-cs-diet-base-unisex', { picked: t?.id }); }

// Antes null: STRENGTH meal (no hay STRENGTH en catálogo)
{ const t = select_meal_template({
    objective: 'STRENGTH', meals_per_day: 4, country: 'MX',
});
  check('STRENGTH meal → ya no null, devuelve COACH_EXCEL más cercano',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id, source: t?.source }); }

// Antes null: ENDURANCE meal
{ const t = select_meal_template({
    objective: 'ENDURANCE', meals_per_day: 5,
});
  check('ENDURANCE meal → ya no null, devuelve COACH_EXCEL',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id }); }

// Antes null: GENERAL_FITNESS meal
{ const t = select_meal_template({
    objective: 'GENERAL_FITNESS', meals_per_day: 3,
});
  check('GENERAL_FITNESS meal → ya no null, devuelve COACH_EXCEL',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id }); }

// País raro pero objetivo conocido
{ const t = select_meal_template({
    objective: 'WEIGHT_LOSS', meals_per_day: 4, country: 'AR',
});
  check('WEIGHT_LOSS/AR → relaja country y entrega WL MX',
    t?.id === 'mp-weightloss-4m-mx', { picked: t?.id }); }

// Empty profile
{ const t = select_meal_template({});
  check('meal perfil vacío → no null, COACH_EXCEL primero',
    t !== null && t.source === 'COACH_EXCEL', { picked: t?.id }); }

// Caso sintético: MUSCLE_GAIN con calories_target cercano a Paty (2000) vs CS (2200)
{ const t = select_meal_template({
    objective: 'MUSCLE_GAIN', calories_target: 2000,
});
  check('MUSCLE_GAIN cal=2000 → Paty (más cercano por kcal)',
    t?.id === 'mp-paty-herrera-5m-musclegain', { picked: t?.id }); }

console.log('\n── Summary ──────────────────────────────────────────');
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  -', f.label, f.info ?? '');
    process.exit(1);
}
process.exit(0);
