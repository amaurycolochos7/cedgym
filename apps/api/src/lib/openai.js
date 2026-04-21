// ─────────────────────────────────────────────────────────────────
// OpenAI client wrapper.
//
// - Exposes a singleton `openai` client configured from env.
// - `generateJSON({ system, user, schema?, kind, workspace_id, user_id? })`
//   calls chat.completions with response_format=json_object, records
//   telemetry into the `ai_generations` table, optionally validates
//   the parsed JSON with a Zod schema, and returns the parsed data.
//
// Notes:
//   - We deliberately keep this file framework-agnostic (no fastify
//     imports) so it can be called from routes, workers, or seeds.
//   - A Prisma client instance must be passed in — we don't import
//     a global one to avoid coupling this helper to startup order.
// ─────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import { err } from './errors.js';

// Typical gpt-4o-mini pricing (USD per 1M tokens) as of 2025-Q1.
// Override with env if pricing changes without a code deploy.
const PRICE_PER_1M_INPUT_USD = Number(process.env.OPENAI_PRICE_INPUT_PER_1M || 0.15);
const PRICE_PER_1M_OUTPUT_USD = Number(process.env.OPENAI_PRICE_OUTPUT_PER_1M || 0.6);

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Lazy singleton. The OpenAI SDK THROWS in the constructor if apiKey is
// missing/empty, which would crash the whole API at boot when the env
// var isn't set. Defer instantiation to first use: `getOpenAI()`.
let _openai = null;
export function getOpenAI() {
    if (_openai) return _openai;
    if (!process.env.OPENAI_API_KEY) {
        throw err('AI_MISCONFIGURED', 'OPENAI_API_KEY is not set', 500);
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openai;
}
// Back-compat proxy so `import openai from '...'` still works for callers
// that only use it transitively — errors surface when any method is hit.
export const openai = new Proxy({}, {
    get(_t, prop) {
        const real = getOpenAI();
        const v = real[prop];
        return typeof v === 'function' ? v.bind(real) : v;
    },
});

export function computeCostUsd(inputTokens, outputTokens) {
    const input = (inputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD;
    const output = (outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD;
    // Round to 6 decimals to match the Decimal(10,6) column.
    return Math.round((input + output) * 1e6) / 1e6;
}

/**
 * generateJSON
 *
 * @param {object} params
 * @param {import('@prisma/client').PrismaClient} params.prisma
 * @param {string} params.system           System prompt
 * @param {string} params.user             User prompt
 * @param {import('zod').ZodSchema=} params.schema  Optional Zod validator
 * @param {'ROUTINE'|'MEAL_PLAN'|'REGENERATION'} params.kind
 * @param {string} params.workspace_id
 * @param {string|null=} params.user_id
 * @param {number=} params.temperature
 * @returns {Promise<{ data:any, aiGenerationId:string, costUsd:number, durationMs:number }>}
 */
export async function generateJSON({
    prisma,
    system,
    user,
    schema,
    kind,
    workspace_id,
    user_id = null,
    temperature = 0.7,
}) {
    if (!prisma) throw err('AI_MISCONFIGURED', 'prisma instance is required', 500);
    if (!process.env.OPENAI_API_KEY) {
        throw err('AI_MISCONFIGURED', 'OPENAI_API_KEY is not set', 500);
    }

    const startedAt = Date.now();
    const promptSnapshot = JSON.stringify({ system, user });

    let completion;
    try {
        completion = await getOpenAI().chat.completions.create({
            model: OPENAI_MODEL,
            temperature,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
        });
    } catch (e) {
        const durationMs = Date.now() - startedAt;
        await prisma.aIGeneration.create({
            data: {
                workspace_id,
                user_id,
                kind,
                model: OPENAI_MODEL,
                input_tokens: 0,
                output_tokens: 0,
                cost_usd: 0,
                prompt_snapshot: promptSnapshot,
                response_raw: '',
                success: false,
                error_message: e?.message || String(e),
                duration_ms: durationMs,
            },
        });
        throw err('AI_UPSTREAM_ERROR', `OpenAI request failed: ${e?.message || e}`, 502);
    }

    const durationMs = Date.now() - startedAt;
    const rawContent = completion?.choices?.[0]?.message?.content || '';
    const usage = completion?.usage || {};
    const inputTokens = Number(usage.prompt_tokens || 0);
    const outputTokens = Number(usage.completion_tokens || 0);
    const costUsd = computeCostUsd(inputTokens, outputTokens);

    // Parse JSON. With response_format=json_object the model is
    // forced to return valid JSON, but we still guard defensively.
    let data;
    try {
        data = JSON.parse(rawContent);
    } catch (e) {
        const row = await prisma.aIGeneration.create({
            data: {
                workspace_id,
                user_id,
                kind,
                model: OPENAI_MODEL,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cost_usd: costUsd,
                prompt_snapshot: promptSnapshot,
                response_raw: rawContent,
                success: false,
                error_message: `JSON parse error: ${e?.message || e}`,
                duration_ms: durationMs,
            },
        });
        throw err('AI_BAD_JSON', 'Model returned invalid JSON', 502);
    }

    // Validate schema if provided.
    if (schema) {
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
            await prisma.aIGeneration.create({
                data: {
                    workspace_id,
                    user_id,
                    kind,
                    model: OPENAI_MODEL,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    cost_usd: costUsd,
                    prompt_snapshot: promptSnapshot,
                    response_raw: rawContent,
                    success: false,
                    error_message: `Schema validation failed: ${parsed.error.message}`,
                    duration_ms: durationMs,
                },
            });
            throw err('AI_SCHEMA_MISMATCH', 'Model output failed schema validation', 502);
        }
        data = parsed.data;
    }

    const row = await prisma.aIGeneration.create({
        data: {
            workspace_id,
            user_id,
            kind,
            model: OPENAI_MODEL,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_usd: costUsd,
            prompt_snapshot: promptSnapshot,
            response_raw: rawContent,
            success: true,
            duration_ms: durationMs,
        },
    });

    return { data, aiGenerationId: row.id, costUsd, durationMs };
}

export default openai;
