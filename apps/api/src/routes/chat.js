// ─────────────────────────────────────────────────────────────────
// Chat REST endpoints.
//
// All routes are JWT-authenticated. The realtime layer (Socket.IO)
// lives in lib/socket.js; this file provides the canonical REST API
// used by the web app for listing / paginating / sending messages.
//
// Endpoints:
//   GET    /chat/conversations
//   POST   /chat/conversations
//   GET    /chat/conversations/:id/messages
//   POST   /chat/conversations/:id/messages
//   PATCH  /chat/conversations/:id/read
// ─────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { err } from '../lib/errors.js';
import { initSocketIO, emitMessageNew, emitMessageRead } from '../lib/socket.js';

const newConvoBody = z.object({ user_id: z.string().cuid() });
const newMessageBody = z.object({
    body: z.string().trim().min(1).max(4000),
    attachment_url: z.string().url().optional(),
});
const listMessagesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

// Ensure a user is a participant in a conversation.
async function getConvOrForbid(prisma, conversationId, userId) {
    const convo = await prisma.conversation.findUnique({
        where: { id: conversationId },
    });
    if (!convo) throw err('NOT_FOUND', 'Conversación no encontrada', 404);
    if (!convo.user_ids.includes(userId)) {
        throw err('FORBIDDEN', 'No perteneces a esta conversación', 403);
    }
    return convo;
}

export default async function chatRoutes(fastify) {
    const { prisma } = fastify;

    // Boot Socket.IO on the same HTTP server. idempotent.
    await initSocketIO(fastify);

    // ── GET /chat/conversations ──────────────────────────────
    fastify.get(
        '/chat/conversations',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;

            // Prisma doesn't have an efficient "contains userId in array"
            // without a raw query on Postgres; we rely on `has` filter.
            const conversations = await prisma.conversation.findMany({
                where: { user_ids: { has: userId } },
                orderBy: { last_message_at: 'desc' },
                take: 100,
            });

            // Fetch the last message + unread count per conversation.
            // Done in parallel but bounded to 100 to keep the N+1 sane.
            const enriched = await Promise.all(
                conversations.map(async (c) => {
                    const [lastMessage, unread, counterparties] = await Promise.all([
                        prisma.message.findFirst({
                            where: { conversation_id: c.id },
                            orderBy: { created_at: 'desc' },
                        }),
                        prisma.message.count({
                            where: {
                                conversation_id: c.id,
                                read_at: null,
                                sender_id: { not: userId },
                            },
                        }),
                        prisma.user.findMany({
                            where: {
                                id: { in: c.user_ids.filter((id) => id !== userId) },
                            },
                            select: {
                                id: true,
                                name: true,
                                full_name: true,
                                avatar_url: true,
                                role: true,
                            },
                        }),
                    ]);
                    return {
                        ...c,
                        last_message: lastMessage,
                        unread_count: unread,
                        participants: counterparties,
                    };
                })
            );

            return { conversations: enriched };
        }
    );

    // ── POST /chat/conversations ─────────────────────────────
    // Creates or returns an existing 1-on-1 conversation between the
    // caller and `user_id`. We use `has` filter twice to locate any
    // existing conversation that contains both users.
    fastify.post(
        '/chat/conversations',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = newConvoBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);

            const userId = req.user.sub || req.user.id;
            const other = parsed.data.user_id;
            if (userId === other) throw err('SELF_CHAT', 'No puedes abrir un chat contigo mismo', 400);

            const target = await prisma.user.findUnique({ where: { id: other } });
            if (!target) throw err('USER_NOT_FOUND', 'Usuario no encontrado', 404);

            // Look for an existing 1:1 that contains both users and no
            // one else. We fetch up to a few matches then filter in JS
            // because Postgres array-length comparisons through Prisma
            // aren't a first-class feature.
            const candidates = await prisma.conversation.findMany({
                where: {
                    AND: [
                        { user_ids: { has: userId } },
                        { user_ids: { has: other } },
                    ],
                },
                take: 10,
            });
            const existing = candidates.find(
                (c) => c.user_ids.length === 2
            );
            if (existing) return { conversation: existing };

            const created = await prisma.conversation.create({
                data: {
                    workspace_id: target.workspace_id,
                    user_ids: [userId, other],
                },
            });
            return { conversation: created };
        }
    );

    // ── GET /chat/conversations/:id/messages ─────────────────
    fastify.get(
        '/chat/conversations/:id/messages',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = listMessagesQuery.safeParse(req.query || {});
            if (!parsed.success) throw err('BAD_QUERY', parsed.error.message, 400);
            const { page, limit } = parsed.data;
            const userId = req.user.sub || req.user.id;
            const convo = await getConvOrForbid(prisma, req.params.id, userId);

            const [total, rows] = await Promise.all([
                prisma.message.count({ where: { conversation_id: convo.id } }),
                prisma.message.findMany({
                    where: { conversation_id: convo.id },
                    orderBy: { created_at: 'desc' },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
            ]);

            // UI wants oldest-first within a page; invert here.
            return {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit)),
                messages: rows.reverse(),
            };
        }
    );

    // ── POST /chat/conversations/:id/messages ────────────────
    fastify.post(
        '/chat/conversations/:id/messages',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const parsed = newMessageBody.safeParse(req.body);
            if (!parsed.success) throw err('BAD_BODY', parsed.error.message, 400);
            const userId = req.user.sub || req.user.id;
            const convo = await getConvOrForbid(prisma, req.params.id, userId);

            const message = await prisma.message.create({
                data: {
                    conversation_id: convo.id,
                    sender_id: userId,
                    body: parsed.data.body,
                    attachment_url: parsed.data.attachment_url || null,
                },
            });
            await prisma.conversation.update({
                where: { id: convo.id },
                data: { last_message_at: message.created_at },
            });

            // Fan-out to Socket.IO rooms. Safe no-op if socket layer
            // isn't installed.
            emitMessageNew(convo, message);

            return { message };
        }
    );

    // ── PATCH /chat/conversations/:id/read ───────────────────
    // Marks every unread message NOT sent by the caller as read.
    fastify.patch(
        '/chat/conversations/:id/read',
        { preHandler: [fastify.authenticate] },
        async (req) => {
            const userId = req.user.sub || req.user.id;
            const convo = await getConvOrForbid(prisma, req.params.id, userId);

            const now = new Date();
            const { count } = await prisma.message.updateMany({
                where: {
                    conversation_id: convo.id,
                    read_at: null,
                    sender_id: { not: userId },
                },
                data: { read_at: now },
            });

            emitMessageRead(convo, userId, now);
            return { marked_read: count };
        }
    );
}
