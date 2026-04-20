// ─────────────────────────────────────────────────────────────
// Prisma plugin — exposes `fastify.prisma` for routes to reuse.
// The client itself lives in @cedgym/db so the bot and the API
// share the same singleton (no duplicate pool connections in dev
// when both processes import from the monorepo root).
// ─────────────────────────────────────────────────────────────
import { prisma } from '@cedgym/db';

// Minimal inline fastify-plugin shim — marks the plugin so decorators
// escape the encapsulation context. Avoids taking a dep just for this.
function asPlugin(plugin) {
    plugin[Symbol.for('skip-override')] = true;
    return plugin;
}

async function prismaPlugin(fastify) {
    fastify.decorate('prisma', prisma);
    fastify.addHook('onClose', async () => {
        await prisma.$disconnect();
    });
}

export default asPlugin(prismaPlugin);
