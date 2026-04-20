import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { prisma } from '@cedgym/db';
import SessionManager from './SessionManager.js';
import sessionsRouter from './routes/sessions.js';
import messagesRouter from './routes/messages.js';

// ─── In-memory log buffer for diagnostics ──────────────────────
const LOG_BUFFER_SIZE = 200;
const logBuffer = [];
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

function captureLog(level, args) {
    const msg = args.map(a => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack}`;
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
    logBuffer.push({ t: new Date().toISOString(), l: level, m: msg });
    if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}

console.log = (...args) => { captureLog('LOG', args); origLog.apply(console, args); };
console.error = (...args) => { captureLog('ERR', args); origError.apply(console, args); };
console.warn = (...args) => { captureLog('WRN', args); origWarn.apply(console, args); };

const app = express();
const PORT = process.env.PORT || 3002;

// Initialize SessionManager con el cliente Prisma compartido
const sessionManager = new SessionManager(prisma);

// ─── Graceful Shutdown ─────────────────────────────────────────
let isShuttingDown = false;

async function shutdown(code = 0) {
    if (isShuttingDown) return; // evitar doble shutdown
    isShuttingDown = true;
    console.log('\n🛑 Shutting down, destroying all WhatsApp sessions...');
    try {
        // keepDbState=true — al reiniciar, self-heal rehidratará las sesiones
        // que estaban conectadas sin marcarlas como desconectadas en DB.
        await sessionManager.destroyAll(true);
    } catch (e) {
        console.error('Error during session cleanup:', e);
    }
    try {
        await prisma.$disconnect();
    } catch (e) { /* ignore */ }
    console.log('👋 Bye.');
    process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', async (err) => {
    console.error('💥 Uncaught Exception:', err);
    // Only shutdown on truly fatal errors, not Puppeteer protocol errors
    if (err.message && (err.message.includes('EADDRINUSE') || err.message.includes('out of memory'))) {
        await shutdown(1);
    }
    // Otherwise log and continue — the bot should be resilient
});
process.on('unhandledRejection', (reason, p) => {
    // DO NOT crash — Puppeteer/Chrome protocol errors are common and recoverable
    console.error('⚠️ Unhandled Rejection (non-fatal):', reason);
});

// ─── Express Setup ─────────────────────────────────────────────
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// API Key middleware — obligatorio en todos los endpoints excepto /health.
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    console.warn('[BOT] ⚠️ No API_KEY env var set — all authenticated endpoints will be rejected.');
}
app.use((req, res, next) => {
    // Skip auth for health check
    if (req.path === '/health') return next();
    const key = req.headers['x-api-key'];
    if (API_KEY && key === API_KEY) return next();
    // Allow internal network (docker compose service name / localhost)
    const host = req.hostname;
    if (host === 'localhost' || host === 'whatsapp-bot' || host === '127.0.0.1') return next();
    return res.status(401).json({ error: 'API key requerida' });
});

// Make sessionManager / prisma available to route handlers
app.set('sessionManager', sessionManager);
app.set('prisma', prisma);

// Health check — sin auth
app.get('/health', (req, res) => {
    res.json({ ok: true });
});

// Routes
app.use('/sessions', sessionsRouter);
app.use('/', messagesRouter);

// Debug endpoint — expone logs capturados + estado interno
app.get('/debug', (req, res) => {
    const sessions = sessionManager.getAllSessions();
    res.json({
        uptime: process.uptime(),
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        nodeVersion: process.version,
        env: {
            PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || 'not set',
            WWEBJS_DATA_PATH: process.env.WWEBJS_DATA_PATH || 'not set',
            NODE_ENV: process.env.NODE_ENV || 'not set',
            PORT: process.env.PORT || 'not set',
        },
        sessions,
        logs: logBuffer.slice(-50),
    });
});

// Start
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`📱 CED-GYM WhatsApp Bot running on port ${PORT}`);
    try {
        // 1) Restaurar cualquier sesión previamente conectada.
        const connected = await prisma.whatsAppSession.findMany({
            where: { is_connected: true }
        });
        for (const s of connected) {
            if (s.workspace_id) {
                console.log(`  🔄 Restoring connected session ${s.workspace_id}…`);
                sessionManager.startSession(s.workspace_id).catch((e) =>
                    console.error('restore failed:', e.message)
                );
            }
        }

        // 2) Pre-warm: si no hay sesión conectada pero existe el registro
        //    para un workspace, arrancar en background para tener el QR
        //    listo cuando el admin abra la pantalla. Elimina el "cold start"
        //    visible al usuario.
        if (connected.length === 0) {
            const any = await prisma.whatsAppSession.findFirst({
                orderBy: { created_at: 'asc' }
            });
            if (any?.workspace_id) {
                console.log(`  🔥 Pre-warming session ${any.workspace_id} for fast QR…`);
                sessionManager.startSession(any.workspace_id).catch((e) =>
                    console.error('prewarm failed:', e.message)
                );
            }
        }
    } catch (err) {
        console.error('Error on boot session restore:', err.message);
    }
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

// ─── SELF-HEAL SWEEP ─────────────────────────────────────────────────
// Busca sesiones que un día estuvieron conectadas (lastReadyAt != null) y
// ahora llevan >20 min desconectadas sin inicializar. Solo entonces las
// reinicia. Sesiones que nunca han visto `ready` (esperando QR / cargando
// credenciales / autenticando) se DEJAN EN PAZ — el flujo normal de
// whatsapp-web.js puede tomar 30-90s con IndexedDB grande, y matar en medio
// corrompe la carpeta de sesión.
//
// Se puede desactivar con SELF_HEAL_ENABLED=false para diagnósticos / recovery.
const HEALTH_CHECK_MS = 5 * 60 * 1000;   // barrida cada 5 min
const DEAD_THRESHOLD_MS = 20 * 60 * 1000; // 20 min sin ready
const SELF_HEAL_ENABLED = process.env.SELF_HEAL_ENABLED !== 'false';

if (SELF_HEAL_ENABLED) {
    setInterval(async () => {
        try {
            const sessions = sessionManager.getAllSessions();
            for (const s of sessions) {
                if (s.isConnected) continue;
                if (s.initializing) continue;                 // ya está levantando, no tocar
                if (!s.lastReadyAt) continue;                 // nunca autenticó — seguramente escanear QR pendiente
                const last = new Date(s.lastReadyAt).getTime();
                if (Date.now() - last > DEAD_THRESHOLD_MS) {
                    console.log(`[self-heal] session ${s.workspaceId} looks dead; reinitializing…`);
                    sessionManager.startSession(s.workspaceId).catch((e) =>
                        console.warn(`[self-heal] start failed for ${s.workspaceId}: ${e.message}`)
                    );
                }
            }
        } catch (e) {
            console.warn('[self-heal] sweep error:', e.message);
        }
    }, HEALTH_CHECK_MS);
} else {
    console.log('[self-heal] disabled via SELF_HEAL_ENABLED=false');
}

// ─── MEMORY WATCHDOG ─────────────────────────────────────────────────
// If RSS stays above 1.5 GB for 5 straight checks (i.e. 5+ minutes), trigger
// a graceful shutdown. Docker/Swarm will restart us, sessions re-hydrate
// from disk. Prevents Chromium memory leaks from spiraling forever.
const MEMORY_LIMIT_BYTES = 1.5 * 1024 * 1024 * 1024;
let overCount = 0;
setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > MEMORY_LIMIT_BYTES) {
        overCount += 1;
        console.warn(`[watchdog] RSS ${Math.round(rss / 1024 / 1024)}MB over limit (strike ${overCount}/5)`);
        if (overCount >= 5) {
            console.error('[watchdog] RSS over limit for 5 checks — graceful restart');
            shutdown(0);
        }
    } else if (overCount > 0) {
        overCount = Math.max(0, overCount - 1);
    }
}, 60 * 1000);
