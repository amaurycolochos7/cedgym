import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resuelve la ruta absoluta para almacenar sesiones de WhatsApp.
 * - En Docker: usa WWEBJS_DATA_PATH (ej. /app/data/wwebjs_auth)
 * - Local: resuelve a apps/whatsapp-bot/.wwebjs_auth
 */
function sessionsPath() {
    return process.env.WWEBJS_DATA_PATH
        ? process.env.WWEBJS_DATA_PATH
        : path.resolve(__dirname, '..', '.wwebjs_auth');
}

/** Timeout helper: rechaza después de ms milisegundos */
function withTimeout(promise, ms, label = 'Operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
    ]);
}

class WhatsAppSession extends EventEmitter {
    constructor(workspaceId, prisma) {
        super();
        this.workspaceId = workspaceId;
        this.prisma = prisma;
        this.client = null;
        this.initializing = false; // mutex para evitar doble init
        this.isConnected = false;
        this.lastQr = null;
        this.phoneNumber = null;
        this._heartbeatInterval = null;
    }

    async initialize() {
        // Mutex: si ya está inicializando o ya conectado, no hacer nada
        if (this.initializing) {
            console.log(`⚠️ Session ${this.workspaceId} already initializing, skipping.`);
            return;
        }
        if (this.client && this.isConnected) {
            console.log(`⚠️ Session ${this.workspaceId} already connected, skipping.`);
            return;
        }

        this.initializing = true;
        this.lastError = null;
        console.log(`🔧 Initializing WhatsApp client for workspace ${this.workspaceId}...`);

        // Detect Chrome binary
        let chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || null;

        if (chromePath) {
            console.log(`🔍 Using env Chrome path: ${chromePath}`);
            try {
                fs.accessSync(chromePath, fs.constants.X_OK);
                console.log(`✅ Chrome binary exists and is executable`);
            } catch (e) {
                console.warn(`⚠️ Env Chrome path not found: ${chromePath}, letting Puppeteer use its default`);
                chromePath = null;
            }
        }

        if (!chromePath) {
            // Check system paths as fallback
            const systemPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
            for (const sp of systemPaths) {
                try {
                    fs.accessSync(sp, fs.constants.X_OK);
                    console.log(`✅ Found system Chrome at: ${sp}`);
                    chromePath = sp;
                    break;
                } catch { /* skip */ }
            }
            if (!chromePath) {
                console.log(`📦 No system Chrome found, Puppeteer will use its bundled Chrome`);
            }
        }

        const dataPath = sessionsPath();
        console.log(`📂 Session data path: ${dataPath}`);

        this._qrCount = 0; // Track QR regeneration attempts

        // Session data is preserved for persistence across deploys.
        // The Docker named volume (whatsapp_data) survives container rebuilds.
        // Cleanup only happens on explicit auth_failure events (see below).
        const sessionDir = path.join(dataPath, `session-${this.workspaceId}`);
        if (fs.existsSync(sessionDir)) {
            console.log(`📂 Found existing session data at: ${sessionDir} — reusing for persistence`);
            // Clean up stale Chromium lock files from previous container runs.
            // These prevent Puppeteer from launching after container restarts.
            // NOTE: SingletonLock is a symlink whose target is "hostname-pid"; when the
            // previous container dies the target becomes unreachable and fs.existsSync()
            // returns false for the broken symlink. We use fs.lstatSync (which does NOT
            // follow symlinks) + unconditional unlink to cover both cases.
            const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
            for (const lockFile of lockFiles) {
                const lockPath = path.join(sessionDir, lockFile);
                try {
                    fs.lstatSync(lockPath); // throws if file/symlink is absent
                    fs.unlinkSync(lockPath);
                    console.log(`🔓 Removed stale Chrome lock: ${lockFile}`);
                } catch (e) {
                    if (e.code !== 'ENOENT') {
                        console.warn(`⚠️ Could not remove lock file ${lockFile}: ${e.message}`);
                    }
                }
            }
        } else {
            console.log(`📂 No existing session data — will need QR scan`);
        }

        try {
            console.log(`📱 Step 1: Creating Client instance...`);
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: String(this.workspaceId),
                    dataPath: dataPath,
                }),

                // Pin to a specific, known-working WhatsApp Web version from the
                // wppconnect-team/wa-version repo. This prevents WhatsApp's server-side
                // A/B testing from serving an incompatible version that breaks authentication.
                // If QR pairing stops working in the future, update this version string.
                webVersionCache: {
                    type: 'remote',
                    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1033759004-alpha.html',
                },

                // 60s para auth en local; 120s para Docker (vía env).
                authTimeoutMs: Number(process.env.WWEBJS_AUTH_TIMEOUT_MS || 60000),
                qrMaxRetries: 50, // ≈25 min de regeneración continua antes de cortar
                // Bypass CSP to allow script injection
                bypassCSP: true,
                // CRITICAL: Override the outdated Chrome/101 default user agent.
                // WhatsApp Web refuses to serve its JS app to old Chrome versions (serves 1365-byte empty shell instead).
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

                puppeteer: {
                    headless: 'new', // CRITICAL: 'new' mode is undetectable; old 'true' mode is blocked by WhatsApp
                    ...(chromePath ? { executablePath: chromePath } : {}),
                    timeout: Number(process.env.WWEBJS_LAUNCH_TIMEOUT_MS || 60000),
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-extensions',
                        '--disable-software-rasterizer',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                    ],
                },
            });
            console.log(`✅ Step 1 done: Client created`);

            // Sanity check
            if (!this.client || typeof this.client.on !== 'function') {
                throw new Error('Client instance is broken (missing .on)');
            }

            // QR Event - track regeneration count, bail out after N unscanned QRs.
            this.client.on('qr', (qr) => {
                this._qrCount++;
                console.log(`📱 QR generated for workspace ${this.workspaceId} (attempt ${this._qrCount})`);
                this.lastQr = qr;
                this.isConnected = false;
                this.emit('qr', qr);

                if (this._qrCount >= 50) {
                    console.error(`❌ Too many QR regenerations (${this._qrCount}) for ${this.workspaceId} — stopping to prevent runaway loop`);
                    this.lastError = 'Sin actividad durante 25 minutos. Pulsa "Generar QR" para comenzar de nuevo.';
                    this.client.destroy().catch(() => { /* ignore */ });
                    this.emit('disconnected', 'qr_exhausted');
                }
            });

            // Authenticated
            this.client.on('authenticated', () => {
                console.log(`🔑 Authenticated: workspace ${this.workspaceId}`);
                this.lastQr = null;
            });

            // Ready
            this.client.on('ready', () => {
                console.log(`✅ Ready: workspace ${this.workspaceId}`);
                this.isConnected = true;
                this.lastReadyAt = new Date();
                this.lastQr = null;
                const info = this.client.info;
                this.phoneNumber = info?.wid?.user || null;
                this.pushname = info?.pushname || null;
                this.platform = info?.platform || 'Web';
                console.log(`📱 Connected as: ${this.pushname} (${this.phoneNumber}) on ${this.platform}`);
                this.emit('ready');

                // Start heartbeat
                this._startHeartbeat();
            });

            // Disconnected
            this.client.on('disconnected', (reason) => {
                console.log(`🔴 Disconnected: workspace ${this.workspaceId} - ${reason}`);
                this.isConnected = false;
                this._stopHeartbeat();
                this.emit('disconnected', reason);

                // Auto-restart if disconnected due to QR timeout
                if (reason === 'Max qrcode retries reached') {
                    console.log(`🔄 QR timeout for ${this.workspaceId}, emitting qr_timeout for auto-restart...`);
                    this.emit('qr_timeout');
                }
            });

            // Auth failure - log detailed info and clean up stale session data
            this.client.on('auth_failure', async (msg) => {
                this.isConnected = false;
                this.lastError = `Error de autenticación: ${msg}. Intenta cerrar sesión y vincular de nuevo.`;
                console.error(`❌ Auth failure for workspace ${this.workspaceId}:`, msg);
                console.error(`   QR attempts before failure: ${this._qrCount}`);

                // Clean up stale session data to allow fresh pairing
                try {
                    const sessionDir = path.join(dataPath, `session-${this.workspaceId}`);
                    if (fs.existsSync(sessionDir)) {
                        console.log(`🗑️ Cleaning stale session data: ${sessionDir}`);
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }
                } catch (cleanErr) {
                    console.error(`⚠️ Could not clean session data:`, cleanErr.message);
                }

                this.emit('disconnected', 'auth_failure');
            });

            console.log(`🚀 Step 2: Launching Puppeteer for workspace ${this.workspaceId}...`);

            // Initialize with a 120-second timeout that actually cancels the hung call
            await Promise.race([
                this.client.initialize(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('client.initialize() timed out after 120s')), 120000)
                ),
            ]);
            console.log(`✅ Step 2 done: Client initialized for workspace ${this.workspaceId}`);

        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err || 'Unknown error');
            const errStack = err instanceof Error ? err.stack : new Error().stack;
            console.error(`❌ Error initializing client for ${this.workspaceId}:`, errMsg);
            console.error('Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err || {}), 2));
            console.error(errStack);
            this.isConnected = false;
            this.lastError = errMsg;

        } finally {
            this.initializing = false; // siempre liberar el mutex
        }
    }

    async sendMessage(phone, message) {
        if (!this.isConnected || !this.client) {
            throw new Error(`Session ${this.workspaceId} not connected`);
        }

        // Format phone: ensure it has country code and @c.us
        const formatted = this._formatPhone(phone);
        console.log(`📤 Sending message to ${formatted}...`);

        try {
            // Use getNumberId to resolve the WhatsApp ID properly (fixes "No LID" error)
            const numberId = await this.client.getNumberId(formatted.replace('@c.us', ''));
            if (numberId) {
                console.log(`✅ Number resolved: ${numberId._serialized}`);
                const result = await this.client.sendMessage(numberId._serialized, message);
                return { success: true, messageId: result.id._serialized };
            } else {
                console.warn(`⚠️ Number ${formatted} is not registered on WhatsApp`);
                throw new Error(`El número ${phone} no está registrado en WhatsApp`);
            }
        } catch (err) {
            // If getNumberId fails, try direct send as fallback
            if (err.message && err.message.includes('no está registrado')) {
                throw err;
            }
            console.warn(`⚠️ getNumberId failed, trying direct send: ${err.message}`);
            try {
                const result = await this.client.sendMessage(formatted, message);
                return { success: true, messageId: result.id._serialized };
            } catch (directErr) {
                console.error(`❌ Direct send also failed: ${directErr.message}`);
                throw directErr;
            }
        }
    }

    async sendMedia(phone, message, mediaUrl) {
        if (!this.isConnected || !this.client) {
            throw new Error(`Session ${this.workspaceId} not connected`);
        }

        const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
        const formatted = this._formatPhone(phone);
        const result = await this.client.sendMessage(formatted, media, { caption: message || '' });
        return { success: true, messageId: result.id._serialized };
    }

    async sendDocument(phone, message, base64Data, filename, mimetype) {
        if (!this.isConnected || !this.client) {
            throw new Error(`Session ${this.workspaceId} not connected`);
        }

        const media = new MessageMedia(
            mimetype || 'application/pdf',
            base64Data,
            filename || 'document.pdf'
        );
        const formatted = this._formatPhone(phone);
        console.log(`Sending document "${filename}" to ${formatted}...`);

        try {
            const numberId = await this.client.getNumberId(formatted.replace('@c.us', ''));
            const chatId = numberId ? numberId._serialized : formatted;
            const result = await this.client.sendMessage(chatId, media, {
                caption: message || '',
                sendMediaAsDocument: true,
            });
            return { success: true, messageId: result.id._serialized };
        } catch (err) {
            console.error(`Failed to send document: ${err.message}`);
            throw err;
        }
    }

    /**
     * Cierra sesión de WhatsApp de forma real: envía señal de logout
     * al servidor de WA (desvincula el dispositivo) y luego destruye el cliente.
     * Esto borra la autenticación local para que no se reconecte automáticamente.
     */
    async logout() {
        this._stopHeartbeat();
        try {
            this.isConnected = false;
            if (this.client) {
                // client.logout() sends actual logout to WhatsApp servers
                // and clears local auth data so session can't auto-restore
                console.log(`🔓 Logging out WhatsApp session for ${this.workspaceId}...`);
                await withTimeout(
                    this.client.logout(),
                    15000,
                    `client.logout(${this.workspaceId})`
                );
                console.log(`✅ WhatsApp session logged out for ${this.workspaceId}`);
            }
        } catch (err) {
            console.error(`Error logging out client ${this.workspaceId}:`, err.message);
        } finally {
            // After logout, destroy the browser instance
            try {
                if (this.client) {
                    await withTimeout(
                        this.client.destroy(),
                        10000,
                        `client.destroy(${this.workspaceId}) after logout`
                    );
                }
            } catch (destroyErr) {
                console.error(`Error destroying after logout ${this.workspaceId}:`, destroyErr.message);
            }
            this.client = null;
            this.initializing = false;
        }
    }

    /**
     * Destruye el cliente de forma segura con timeout.
     * Si client.destroy() se queda colgado (init parcial, Chrome zombie),
     * el timeout de 15s lo fuerza a continuar.
     * SIEMPRE limpia referencias en finally.
     */
    async destroy() {
        this._stopHeartbeat();
        try {
            this.isConnected = false;
            if (this.client) {
                await withTimeout(
                    this.client.destroy(),
                    15000,
                    `client.destroy(${this.workspaceId})`
                );
            }
        } catch (err) {
            console.error(`Error destroying client ${this.workspaceId}:`, err.message);
        } finally {
            // SIEMPRE limpiar aunque destroy() falle o haga timeout
            this.client = null;
            this.initializing = false;
        }
    }

    _formatPhone(phone) {
        // Remove all non-digits
        let digits = phone.replace(/\D/g, '');

        // Remove leading 0
        if (digits.startsWith('0')) digits = digits.substring(1);

        // Add Mexico country code (52) if not present
        if (!digits.startsWith('52') && digits.length === 10) {
            digits = '52' + digits;
        }

        // Remove extra 1 after 52 (52-1-xxx → 52-xxx)
        if (digits.startsWith('521') && digits.length === 13) {
            digits = '52' + digits.substring(3);
        }

        return digits + '@c.us';
    }

    _startHeartbeat() {
        this._stopHeartbeat();
        this._heartbeatInterval = setInterval(async () => {
            if (this.isConnected) {
                try {
                    await this.prisma.whatsAppSession.update({
                        where: { workspace_id: this.workspaceId },
                        data: { last_heartbeat: new Date() }
                    });
                } catch (err) {
                    // ignore
                }
            }
        }, 60000); // every minute
    }

    _stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    }
}

export default WhatsAppSession;
