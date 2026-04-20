// ─────────────────────────────────────────────────────────────
// Typed error helpers.
//
// Two usage patterns are supported — pick whichever suits the
// route style:
//
//   1. Throw-style (propagates to the global error handler):
//        throw err('PLAN_INVALID', 'Plan no existe', 400);
//
//   2. Reply-style (return a JSON payload directly):
//        return reply.status(400).send(errPayload('OTP_EXPIRED', '...'));
//
// Both shapes serialize to `{ error: { code, message } }` so the
// frontend has a single parser. The global error hook in index.js
// maps thrown `err()` instances to the same shape.
// ─────────────────────────────────────────────────────────────

export function err(code, msg, statusCode = 400) {
    const e = new Error(msg);
    e.code = code;
    e.statusCode = statusCode;
    e.expose = true;
    return e;
}

export function errPayload(code, message, statusCode = 400) {
    return {
        error: { code, message },
        statusCode,
    };
}

export default err;
