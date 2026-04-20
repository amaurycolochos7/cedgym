// ═══════════════════════════════════════════════════════════════
// CED-GYM Worker — automation pump + temporal sweeps (Fase 3+).
//
// Responsibilities:
//   - Process AutomationJob queue (every 30 s).
//   - Fire time-based triggers:
//       • membership.expiring_soon  (8 / 3 / 1 days)
//       • membership.expired        (expired yesterday)
//       • inactivity.14_days        (no check-ins in 14 days)
//       • member.birthday           (today)
//     every 5 min.
//   - Housekeep old DONE jobs every 60 min.
//
// No HTTP surface: everything is driven by Postgres + Redis.
// Graceful shutdown on SIGINT / SIGTERM.
// ═══════════════════════════════════════════════════════════════

import 'dotenv/config';
import Redis from 'ioredis';
import { prisma } from '@cedgym/db';

import { runJobSweep } from './sweeps/jobs.js';
import { runExpiringSweep, runExpiredSweep } from './sweeps/memberships.js';
import { runInactivitySweep } from './sweeps/inactivity.js';
import { runBirthdaySweep } from './sweeps/birthdays.js';
import { runCleanupSweep } from './sweeps/cleanup.js';

// Intervals (tune via env if needed).
const JOB_SWEEP_MS      = Number(process.env.WORKER_JOB_SWEEP_MS      || 30 * 1000);
const TEMPORAL_SWEEP_MS = Number(process.env.WORKER_TEMPORAL_SWEEP_MS || 5 * 60 * 1000);
const CLEANUP_SWEEP_MS  = Number(process.env.WORKER_CLEANUP_SWEEP_MS  || 60 * 60 * 1000);

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
});
redis.on('error', (err) => console.error('[worker/redis] error:', err.message));
redis.on('connect', () => console.log('[worker/redis] connected'));

// ── Runtime flags ────────────────────────────────────────────
let jobSweepBusy = false;
let temporalSweepBusy = false;
let cleanupBusy = false;
let shuttingDown = false;

// ── Wrappers: lock + log ─────────────────────────────────────
async function tickJobs() {
    if (shuttingDown || jobSweepBusy) return;
    jobSweepBusy = true;
    try {
        const r = await runJobSweep();
        if (r.processed > 0) {
            console.log(`[worker/jobs] processed=${r.processed} done=${r.done} retried=${r.retried} failed=${r.failed}`);
        }
    } catch (e) {
        console.error('[worker/jobs] sweep failed:', e.message);
    } finally {
        jobSweepBusy = false;
    }
}

async function tickTemporal() {
    if (shuttingDown || temporalSweepBusy) return;
    temporalSweepBusy = true;
    try {
        const [expiring, expired, inactive, birthdays] = await Promise.allSettled([
            runExpiringSweep(redis),
            runExpiredSweep(redis),
            runInactivitySweep(redis),
            runBirthdaySweep(redis),
        ]);

        const summary = {
            expiring:  expiring.status  === 'fulfilled' ? expiring.value  : { error: expiring.reason?.message  },
            expired:   expired.status   === 'fulfilled' ? expired.value   : { error: expired.reason?.message   },
            inactive:  inactive.status  === 'fulfilled' ? inactive.value  : { error: inactive.reason?.message  },
            birthdays: birthdays.status === 'fulfilled' ? birthdays.value : { error: birthdays.reason?.message },
        };
        console.log('[worker/temporal]', JSON.stringify(summary));
    } catch (e) {
        console.error('[worker/temporal] sweep failed:', e.message);
    } finally {
        temporalSweepBusy = false;
    }
}

async function tickCleanup() {
    if (shuttingDown || cleanupBusy) return;
    cleanupBusy = true;
    try {
        const r = await runCleanupSweep();
        if (r.deleted > 0) console.log(`[worker/cleanup] deleted ${r.deleted} old jobs`);
    } catch (e) {
        console.error('[worker/cleanup] sweep failed:', e.message);
    } finally {
        cleanupBusy = false;
    }
}

// ── Boot ─────────────────────────────────────────────────────
console.log('🏋️  CED-GYM worker booted');
console.log(`    job sweep every ${JOB_SWEEP_MS / 1000}s`);
console.log(`    temporal sweep every ${TEMPORAL_SWEEP_MS / 1000}s`);
console.log(`    cleanup sweep every ${CLEANUP_SWEEP_MS / 1000}s`);

// Run each one immediately so boot warmth equals steady-state.
tickJobs().catch(() => {});
tickTemporal().catch(() => {});
// Don't fire cleanup on boot — it's safe to wait.

const jobInterval      = setInterval(tickJobs,      JOB_SWEEP_MS);
const temporalInterval = setInterval(tickTemporal,  TEMPORAL_SWEEP_MS);
const cleanupInterval  = setInterval(tickCleanup,   CLEANUP_SWEEP_MS);

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] received ${signal}, shutting down gracefully…`);
    clearInterval(jobInterval);
    clearInterval(temporalInterval);
    clearInterval(cleanupInterval);

    // Give any in-flight sweep a short grace period.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && (jobSweepBusy || temporalSweepBusy || cleanupBusy)) {
        await new Promise((r) => setTimeout(r, 100));
    }

    try { await redis.quit(); } catch { /* ignore */ }
    try { await prisma.$disconnect(); } catch { /* ignore */ }

    console.log('[worker] bye.');
    process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => {
    console.error('[worker] uncaughtException:', e);
});
process.on('unhandledRejection', (e) => {
    console.error('[worker] unhandledRejection:', e);
});
