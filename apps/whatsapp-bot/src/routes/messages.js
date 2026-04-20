import { Router } from 'express';

const router = Router();

// POST /send-message
// Body: { workspaceId, phone, message }
router.post('/send-message', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { workspaceId, phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'phone y message son requeridos' });
    }

    // Resolvemos la sesión del workspace (1 bot por workspace en CED-GYM)
    const session = workspaceId
        ? await sessionManager.findSessionForWorkspace(workspaceId)
        : null;

    if (!session || !session.isConnected) {
        return res.status(503).json({
            error: 'Sesión de WhatsApp no disponible',
            fallback: true
        });
    }

    try {
        const result = await session.sendMessage(phone, message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message, fallback: true });
    }
});

// POST /send-media
// Body: { workspaceId, phone, message, mediaUrl }
router.post('/send-media', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { workspaceId, phone, message, mediaUrl } = req.body;

    if (!phone || !mediaUrl) {
        return res.status(400).json({ error: 'phone y mediaUrl son requeridos' });
    }

    const session = workspaceId
        ? await sessionManager.findSessionForWorkspace(workspaceId)
        : null;

    if (!session || !session.isConnected) {
        return res.status(503).json({
            error: 'Sesión de WhatsApp no disponible',
            fallback: true
        });
    }

    try {
        const result = await session.sendMedia(phone, message || '', mediaUrl);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message, fallback: true });
    }
});

// POST /send-document
// Body: { workspaceId, phone, message, base64, filename, mimetype }
router.post('/send-document', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { workspaceId, phone, message, base64, filename, mimetype } = req.body;

    if (!phone || !base64) {
        return res.status(400).json({ error: 'phone y base64 son requeridos' });
    }

    const session = workspaceId
        ? await sessionManager.findSessionForWorkspace(workspaceId)
        : null;

    if (!session || !session.isConnected) {
        return res.status(503).json({
            error: 'Sesion de WhatsApp no disponible',
            fallback: true
        });
    }

    try {
        const result = await session.sendDocument(
            phone,
            message || '',
            base64,
            filename || 'document.pdf',
            mimetype || 'application/pdf'
        );
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message, fallback: true });
    }
});

export default router;
