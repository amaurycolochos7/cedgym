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

  const streak = progress?.current_streak_days ?? 0;
  const xp = progress?.xp ?? 0;
  const level = progress?.level ?? 1;
  const xpForNext = progress?.xp_to_next_level ?? 100;
  const xpProgress = progress?.level_progress_pct ?? 0;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-bold">Hola, {user?.name?.split(' ')[0] ?? 'Atleta'} 👋</h1>
        <p className="text-zinc-400 mt-1">Sigue tu progreso, tus clases y tus logros.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Flame className="w-5 h-5 text-orange-400" />}
          label="Racha"
          value={`${streak} días`}
          hint={streak >= 7 ? '¡Sigue así!' : 'Vamos a construir racha'}
        />
        <KpiCard
          icon={<Zap className="w-5 h-5 text-yellow-400" />}
          label="XP"
          value={xp.toLocaleString()}
          hint={`Nivel ${level}`}
        />
        <KpiCard
          icon={<Trophy className="w-5 h-5 text-emerald-400" />}
          label="Check-ins totales"
          value={(progress?.total_checkins ?? 0).toLocaleString()}
          hint="De toda la historia"
        />
        <KpiCard
          icon={<Activity className="w-5 h-5 text-sky-400" />}
          label="Este mes"
          value={`${checkins?.count_this_month ?? 0}`}
          hint="Visitas"
        />
      </div>

      {/* Level progress */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Nivel {level}</div>
            <div className="text-lg font-semibold">Progreso al nivel {level + 1}</div>
          </div>
          <div className="text-sm text-zinc-400">
            {xp.toLocaleString()} / {(xp + xpForNext).toLocaleString()} XP
          </div>
        </div>
        <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-all"
            style={{ width: `${Math.min(100, xpProgress)}%` }}
          />
        </div>
      </div>

      {/* Two-column: membership + quick actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-4">Tu membresía</h3>
          {membership?.plan ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold">{membership.plan}</span>
                <span className="text-sm text-zinc-400">{membership.status}</span>
              </div>
              <div className="text-sm text-zinc-400">
                Vence en <span className="text-orange-400 font-semibold">
                  {membership.days_remaining ?? '—'} días
                </span>
              </div>
              <Link
                href="/portal/membership"
                className="inline-flex items-center gap-1 text-sm text-orange-400 hover:text-orange-300"
              >
                Gestionar <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="text-zinc-500">
              No tienes una membresía activa.
              <Link href="/#planes" className="text-orange-400 ml-1">Ver planes →</Link>
            </div>
          )}
        </div>

        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-4">Accesos rápidos</h3>
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
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6">
          <h3 className="text-lg font-semibold mb-4">Logros recientes</h3>
          <div className="flex flex-wrap gap-3">
            {progress.recent_badges.map((b: any) => (
              <div
                key={b.code}
                className="bg-zinc-800/70 border border-orange-500/30 rounded-lg p-3 min-w-[140px]"
              >
                <div className="text-2xl mb-1">🏅</div>
                <div className="text-sm font-medium">{b.name}</div>
                <div className="text-xs text-zinc-500">+{b.xp_reward} XP</div>
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
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{hint}</div>
    </div>
  );
}

function QuickTile({ href, icon, label }: any) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 hover:border-orange-500/40 transition"
    >
      <span className="text-orange-400">{icon}</span>
      <span className="text-sm">{label}</span>
    </Link>
  );
}
