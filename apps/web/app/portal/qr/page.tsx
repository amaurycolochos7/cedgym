'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import { useEffect, useMemo, useState } from 'react';
import { QrCode, RefreshCw, Lock } from 'lucide-react';
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
  id?: string;
  plan?: string;
  status?: string;
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
    const m = membershipQuery.data;
    if (!m) return null; // unknown — still loading
    if (!m.plan) return false;
    if (m.status && !['active', 'ACTIVE', 'trial', 'TRIAL'].includes(m.status))
      return false;
    if (typeof m.days_remaining === 'number' && m.days_remaining <= 0)
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

  // Countdown until next auto-refresh (visual only — the query handles the
  // actual poll).
  const [secondsLeft, setSecondsLeft] = useState(60);
  useEffect(() => {
    if (qrQuery.data) setSecondsLeft(60);
  }, [qrQuery.data]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 60 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const token = qrQuery.data?.token ?? cached;
  const offline = !qrQuery.data && !!cached;

  // --- No active plan branch -----------------------------------------
  if (hasActivePlan === false) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center gap-6 py-10 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900/60 text-zinc-500">
          <Lock size={26} />
        </span>
        <div className="max-w-md space-y-2 px-4">
          <h1 className="text-2xl sm:text-3xl font-bold">No tienes plan activo</h1>
          <p className="text-sm text-zinc-400">
            Para generar tu QR de acceso necesitas una membresía vigente.
          </p>
        </div>
        <Link
          href="/#planes"
          className="inline-flex items-center justify-center rounded-xl bg-brand-orange px-6 py-3 text-sm font-semibold text-black transition hover:brightness-110"
        >
          Ver planes
        </Link>
      </div>
    );
  }

  // --- Main QR view --------------------------------------------------
  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center gap-6 py-6 sm:py-10">
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-zinc-500">
          {user?.name?.split(' ')[0] ?? 'Atleta'}
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold">
          Mi QR de acceso
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-400 px-4">
          Muéstralo al staff en la entrada.
        </p>
      </div>

      {/* QR card — fills 80% of viewport on mobile, capped at 340px. */}
      <div
        className="rounded-3xl bg-white p-5 sm:p-6 shadow-2xl shadow-orange-500/20"
        style={{ width: 'min(80vw, 340px)' }}
      >
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
          <div className="aspect-square w-full animate-pulse rounded-xl bg-zinc-100" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-zinc-100 px-4 text-center text-sm text-zinc-500">
            No fue posible cargar tu QR. Verifica tu conexión e intenta otra
            vez.
          </div>
        )}
      </div>

      {/* Status + countdown */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
            offline
              ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
              : 'border-white/10 bg-white/5 text-white/70'
          }`}
        >
          <RefreshCw size={12} className={qrQuery.isFetching ? 'animate-spin' : ''} />
          {offline
            ? 'Modo offline — QR en caché'
            : `Válido por ${secondsLeft} seg`}
        </div>
        <button
          type="button"
          onClick={() => qrQuery.refetch()}
          className="text-xs text-zinc-400 underline-offset-2 hover:text-white hover:underline"
        >
          Actualizar ahora
        </button>
      </div>

      {/* Soft helper — what to do if the QR fails */}
      <div className="w-full max-w-md px-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-xs text-zinc-400">
          <div className="flex items-start gap-2">
            <QrCode size={14} className="mt-0.5 shrink-0 text-brand-orange" />
            <p className="leading-relaxed">
              Tu QR se actualiza automáticamente cada minuto por seguridad. Si
              el escáner no lo lee, pulsa <em>Actualizar ahora</em>.
            </p>
          </div>
        </div>
      </div>

      {qrQuery.error && !cached && (
        <div className="max-w-md px-4 text-center text-sm text-red-400">
          No pudimos generar tu QR ahora. Intenta de nuevo en unos segundos.
        </div>
      )}
    </div>
  );
}
