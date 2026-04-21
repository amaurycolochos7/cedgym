'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy, Crown } from 'lucide-react';
import { api } from '@/lib/api';

export default function PortalLogrosPage() {
  const { data: progress } = useQuery({
    queryKey: ['gamification', 'me'],
    queryFn: async () => (await api.get('/gamification/me')).data,
  });

  const { data: badges } = useQuery({
    queryKey: ['gamification', 'badges'],
    queryFn: async () => (await api.get('/gamification/badges')).data,
  });

  const { data: lb } = useQuery({
    queryKey: ['gamification', 'leaderboard'],
    queryFn: async () => (await api.get('/gamification/leaderboard')).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Mis logros</h1>
        <p className="text-slate-500 mt-1">Badges, nivel y leaderboard.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-sky-400 text-white rounded-2xl p-6 shadow-md shadow-blue-500/20">
          <div className="text-xs uppercase text-white/80 font-semibold">Nivel</div>
          <div className="text-5xl font-bold mt-2 tabular-nums">{progress?.level ?? 1}</div>
          <div className="text-sm text-white/80 mt-2 tabular-nums">
            {progress?.xp ?? 0} XP totales
          </div>
        </div>
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6">
          <div className="text-xs uppercase text-slate-500 font-semibold">Racha actual</div>
          <div className="text-5xl font-bold mt-2 text-slate-900 tabular-nums">
            🔥 {progress?.current_streak_days ?? 0}
          </div>
          <div className="text-sm text-slate-600 mt-2 tabular-nums">
            Mejor: {progress?.longest_streak_days ?? 0} días
          </div>
        </div>
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-6">
          <div className="text-xs uppercase text-slate-500 font-semibold">Posición</div>
          <div className="text-5xl font-bold mt-2 flex items-center gap-2 text-slate-900 tabular-nums">
            <Crown className="w-8 h-8 text-amber-500" />
            #{lb?.my_position ?? '—'}
          </div>
          <div className="text-sm text-slate-600 mt-2">En el gym</div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4 text-slate-900">Badges</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {(badges?.items ?? []).map((b: any) => (
            <div
              key={b.code}
              className={
                b.earned
                  ? 'bg-blue-50 ring-1 ring-blue-200 rounded-xl p-4 text-center shadow-sm'
                  : 'bg-white ring-1 ring-slate-200 rounded-xl p-4 text-center opacity-60'
              }
            >
              <Trophy
                className={
                  b.earned
                    ? 'w-8 h-8 mx-auto mb-2 text-amber-500'
                    : 'w-8 h-8 mx-auto mb-2 text-slate-300'
                }
              />
              <div className="font-medium text-sm text-slate-900">{b.name}</div>
              <div className={`text-xs mt-1 ${b.earned ? 'text-blue-700 font-semibold' : 'text-slate-500'}`}>
                {b.earned ? `+${b.xp_reward} XP` : `${b.progress_pct ?? 0}%`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4 text-slate-900">Leaderboard (Top 10)</h2>
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl overflow-hidden">
          {(lb?.items ?? []).slice(0, 10).map((row: any, i: number) => (
            <div
              key={row.user_id}
              className={
                row.is_me
                  ? 'flex items-center justify-between px-5 py-3 border-b border-slate-200 last:border-0 bg-blue-50'
                  : 'flex items-center justify-between px-5 py-3 border-b border-slate-200 last:border-0 hover:bg-slate-50'
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    i < 3
                      ? 'w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-blue-500 flex items-center justify-center font-bold text-sm text-white shadow-sm'
                      : 'w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-semibold'
                  }
                >
                  {i + 1}
                </span>
                <span className="font-medium text-slate-900">{row.name}</span>
              </div>
              <div className="text-sm text-slate-600 tabular-nums">
                Nivel {row.level} · {row.xp.toLocaleString()} XP
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
