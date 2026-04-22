'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Lock, ShieldCheck, ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const CACHE_KEY = 'cedgym_qr_cache';
const REFRESH_MS = 55_000;

interface QrTokenData {
  token: string;
  expires_in?: number;
  ttl_seconds?: number;
}

interface MembershipData {
  membership: {
    id?: string;
    plan?: string;
    status?: string;
  } | null;
  days_remaining?: number | null;
}

export default function PortalQRPage() {
  const { user } = useAuth();

  // Poll the QR endpoint — the API rotates the signed token every ~60s.
  const qrQuery = useQuery<QrTokenData>({
    queryKey: ['checkins', 'me', 'qr-token'],
    queryFn: async () => (await api.get('/checkins/me/qr-token')).data,
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS - 5_000,
    retry: false,
  });

  // Needed to render the "no active plan" state cleanly.
  const membershipQuery = useQuery<MembershipData>({
    queryKey: ['memberships', 'me'],
    queryFn: async () => (await api.get('/memberships/me')).data,
    retry: false,
  });

  const hasActivePlan = useMemo(() => {
    const resp = membershipQuery.data;
    if (!resp) return null; // unknown — still loading
    const m = resp.membership;
    if (!m || !m.plan) return false;
    if (m.status && !['active', 'ACTIVE', 'trial', 'TRIAL'].includes(m.status))
      return false;
    if (typeof resp.days_remaining === 'number' && resp.days_remaining <= 0)
      return false;
    return true;
  }, [membershipQuery.data]);

  // Offline-resilient: cache last good token for ~90s so the screen
  // still works on a flaky network at the gym door.
  const [cached, setCached] = useState<string | null>(null);
  useEffect(() => {
    if (qrQuery.data?.token) {
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ token: qrQuery.data.token, at: Date.now() }),
        );
      } catch {
        /* quota — ignore */
      }
      setCached(qrQuery.data.token);
    }
  }, [qrQuery.data]);

  useEffect(() => {
    if (!qrQuery.data && !qrQuery.isLoading) {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const { token, at } = JSON.parse(raw) as { token: string; at: number };
          if (Date.now() - at < 90_000) setCached(token);
        }
      } catch {
        /* ignore */
      }
    }
  }, [qrQuery.data, qrQuery.isLoading]);

  const token = qrQuery.data?.token ?? cached;
  const offline = !qrQuery.data && !!cached;

  // --- No active plan branch -----------------------------------------
  if (hasActivePlan === false) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center gap-6 py-10 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl ring-1 ring-slate-200 bg-white shadow-sm text-slate-400">
          <Lock size={26} />
        </span>
        <div className="max-w-md space-y-2 px-4">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">No tienes plan activo</h1>
          <p className="text-sm text-slate-500">
            Para generar tu QR de acceso necesitas una membresía vigente.
          </p>
        </div>
        <Link
          href="/#planes"
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-3 text-sm font-semibold text-white transition shadow-sm"
        >
          Ver planes
        </Link>
      </div>
    );
  }

  // --- Main QR view ---------------------------------------------------
  // Designed as the member's "digital membership card". The token rotates
  // every ~60s under the hood (refetchInterval above), but we don't
  // surface that to the user — showing a countdown stresses them out and
  // makes them question whether the QR they're about to show is "stale".
  // If a silent refetch fails the cached token keeps the QR usable for
  // another ~90s (offline-resilient).
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {/* Hero — compact: eyebrow + title in 2 tight lines */}
      <div className="text-center px-4">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">
          <ShieldCheck className="h-3 w-3" />
          Acceso CED·GYM
        </div>
        <h1 className="mt-1.5 font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          {user?.name?.split(' ')[0] ?? 'Tu'} QR
        </h1>
      </div>

      {/* QR card — subtle blue gradient frame so it feels like a membership
          card, not a form input. Sized to leave room for the instructions
          below without scrolling. Offline state is communicated through
          the refresh button that pops up at the bottom, not a badge. */}
      <div
        className="relative rounded-3xl bg-gradient-to-br from-blue-600 to-sky-500 p-[3px] shadow-lg shadow-blue-600/20"
        style={{ width: 'min(62vw, 260px)' }}
      >
        <div className="rounded-[22px] bg-white p-3 sm:p-4">
          {token ? (
            <QRCode
              value={token}
              level="M"
              style={{
                height: 'auto',
                maxWidth: '100%',
                width: '100%',
              }}
            />
          ) : qrQuery.isLoading ? (
            <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-slate-100 px-4 text-center text-sm text-slate-500">
              No fue posible cargar tu QR.
            </div>
          )}
        </div>
      </div>

      {/* Instructions — 3 steps that reinforce the full habit: open the
          app / log in every visit, show this exact QR, get access. */}
      <div className="w-full max-w-md px-4">
        <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <ScanLine className="h-3 w-3 text-blue-600" />
          Cada visita al gym
        </div>
        <ol className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] leading-snug text-slate-700">
          <li className="flex flex-col items-center gap-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              1
            </span>
            <span>
              Abre CED·GYM
              <br />
              en tu cuenta
            </span>
          </li>
          <li className="flex flex-col items-center gap-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              2
            </span>
            <span>
              Muestra este QR
              <br />
              en el escáner
            </span>
          </li>
          <li className="flex flex-col items-center gap-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              3
            </span>
            <span>
              Tu visita
              <br />
              queda registrada
            </span>
          </li>
        </ol>
        <p className="mt-3 text-center text-[11px] text-slate-500">
          Tu QR es personal y único — preséntalo <strong className="text-slate-700">siempre</strong> al entrar.
        </p>
      </div>

      {/* Subtle refresh — only visible if something went wrong. No
          countdown, no "válido por X seg". The QR is always fresh when
          the user opens this screen, and it silently rotates in the
          background. */}
      {(qrQuery.error || offline) && (
        <button
          type="button"
          onClick={() => qrQuery.refetch()}
          className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw
            size={12}
            className={qrQuery.isFetching ? 'animate-spin' : ''}
          />
          Volver a generar
        </button>
      )}
    </div>
  );
}
