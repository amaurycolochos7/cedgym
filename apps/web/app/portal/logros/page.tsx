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
        <h1 className="text-3xl font-bold">Mis logros</h1>
        <p className="text-zinc-400 mt-1">Badges, nivel y leaderboard.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-600/30 to-blue-800/10 border border-blue-500/30 rounded-2xl p-6">
          <div className="text-xs uppercase text-blue-400">Nivel</div>
          <div className="text-5xl font-bold mt-2">{progress?.level ?? 1}</div>
          <div className="text-sm text-zinc-400 mt-2">
            {progress?.xp ?? 0} XP totales
          </div>
        </div>
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6">
          <div className="text-xs uppercase text-zinc-500">Racha actual</div>
          <div className="text-5xl font-bold mt-2">
            🔥 {progress?.current_streak_days ?? 0}
          </div>
          <div className="text-sm text-zinc-400 mt-2">
            Mejor: {progress?.longest_streak_days ?? 0} días
          </div>
        </div>
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-6">
          <div className="text-xs uppercase text-zinc-500">Posición</div>
          <div className="text-5xl font-bold mt-2 flex items-center gap-2">
            <Crown className="w-8 h-8 text-yellow-400" />
            #{lb?.my_position ?? '—'}
          </div>
          <div className="text-sm text-zinc-400 mt-2">En el gym</div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Badges</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {(badges?.items ?? []).map((b: any) => (
            <div
              key={b.code}
              className={
                b.earned
                  ? 'bg-gradient-to-br from-blue-600/20 to-yellow-600/10 border border-blue-500/40 rounded-xl p-4 text-center'
                  : 'bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-center opacity-50'
              }
            >
              <Trophy
                className={
                  b.earned
                    ? 'w-8 h-8 mx-auto mb-2 text-yellow-400'
                    : 'w-8 h-8 mx-auto mb-2 text-zinc-600'
                }
              />
              <div className="font-medium text-sm">{b.name}</div>
              <div className="text-xs text-zinc-500 mt-1">
                {b.earned ? `+${b.xp_reward} XP` : `${b.progress_pct ?? 0}%`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Leaderboard (Top 10)</h2>
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden">
          {(lb?.items ?? []).slice(0, 10).map((row: any, i: number) => (
            <div
              key={row.user_id}
              className={
                row.is_me
                  ? 'flex items-center justify-between px-5 py-3 border-b border-zinc-800 last:border-0 bg-blue-500/10'
                  : 'flex items-center justify-between px-5 py-3 border-b border-zinc-800 last:border-0'
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    i < 3
                      ? 'w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-blue-500 flex items-center justify-center font-bold text-sm'
                      : 'w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm'
                  }
                >
                  {i + 1}
                </span>
                <span className="font-medium">{row.name}</span>
              </div>
              <div className="text-sm text-zinc-400">
                Nivel {row.level} · {row.xp.toLocaleString()} XP
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
