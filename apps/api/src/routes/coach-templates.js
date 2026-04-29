// ─────────────────────────────────────────────────────────────────
// Coach-Templates — read-only catalog endpoints.
//
// Mounted by @fastify/autoload at /coach-templates (via autoPrefix).
//
//   GET /coach-templates/routines           → all routine templates (light list)
//   GET /coach-templates/routines/select    → ?objective&user_type&days_per_week&level&location&discipline
//   GET /coach-templates/routines/:id       → full template by id
//   GET /coach-templates/meals              → all meal templates (light list)
//   GET /coach-templates/meals/select       → ?objective&meals_per_day&country&calories_target
//   GET /coach-templates/meals/:id          → full template by id
//
// FASE 1: ai-routines.js / ai-meal-plans.js are NOT touched. These
// endpoints just expose the loaded catalog so the front-end (and us,
// from cURL) can prove the layer works before we wire it into AI.
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import {
    load_all_routine_templates,
    load_all_meal_templates,
    select_routine_template,
    select_meal_template,
} from '../coach-templates/loader.js';

export const autoPrefix = '/coach-templates';

const FITNESS_GOALS = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'MAINTENANCE', 'STRENGTH', 'ENDURANCE', 'GENERAL_FITNESS'];
const USER_TYPES    = ['ADULT', 'SENIOR', 'KID', 'ATHLETE'];
const LEVELS        = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LOCATIONS     = ['GYM', 'HOME', 'BOTH'];
const DISCIPLINES   = [
    'STRENGTH', 'HYROX', 'POWERLIFTING', 'FUNCTIONAL',
    'FOOTBALL_US', 'FOOTBALL_SOCCER', 'BASKETBALL', 'TENNIS', 'BOXING', 'CROSSFIT',
];

const GENDERS = ['MALE', 'FEMALE'];

const routineSelectQuery = z.object({
    objective: z.enum(FITNESS_GOALS).optional(),
    user_type: z.enum(USER_TYPES).optional(),
    level: z.enum(LEVELS).optional(),
    days_per_week: z.coerce.number().int().min(2).max(7).optional(),
    location: z.enum(LOCATIONS).optional(),
    discipline: z.enum(DISCIPLINES).optional(),
    gender: z.enum(GENDERS).optional(),
});

const mealSelectQuery = z.object({
    objective: z.enum(FITNESS_GOALS).optional(),
    meals_per_day: z.coerce.number().int().min(3).max(5).optional(),
    country: z.string().trim().min(2).max(3).optional(),
    calories_target: z.coerce.number().int().positive().max(6000).optional(),
    gender: z.enum(GENDERS).optional(),
});

// Light projection for list endpoints — we omit `days` / `meals`
// payloads to keep the list response under a few KB.
function lightRoutine(t) {
    return {
        id: t.id,
        name: t.name,
        description: t.description,
        source: t.source,
        coach_signature: t.coach_signature,
        objective: t.objective,
        user_type: t.user_type,
        level: t.level,
        days_per_week: t.days_per_week,
        location: t.location,
        discipline: t.discipline ?? null,
        gender: t.gender ?? null,
    };
}
function lightMeal(t) {
    return {
        id: t.id,
        name: t.name,
        description: t.description,
        source: t.source,
        coach_signature: t.coach_signature,
        objective: t.objective,
        meals_per_day: t.meals_per_day,
        country: t.country,
        gender: t.gender ?? null,
        calories_target_kcal: t.calories_target_kcal,
        macros: t.macros,
        restrictions: t.restrictions,
    };
}

export default async function coachTemplatesRoutes(fastify) {
    // ── GET /coach-templates/routines ────────────────────────────
    fastify.get('/routines', async () => {
        const all = load_all_routine_templates();
        return { count: all.length, items: all.map(lightRoutine) };
    });

    // ── GET /coach-templates/routines/select ─────────────────────
    fastify.get('/routines/select', async (req) => {
        const parsed = routineSelectQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const tpl = select_routine_template(parsed.data);
        return { profile: parsed.data, template: tpl };
    });

    // ── GET /coach-templates/routines/:id ────────────────────────
    fastify.get('/routines/:id', async (req) => {
        const id = String(req.params.id || '').trim();
        const tpl = load_all_routine_templates().find((t) => t.id === id);
        if (!tpl) throw err('NOT_FOUND', `routine template "${id}" no existe`, 404);
        return { template: tpl };
    });

    // ── GET /coach-templates/meals ───────────────────────────────
    fastify.get('/meals', async () => {
        const all = load_all_meal_templates();
        return { count: all.length, items: all.map(lightMeal) };
    });

    // ── GET /coach-templates/meals/select ────────────────────────
    fastify.get('/meals/select', async (req) => {
        const parsed = mealSelectQuery.safeParse(req.query || {});
        if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
        const tpl = select_meal_template(parsed.data);
        return { profile: parsed.data, template: tpl };
    });

    // ── GET /coach-templates/meals/:id ───────────────────────────
    fastify.get('/meals/:id', async (req) => {
        const id = String(req.params.id || '').trim();
        const tpl = load_all_meal_templates().find((t) => t.id === id);
        if (!tpl) throw err('NOT_FOUND', `meal template "${id}" no existe`, 404);
        return { template: tpl };
    });
}
