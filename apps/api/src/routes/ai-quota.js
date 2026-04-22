// ─────────────────────────────────────────────────────────────────
// AI quota — exposes remaining AI-generation slots to the portal.
//
//   GET /ai/quota/me  → { plan, routine: { used, limit, ... }, ... }
//
// The portal uses this to show "Te quedan X rutinas este periodo"
// and to swap the generator CTA for an upgrade CTA when the plan
// doesn't include the feature.
// ─────────────────────────────────────────────────────────────────

import { getUserAIQuota } from '../lib/ai-quota.js';

export const autoPrefix = '/ai/quota';

export default async function aiQuotaRoutes(fastify) {
    const { prisma } = fastify;

    fastify.get(
        '/me',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const quota = await getUserAIQuota(prisma, userId);
            return quota;
        }
    );
}
