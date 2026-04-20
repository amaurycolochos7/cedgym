// ─────────────────────────────────────────────────────────────
// Auth plugin — depends on @fastify/jwt being registered first.
// Provides:
//   - fastify.authenticate      : preHandler that verifies JWT and
//                                 attaches `request.user`.
//   - fastify.requireRole(...r) : preHandler factory that enforces
//                                 the authed user has one of `r`.
// ─────────────────────────────────────────────────────────────
import { errPayload } from '../lib/errors.js';

function asPlugin(plugin) {
    plugin[Symbol.for('skip-override')] = true;
    return plugin;
}

async function authPlugin(fastify) {
    // JWT verification. `request.jwtVerify()` comes from @fastify/jwt and
    // throws if the token is missing/invalid — we normalize the reply so
    // clients always get our consistent error shape.
    fastify.decorate('authenticate', async function authenticate(request, reply) {
        try {
            await request.jwtVerify();
        } catch (e) {
            request.log.debug({ err: e }, '[auth] jwt verify failed');
            return reply.status(401).send(errPayload('UNAUTHORIZED', 'Token inválido o ausente', 401));
        }
    });

    // Role guard. Usage: `{ preHandler: [fastify.authenticate, fastify.requireRole('ADMIN','SUPERADMIN')] }`.
    fastify.decorate('requireRole', function requireRole(...roles) {
        return async function roleCheck(request, reply) {
            if (!request.user) {
                return reply.status(401).send(errPayload('UNAUTHORIZED', 'No autenticado', 401));
            }
            if (!roles.includes(request.user.role)) {
                return reply.status(403).send(errPayload('FORBIDDEN', 'No tienes permiso para esta acción', 403));
            }
        };
    });
}

export default asPlugin(authPlugin);
