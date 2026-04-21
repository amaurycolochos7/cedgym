'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Flame, Zap, Trophy, QrCode, Calendar, ChevronRight, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function PortalDashboardPage() {
  const { user } = useAuth();

  const { data: progress } = useQuery({
    queryKey: ['gamification', 'me'],
    queryFn: async () => (await api.get('/gamification/me')).data,
  });

  const { data: membership } = useQuery({
    queryKey: ['memberships', 'me'],
    queryFn: async () => (await api.get('/memberships/me')).data,
  });

  const { data: checkins } = useQuery({
    queryKey: ['checkins', 'me', 'history'],
    queryFn: async () => (await api.get('/checkins/me/history?limit=30')).data,
  });

  // Backend returns { progress:{...}, level:{...}, earned:[], next_badges:[] }
  // Unwrap safely — these are all nullable on boot.
  const p = progress?.progress ?? {};
  const lvl = progress?.level ?? {};
  const streak = p.current_streak_days ?? 0;
  const xp = p.xp ?? 0;
  const level = p.level ?? 1;
  const xpForNext = lvl.xp_to_next ?? 100;
  const xpProgress = lvl.pct ?? 0;
  const totalCheckins = p.total_checkins ?? 0;
  // count_this_month from the history array
  const now = new Date();
  const thisMonthCount = Array.isArray(checkins?.check_ins)
    ? checkins.check_ins.filter((c: any) => {
        const d = new Date(c.scanned_at ?? c.created_at ?? 0);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length
    : 0;

  return (
    <div className="space-y-7 sm:space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Hola, {user?.name?.split(' ')[0] ?? 'Atleta'}
        </h1>
        <p className="text-slate-500 mt-1.5 text-sm sm:text-base">
          Sigue tu progreso, tus clases y tus logros.
        </p>
      </div>

      {/* Mi QR de acceso — top, prominent hero card */}
      <Link
        href="/portal/qr"
        className="group block overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 text-white p-5 sm:p-6 shadow-lg shadow-blue-600/25 transition hover:shadow-xl hover:shadow-blue-600/35"
      >
        <div className="flex items-center gap-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 text-white backdrop-blur-sm transition group-hover:bg-white/25">
            <QrCode className="h-7 w-7" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="inline-block rounded-full bg-white/15 ring-1 ring-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
              Entrada al gym
            </div>
            <div className="font-display mt-1.5 text-xl sm:text-2xl font-bold text-white truncate">
              Mi QR de acceso
            </div>
            <div className="mt-0.5 text-xs sm:text-sm text-white/90 truncate">
              Muéstralo al staff en la entrada.
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-white transition group-hover:translate-x-1" />
        </div>
      </Link>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon={<Flame className="w-5 h-5 text-blue-600" />}
          label="Racha"
          value={`${streak} días`}
          hint={streak >= 7 ? '¡Sigue así!' : 'Vamos a construir racha'}
        />
        <KpiCard
          icon={<Zap className="w-5 h-5 text-amber-500" />}
          label="XP"
          value={xp.toLocaleString()}
          hint={`Nivel ${level}`}
        />
        <KpiCard
          icon={<Trophy className="w-5 h-5 text-emerald-600" />}
          label="Check-ins totales"
          value={totalCheckins.toLocaleString()}
          hint="De toda la historia"
        />
        <KpiCard
          icon={<Activity className="w-5 h-5 text-sky-500" />}
          label="Este mes"
          value={`${thisMonthCount}`}
          hint="Visitas"
        />
      </div>

      {/* Level progress */}
      <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Nivel {level}</div>
            <div className="text-lg font-semibold text-slate-900">Progreso al nivel {level + 1}</div>
          </div>
          <div className="text-sm text-slate-500 tabular-nums">
            {xp.toLocaleString()} / {(xp + xpForNext).toLocaleString()} XP
          </div>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all"
            style={{ width: `${Math.min(100, xpProgress)}%` }}
          />
        </div>
      </div>

      {/* Two-column: membership + quick actions */}
      <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4 text-slate-900">Tu membresía</h3>
          {membership?.plan ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-slate-900">{membership.plan}</span>
                <span className="text-sm text-slate-500">{membership.status}</span>
              </div>
              <div className="text-sm text-slate-600">
                Vence en <span className="text-blue-600 font-semibold">
                  {membership.days_remaining ?? '—'} días
                </span>
              </div>
              <Link
                href="/portal/membership"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Gestionar <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="text-slate-500">
              No tienes una membresía activa.
              <Link href="/#planes" className="text-blue-600 hover:text-blue-700 font-medium ml-1">Ver planes →</Link>
            </div>
          )}
        </div>

        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4 text-slate-900">Accesos rápidos</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickTile href="/portal/qr" icon={<QrCode className="w-5 h-5" />} label="Mi QR" />
            <QuickTile href="/portal/clases" icon={<Calendar className="w-5 h-5" />} label="Reservar" />
            <QuickTile href="/portal/rutinas" icon={<Trophy className="w-5 h-5" />} label="Rutinas" />
            <QuickTile href="/tienda" icon={<Zap className="w-5 h-5" />} label="Tienda" />
          </div>
        </div>
      </div>

      {/* Recent badges */}
      {progress?.recent_badges?.length > 0 && (
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-4 text-slate-900">Logros recientes</h3>
          <div className="flex flex-wrap gap-3">
            {progress.recent_badges.map((b: any) => (
              <div
                key={b.code}
                className="bg-blue-50 ring-1 ring-blue-200 rounded-lg p-3 min-w-[140px]"
              >
                <div className="text-2xl mb-1">🏅</div>
                <div className="text-sm font-medium text-slate-900">{b.name}</div>
                <div className="text-xs text-blue-700">+{b.xp_reward} XP</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, hint }: any) {
  return (
    <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">{label}</span>
        <span className="shrink-0">{icon}</span>
      </div>
      <div className="text-xl sm:text-2xl font-bold text-slate-900 truncate tabular-nums leading-tight">{value}</div>
      <div className="text-[11px] sm:text-xs text-slate-500 mt-1.5 truncate">{hint}</div>
    </div>
  );
}

function QuickTile({ href, icon, label }: any) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-2.5 py-5 px-3 rounded-2xl bg-slate-50 hover:bg-blue-50 ring-1 ring-slate-200 hover:ring-blue-300 transition"
    >
      <span className="text-blue-600">{icon}</span>
      <span className="text-sm text-slate-700 font-medium">{label}</span>
    </Link>
  );
}
