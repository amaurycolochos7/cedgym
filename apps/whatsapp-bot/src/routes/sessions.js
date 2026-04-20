import { Router } from 'express';
import QRCode from 'qrcode';

const router = Router();

// GET /sessions — lista todas las sesiones activas en memoria
router.get('/', (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    res.json(sessionManager.getAllSessions());
});

// GET /sessions/:workspaceId/status
router.get('/:workspaceId/status', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const prisma = req.app.get('prisma');
    const { workspaceId } = req.params;

    const session = sessionManager.getSession(workspaceId);

    // Fallback: lee de DB si no hay sesión viva en memoria (útil justo después
    // de un restart antes de que el self-heal rehidrate).
    if (!session) {
        try {
            const dbSession = await prisma.whatsAppSession.findUnique({
                where: { workspace_id: workspaceId }
            });
            if (!dbSession) {
                return res.json({ exists: false, isConnected: false, qr: null });
            }
            return res.json({
                exists: true,
                isConnected: dbSession.is_connected,
                initializing: dbSession.initializing,
                phoneNumber: dbSession.phone_number,
                qr: !!dbSession.qr_data,
                lastReadyAt: dbSession.last_ready_at,
                fromDb: true,
            });
        } catch (err) {
            return res.json({ exists: false, isConnected: false, qr: null });
        }
    }

    res.json({
        exists: true,
        isConnected: session.isConnected,
        initializing: session.initializing,
        phoneNumber: session.phoneNumber,
        pushname: session.pushname || null,
        platform: session.platform || 'Web',
        qr: session.lastQr ? true : false, // Don't send raw QR string
        lastReadyAt: session.lastReadyAt || null,
        lastError: session.lastError || null,
    });
});

// GET /sessions/:workspaceId/qr  — QR como dataURL PNG
router.get('/:workspaceId/qr', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const prisma = req.app.get('prisma');
    const { workspaceId } = req.params;

    const session = sessionManager.getSession(workspaceId);

    // Prefer in-memory QR (latest), fall back to persisted QR from DB.
    let qrString = session?.lastQr || null;
    if (!qrString) {
        try {
            const dbSession = await prisma.whatsAppSession.findUnique({
                where: { workspace_id: workspaceId }
            });
            qrString = dbSession?.qr_data || null;
        } catch { /* ignore */ }
    }

    if (!qrString) {
        return res.json({ qr: null, isConnected: session?.isConnected || false });
    }

    try {
        const qrImage = await QRCode.toDataURL(qrString, { width: 300, margin: 2 });
        res.json({ qr: qrImage, isConnected: false });
    } catch (err) {
        res.status(500).json({ error: 'Error generating QR' });
    }
});

// POST /sessions/:workspaceId/start — fire-and-forget
router.post('/:workspaceId/start', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { workspaceId } = req.params;
    try {
        // Fire-and-forget: inicializamos en background, respondemos ya.
        sessionManager.startSession(workspaceId).catch(err => {
            console.error(`❌ Background session start failed for ${workspaceId}:`, err.message);
        });
        res.json({ success: true, message: 'Session starting...' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /sessions/:workspaceId/logout — logout real de WhatsApp
router.post('/:workspaceId/logout', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { workspaceId } = req.params;
    try {
        const loggedOut = await sessionManager.logoutSession(workspaceId);
        res.json({ success: loggedOut });
    } catch (err) {
        console.error(`❌ Logout failed for ${workspaceId}:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
