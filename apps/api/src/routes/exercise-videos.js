// ─────────────────────────────────────────────────────────────────
// Exercise videos — on-demand YouTube lookup for the portal.
//
//   GET /exercises/video?q={name}   → { videoId, url, title } | 204
//
// The frontend calls this when an exercise card has no `video_url`
// (typically: routines generated BEFORE the auto-populate landed).
// Results are cached in-memory by `lib/youtube.js`.
// ─────────────────────────────────────────────────────────────────

import { searchExerciseVideo } from '../lib/youtube.js';
import { err } from '../lib/errors.js';

export const autoPrefix = '/exercises';

export default async function exerciseVideosRoutes(fastify) {
    fastify.get(
        '/video',
        {
            preHandler: [fastify.authenticate],
            // Cheap but prevents a single logged-in user from melting
            // the scraper by spamming queries.
            config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
        },
        async (req, reply) => {
            const raw = String(req.query?.q ?? '').trim();
            if (!raw || raw.length < 2) {
                throw err('BAD_QUERY', 'Parámetro `q` es requerido.', 400);
            }
            if (raw.length > 120) {
                throw err('BAD_QUERY', 'Nombre de ejercicio demasiado largo.', 400);
            }

            const result = await searchExerciseVideo(raw);
            if (!result) {
                // 204 = "we looked and didn't find anything" — cheaper
                // than a 404 for a feature that's intentionally best-effort.
                return reply.status(204).send();
            }
            return result;
        }
    );
}
