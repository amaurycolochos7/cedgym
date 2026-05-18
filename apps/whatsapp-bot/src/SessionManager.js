import WhatsAppSession from './WhatsAppSession.js';

// ── Auto-reconnect tuning ─────────────────────────────────────────
// Razones de desconexión que SÍ se pueden recuperar sin QR nuevo: la
// sesión local (LocalAuth) sigue válida, solo se cayó la página/red.
// Si la razón cae en la lista UNRECOVERABLE el admin tiene que entrar
// al panel y reescanear — auto-restart solo gasta CPU para nada.
const UNRECOVERABLE_SUBSTRINGS = [
    'logout',                       // LOGOUT — desvinculado desde el celular
    'unpaired',                     // UNPAIRED / UNPAIRED_IDLE
    'auth_failure',                 // creds locales corruptas → LocalAuth fresh
    'qr_exhausted',                 // 50 QRs sin escanear
    'max qrcode retries',           // mismo concepto desde wweb.js
];
const MAX_RECONNECT_ATTEMPTS = 8;

class SessionManager {
    constructor(prisma) {
        this.prisma = prisma;
        this.sessions = new Map();      // workspaceId → WhatsAppSession
        this._initPromises = new Map(); // workspaceId → Promise (lock por sesión)
        this._lastErrors = new Map();   // workspaceId → last error message
        this._reconnectAttempts = new Map(); // workspaceId → intentos consecutivos
        this._reconnectTimers = new Map();   // workspaceId → setTimeout handle
    }

    // ── Auto-reconnect helpers ────────────────────────────────────
    // Devuelve true si la razón implica que se necesita QR nuevo
    // (LOGOUT, UNPAIRED, auth_failure, etc.). En esos casos no
    // intentamos reconectar — el admin tiene que entrar a escanear.
    _isUnrecoverable(reason) {
        const lc = String(reason || '').toLowerCase();
        return UNRECOVERABLE_SUBSTRINGS.some((s) => lc.includes(s));
    }

    // Programa un reintento con backoff exponencial + jitter. Si ya
    // hay un timer pendiente para ese workspace, no encolamos otro
    // (evita estampida de reintentos).
    _scheduleReconnect(workspaceId, reason) {
        if (this._reconnectTimers.has(workspaceId)) return;
        const attempt = (this._reconnectAttempts.get(workspaceId) || 0) + 1;
        this._reconnectAttempts.set(workspaceId, attempt);
        if (attempt > MAX_RECONNECT_ATTEMPTS) {
            console.error(
                `❌ Reconnect attempts exhausted for ${workspaceId} (${attempt - 1} tries). ` +
                `Admin debe entrar al panel y revisar.`,
            );
            return;
        }
        // 5s, 10s, 20s, 40s, 80s, 160s, 300s, 300s — cap a 5 min.
        const baseDelay = Math.min(5_000 * 2 ** (attempt - 1), 300_000);
        const jitter = Math.floor(Math.random() * 2_000);
        const delay = baseDelay + jitter;
        console.log(
            `🔄 Scheduling reconnect ${attempt}/${MAX_RECONNECT_ATTEMPTS} for ${workspaceId} ` +
            `in ${Math.round(delay / 1000)}s (reason: ${reason}).`,
        );
        const timer = setTimeout(async () => {
            this._reconnectTimers.delete(workspaceId);
            try {
                console.log(`🔄 Attempting reconnect ${attempt}/${MAX_RECONNECT_ATTEMPTS} for ${workspaceId}…`);
                await this.startSession(workspaceId);
                // No reseteamos attempts aquí — solo el evento 'ready'
                // confirma reconexión exitosa. Si la sesión queda en
                // initializing pero nunca ready, el siguiente disconnect
                // re-programará otro intento contando desde donde íbamos.
            } catch (err) {
                console.error(
                    `❌ Reconnect ${attempt}/${MAX_RECONNECT_ATTEMPTS} failed for ${workspaceId}:`,
                    err.message,
                );
                // El propio startSession dispara 'disconnected' si falla,
                // que reentrará en _scheduleReconnect. Como fallback por
                // si no se disparó, programamos uno más explícito.
                if (!this._reconnectTimers.has(workspaceId)) {
                    this._scheduleReconnect(workspaceId, `retry_failed:${err.message}`);
                }
            }
        }, delay);
        this._reconnectTimers.set(workspaceId, timer);
    }

    // Cancela timer + resetea contador. Se llama en éxito ('ready')
    // y en logout/stop explícitos para no resucitar sesiones que el
    // admin apagó a propósito.
    _cancelReconnect(workspaceId) {
        const timer = this._reconnectTimers.get(workspaceId);
        if (timer) {
            clearTimeout(timer);
            this._reconnectTimers.delete(workspaceId);
        }
        this._reconnectAttempts.delete(workspaceId);
    }

    /**
     * Inicia o retorna una sesión existente con lock real por workspaceId.
     * Patrón: si ya hay un Promise de init en curso, retorna ese mismo Promise
     * para que N requests concurrentes obtengan la misma sesión.
     */
    async startSession(workspaceId) {
        // Si ya hay una sesión conectada, retornar directo
        if (this.sessions.has(workspaceId)) {
            const existing = this.sessions.get(workspaceId);
            if (existing.isConnected) {
                console.log(`ℹ️ Session ${workspaceId} already connected, reusing.`);
                return existing;
            }
            // Session exists but is dead (not connected, not initializing) — restart it
            if (!existing.isConnected && !existing.initializing) {
                console.log(`♻️ Session ${workspaceId} is dead, will restart...`);
                // Fall through to create a new session
            } else if (existing.initializing) {
                // Still initializing, wait for it
                if (this._initPromises.has(workspaceId)) {
                    console.log(`ℹ️ Session ${workspaceId} still initializing, waiting...`);
                    return this._initPromises.get(workspaceId);
                }
            }
        }

        // Si ya hay un init en curso para este workspaceId, esperar ese mismo Promise
        if (this._initPromises.has(workspaceId)) {
            console.log(`ℹ️ Session ${workspaceId} already initializing, waiting for existing init...`);
            return this._initPromises.get(workspaceId);
        }

        // Crear el Promise de init y guardarlo ANTES de await (lock real)
        const initPromise = this._doStartSession(workspaceId);
        this._initPromises.set(workspaceId, initPromise);

        try {
            return await initPromise;
        } finally {
            this._initPromises.delete(workspaceId);
        }
    }

    /**
     * Lógica interna de inicio de sesión (solo se ejecuta una vez por workspaceId).
     */
    async _doStartSession(workspaceId) {
        // Destruir sesión muerta si existe. 1.5s es suficiente para que
        // Chrome libere el SingletonLock; antes esperábamos 5s pero eso
        // alargaba innecesariamente el primer QR tras un restart.
        if (this.sessions.has(workspaceId)) {
            const existing = this.sessions.get(workspaceId);
            if (!existing.isConnected) {
                console.log(`♻️ Destroying stale session for ${workspaceId} before recreating...`);
                await existing.destroy();
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        // Clear previous error
        this._lastErrors.delete(workspaceId);

        const session = new WhatsAppSession(workspaceId, this.prisma);
        // CRITICAL: set en el Map ANTES de initialize() para que otros requests lo vean
        this.sessions.set(workspaceId, session);

        // Setup event handlers
        session.on('qr', (qr) => {
            console.log(`📱 QR generated for workspace ${workspaceId}`);
            // Persist QR so UI can poll status without holding an in-memory session.
            this.updateDbSession(workspaceId, { qr_data: qr, is_connected: false }).catch(() => {});
        });

        session.on('ready', async () => {
            console.log(`✅ Session ready for workspace ${workspaceId}`);
            // Reconexión exitosa: cancelamos cualquier reintento
            // programado y reseteamos el contador.
            this._cancelReconnect(workspaceId);
            await this.updateDbSession(workspaceId, {
                is_connected: true,
                initializing: false,
                paired_at: new Date(),
                last_ready_at: new Date(),
                last_heartbeat: new Date(),
                phone_number: session.phoneNumber || null,
                qr_data: null,
            });
        });

        session.on('disconnected', async (reason) => {
            const reasonStr = String(reason || 'unknown');
            console.log(`🔴 Session disconnected for workspace ${workspaceId}: ${reasonStr}`);
            await this.updateDbSession(workspaceId, {
                is_connected: false,
                initializing: false,
                disconnected_at: new Date(),
            });

            // Auto-reconexión: si la razón es recuperable (NAVIGATION,
            // CONFLICT, TIMEOUT, red caída…) la sesión local sigue
            // válida y reconectamos solos sin QR. Si es LOGOUT/UNPAIRED/
            // auth_failure el admin tiene que entrar al panel — no
            // gastamos CPU spinneando Chrome para nada.
            if (this._isUnrecoverable(reasonStr)) {
                console.log(
                    `⚠️ Reason "${reasonStr}" requires QR rescan for ${workspaceId} — ` +
                    `not auto-reconnecting. Admin: entra a /admin/whatsapp.`,
                );
                this._cancelReconnect(workspaceId);
                return;
            }
            this._scheduleReconnect(workspaceId, reasonStr);
        });

        // Auto-restart when QR scan times out (user took too long)
        session.on('qr_timeout', async () => {
            console.log(`🔄 Auto-restarting session for ${workspaceId} after QR timeout (10s cooldown)...`);
            // Small delay to let Chrome fully close
            await new Promise(resolve => setTimeout(resolve, 10000));
            try {
                await this.startSession(workspaceId);
            } catch (err) {
                console.error(`❌ Auto-restart failed for ${workspaceId}:`, err.message);
            }
        });

        // Marca initializing=true en DB para que el frontend muestre "iniciando…"
        await this.updateDbSession(workspaceId, { initializing: true, is_connected: false });

        // Initialize WhatsApp client
        try {
            await session.initialize();
        } catch (err) {
            console.error(`❌ Session init failed for ${workspaceId}:`, err.message);
            this._lastErrors.set(workspaceId, err.message);
            // CRITICAL: rollback. Si initialize falla, evitamos dejar una sesión
            // a medio-inicializar en el Map. Limpiamos TODOS los listeners
            // (antes solo 'disconnected') + destruimos el client + removemos
            // del Map. El próximo startSession vuelve a construir todo limpio.
            try {
                session.removeAllListeners();
                await session.destroy().catch(() => {});
            } catch { /* noop */ }
            this.sessions.delete(workspaceId);
            await this.updateDbSession(workspaceId, { initializing: false, is_connected: false }).catch(() => {});
        }
        return session;
    }

    async stopSession(workspaceId) {
        const session = this.sessions.get(workspaceId);
        if (!session) return false;

        // Stop explícito → cancelar reintentos programados para que
        // el auto-reconnect no resucite algo que el admin apagó.
        this._cancelReconnect(workspaceId);
        await session.destroy();
        this.sessions.delete(workspaceId);

        await this.updateDbSession(workspaceId, {
            is_connected: false,
            disconnected_at: new Date(),
        });

        return true;
    }

    /**
     * Cierra sesión de WhatsApp de forma REAL:
     * - Envía señal de logout a los servidores de WhatsApp (desvincula el dispositivo)
     * - Borra auth local para que no se reconecte
     * - Destruye el cliente de Puppeteer
     */
    async logoutSession(workspaceId) {
        const session = this.sessions.get(workspaceId);
        if (!session) return false;

        console.log(`🔓 logoutSession called for ${workspaceId}`);
        // Logout explícito → cancelar reintentos. Si quedaba un timer
        // de auto-reconnect pendiente, no queremos que dispare después
        // de que el admin desvinculó a propósito.
        this._cancelReconnect(workspaceId);
        await session.logout();
        this.sessions.delete(workspaceId);

        await this.updateDbSession(workspaceId, {
            is_connected: false,
            initializing: false,
            disconnected_at: new Date(),
            qr_data: null,
            phone_number: null,
        });

        console.log(`✅ logoutSession complete for ${workspaceId}`);
        return true;
    }

    /**
     * Destruye TODAS las sesiones activas.
     * Se usa en shutdown limpio (SIGINT/SIGTERM).
     * @param {boolean} keepDbState - Si true, NO marcar como desconectado en DB (para que se restauren al reiniciar)
     */
    async destroyAll(keepDbState = false) {
        console.log(`🛑 Destroying all ${this.sessions.size} session(s)... (keepDbState=${keepDbState})`);
        // Cancela todos los reintentos pendientes para que no disparen
        // un startSession en medio del shutdown (Chrome zombie garantizado).
        for (const workspaceId of Array.from(this._reconnectTimers.keys())) {
            this._cancelReconnect(workspaceId);
        }
        const promises = [];
        for (const [id, session] of this.sessions) {
            console.log(`  🗑️ Destroying session ${id}...`);
            // Prevent 'disconnected' event from updating DB if we want to preserve state
            if (keepDbState) {
                session.removeAllListeners('disconnected');
            }
            promises.push(
                session.destroy().catch(err => {
                    console.error(`  ❌ Error destroying session ${id}:`, err.message);
                })
            );
        }
        await Promise.allSettled(promises);
        this.sessions.clear();
        this._initPromises.clear();
        console.log('✅ All sessions destroyed.');
    }

    getSession(workspaceId) {
        return this.sessions.get(workspaceId) || null;
    }

    getAllSessions() {
        const result = [];
        for (const [workspaceId, session] of this.sessions) {
            result.push({
                workspaceId,
                isConnected: session.isConnected,
                initializing: session.initializing,
                qr: session.lastQr,
                phoneNumber: session.phoneNumber,
                lastReadyAt: session.lastReadyAt || null,
                lastError: session.lastError || this._lastErrors.get(workspaceId) || null,
            });
        }
        return result;
    }

    /**
     * Devuelve la única sesión activa conectada para un workspace.
     * En CED-GYM el plan es 1 bot por workspace (no por staff), así que la
     * lógica se simplifica: buscar la sesión en memoria y, si está conectada,
     * retornarla. Null si no existe o no está lista para enviar.
     */
    async findSessionForWorkspace(workspaceId) {
        const session = this.sessions.get(workspaceId);
        if (session && session.isConnected) return session;
        return null;
    }

    /**
     * Upsert helper. El modelo WhatsAppSession tiene @@unique([workspace_id]),
     * así que usamos workspace_id como where en el upsert.
     */
    async updateDbSession(workspaceId, data) {
        try {
            await this.prisma.whatsAppSession.upsert({
                where: { workspace_id: workspaceId },
                update: data,
                create: { workspace_id: workspaceId, ...data }
            });
        } catch (err) {
            console.error(`Error updating DB session for ${workspaceId}:`, err.message);
        }
    }
}

export default SessionManager;
