import { Router } from 'express';
import { isValidWorkspaceId, isValidPhone } from '../lib/validation.js';

const router = Router();

function rejectBadIds(req, res) {
    const { workspaceId, phone } = req.body || {};
    if (workspaceId !== undefined && !isValidWorkspaceId(workspaceId)) {
        res.status(400).json({ error: 'invalid_workspace_id' });
        return true;
    }
    if (phone !== undefined && !isValidPhone(phone)) {
        res.status(400).json({ error: 'invalid_phone' });
        return true;
    }
    return false;
}

// POST /send-message
// Body: { workspaceId, phone, message }
router.post('/send-message', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { workspaceId, phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'phone y message son requeridos' });
    }
    if (rejectBadIds(req, res)) return;

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
    if (rejectBadIds(req, res)) return;

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
    if (rejectBadIds(req, res)) return;

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
