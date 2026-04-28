// ─────────────────────────────────────────────────────────────────
// Admin: workspace info + integration health.
// ─────────────────────────────────────────────────────────────────
import { assertWorkspaceAccess } from '../lib/tenant-guard.js';

export default async function adminWorkspaceRoutes(fastify) {
  const guard = { preHandler: [fastify.authenticate, fastify.requireRole('ADMIN', 'SUPERADMIN')] };

  fastify.get('/admin/workspace', guard, async (req) => {
    const workspaceId = assertWorkspaceAccess(req);
    const ws = await fastify.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { whatsapp_sessions: { take: 1 } },
    });

    const botConnected = ws?.whatsapp_sessions?.[0]?.is_connected ?? false;
    const mpOk = !!process.env.MP_ACCESS_TOKEN && !process.env.MP_ACCESS_TOKEN.includes('TEST-0000');
    const minioOk = !!process.env.MINIO_ENDPOINT;

    return {
      id: ws?.id,
      slug: ws?.slug,
      name: ws?.name,
      plan: ws?.plan,
      logo_url: ws?.logo_url,
      whatsapp_connected: botConnected,
      mp_ok: mpOk,
      minio_ok: minioOk,
    };
  });

  fastify.patch('/admin/workspace', guard, async (req) => {
    const workspaceId = assertWorkspaceAccess(req);
    const { name, logo_url } = req.body ?? {};
    const updated = await fastify.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(name && { name }),
        ...(logo_url !== undefined && { logo_url }),
      },
    });
    return { id: updated.id, success: true };
  });
}
