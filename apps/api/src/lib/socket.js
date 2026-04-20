// ─────────────────────────────────────────────────────────────────
// Socket.IO integration for the internal chat.
//
// We attach Socket.IO directly to the Fastify underlying HTTP server
// (`fastify.server`) rather than use @fastify/socket.io so boot order
// stays explicit and we don't depend on another plugin.
//
// Auth: JWT is passed as `?token=<access>` on the Socket.IO handshake
// URL. We verify with `fastify.jwt.verify` (from @fastify/jwt).
//
// Rooms:
//   • `user:{userId}` — each client joins their own user room, so we
//     can target messages to "this user, across all their devices".
//   • `conv:{conversationId}` — joined on demand when the client
//     opens a conversation (server-side we also broadcast to the
//     user rooms of both participants, belt-and-suspenders).
//
// Events:
//   Client → Server:
//     message:send  { conversation_id, body, attachment_url? }
//     conv:open     { conversation_id }
//     conv:leave    { conversation_id }
//
//   Server → Client:
//     message:new   { ...message, conversation_id }
//     message:read  { conversation_id, user_id, read_at }
//     presence:online  { user_id }
//     presence:offline { user_id }
// ─────────────────────────────────────────────────────────────────

let _io = null;

// Track in-memory sockets per user so we can emit presence events
// without hammering Redis. A user is "online" when they have ≥ 1
// active socket.
const socketsByUser = new Map();

function addUserSocket(userId, socketId) {
    const set = socketsByUser.get(userId) || new Set();
    set.add(socketId);
    socketsByUser.set(userId, set);
    return set.size;
}
function removeUserSocket(userId, socketId) {
    const set = socketsByUser.get(userId);
    if (!set) return 0;
    set.delete(socketId);
    if (set.size === 0) socketsByUser.delete(userId);
    return set.size;
}
export function isUserOnline(userId) {
    return socketsByUser.has(userId);
}

export function getIO() {
    return _io;
}

// Install Socket.IO on a Fastify instance. Safe to call once at boot.
export async function initSocketIO(fastify) {
    if (_io) return _io;
    let Server;
    try {
        ({ Server } = await import('socket.io'));
    } catch (e) {
        fastify.log.warn({ err: e.message }, '[socket.io] package not installed — chat realtime disabled');
        return null;
    }

    _io = new Server(fastify.server, {
        cors: {
            origin: (origin, cb) => cb(null, true),
            credentials: true,
        },
        path: '/socket.io',
    });

    // ── Auth handshake ───────────────────────────────────────
    _io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token) return next(new Error('UNAUTHORIZED'));
            const decoded = await fastify.jwt.verify(token);
            socket.data.user = {
                id: decoded.sub || decoded.id,
                role: decoded.role,
                workspace_id: decoded.workspace_id,
            };
            return next();
        } catch (e) {
            fastify.log.debug({ err: e.message }, '[socket.io] auth failed');
            return next(new Error('UNAUTHORIZED'));
        }
    });

    _io.on('connection', (socket) => {
        const user = socket.data.user;
        if (!user?.id) return socket.disconnect(true);

        const userRoom = `user:${user.id}`;
        socket.join(userRoom);
        const count = addUserSocket(user.id, socket.id);
        if (count === 1) {
            // First socket → broadcast "online". Limit to workspace
            // (we can re-scope this once per-conversation presence
            // is needed).
            _io.emit('presence:online', { user_id: user.id });
        }

        // ── Open / leave a conversation ────────────────────
        socket.on('conv:open', (payload) => {
            const cid = payload?.conversation_id;
            if (!cid) return;
            socket.join(`conv:${cid}`);
        });
        socket.on('conv:leave', (payload) => {
            const cid = payload?.conversation_id;
            if (!cid) return;
            socket.leave(`conv:${cid}`);
        });

        // ── Send a message via socket ──────────────────────
        // Clients can POST via REST (more reliable on flaky mobile
        // networks), but a socket-send is snappier. Both paths end
        // up in `emitMessageNew` below.
        socket.on('message:send', async (payload, ack) => {
            try {
                const { prisma } = fastify;
                if (!payload?.conversation_id || !payload?.body) {
                    return ack?.({ ok: false, error: 'BAD_PAYLOAD' });
                }
                const convo = await prisma.conversation.findUnique({
                    where: { id: payload.conversation_id },
                });
                if (!convo || !convo.user_ids.includes(user.id)) {
                    return ack?.({ ok: false, error: 'FORBIDDEN' });
                }
                const msg = await prisma.message.create({
                    data: {
                        conversation_id: convo.id,
                        sender_id: user.id,
                        body: String(payload.body).slice(0, 4000),
                        attachment_url: payload.attachment_url || null,
                    },
                });
                await prisma.conversation.update({
                    where: { id: convo.id },
                    data: { last_message_at: msg.created_at },
                });
                emitMessageNew(convo, msg);
                ack?.({ ok: true, message: msg });
            } catch (e) {
                fastify.log.error({ err: e }, '[socket.io] message:send failed');
                ack?.({ ok: false, error: 'SERVER' });
            }
        });

        socket.on('disconnect', () => {
            const remaining = removeUserSocket(user.id, socket.id);
            if (remaining === 0) {
                _io.emit('presence:offline', { user_id: user.id });
            }
        });
    });

    fastify.log.info('[socket.io] initialized');
    return _io;
}

// Emit a new message to both participants + the conversation room.
// Exported so the REST route can reuse the same fan-out logic.
export function emitMessageNew(conversation, message) {
    if (!_io) return;
    const payload = { ...message, conversation_id: conversation.id };
    for (const uid of conversation.user_ids) {
        _io.to(`user:${uid}`).emit('message:new', payload);
    }
    _io.to(`conv:${conversation.id}`).emit('message:new', payload);
}

// Emit a "read" event — to the sender's user room so any open device
// sees the read-receipt in real time.
export function emitMessageRead(conversation, readerId, readAt) {
    if (!_io) return;
    const payload = {
        conversation_id: conversation.id,
        user_id: readerId,
        read_at: readAt,
    };
    for (const uid of conversation.user_ids) {
        _io.to(`user:${uid}`).emit('message:read', payload);
    }
}

export default { initSocketIO, getIO, isUserOnline, emitMessageNew, emitMessageRead };
