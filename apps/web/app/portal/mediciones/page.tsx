'use client';

import { useQuery } from '@tanstack/react-query';
import { Ruler, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';

export default function PortalMedicionesPage() {
  const { data } = useQuery({
    queryKey: ['measurements', 'me'],
    queryFn: async () => (await api.get('/measurements/me')).data,
  });

  const { data: progress } = useQuery({
    queryKey: ['measurements', 'me', 'progress'],
    queryFn: async () => (await api.get('/measurements/me/progress')).data,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mis mediciones</h1>
        <p className="text-zinc-400 mt-1">Progreso corporal tomado por tu entrenador.</p>
      </div>

      {progress?.has_data && (
        <div className="grid md:grid-cols-3 gap-4">
          <DeltaCard
            label="Peso"
            delta={progress.weight_delta_kg}
            unit="kg"
            inverted
          />
          <DeltaCard
            label="% Grasa"
            delta={progress.body_fat_delta_pct}
            unit="%"
            inverted
          />
          <DeltaCard
            label="Mediciones"
            delta={progress.measurement_count}
            unit=""
            neutral
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 text-center">
          <Ruler className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400">
            Aún no tienes mediciones. Agenda con tu entrenador.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50">
              <tr className="text-left">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Peso (kg)</th>
                <th className="px-4 py-3">% Grasa</th>
                <th className="px-4 py-3">Cintura</th>
                <th className="px-4 py-3">Notas</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m: any) => (
                <tr key={m.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">{m.measured_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3">{m.weight_kg ?? '—'}</td>
                  <td className="px-4 py-3">{m.body_fat_pct ?? '—'}</td>
                  <td className="px-4 py-3">{m.waist_cm ?? '—'}</td>
                  <td className="px-4 py-3 text-zinc-500 truncate max-w-xs">
                    {m.notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeltaCard({ label, delta, unit, inverted, neutral }: any) {
  const value = typeof delta === 'number' ? delta : 0;
  const positive = neutral ? false : inverted ? value < 0 : value > 0;
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  return (
    <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className={neutral ? 'text-2xl font-bold' : positive ? 'text-2xl font-bold text-emerald-400' : 'text-2xl font-bold text-amber-400'}>
          {value > 0 ? '+' : ''}{value}
        </span>
        <span className="text-zinc-500">{unit}</span>
        {!neutral && <Icon className="w-4 h-4 text-zinc-500 ml-auto" />}
      </div>
    </div>
  );
}
