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
        <h1 className="font-display text-3xl font-bold text-slate-900">Mis mediciones</h1>
        <p className="text-slate-500 mt-1">Progreso corporal tomado por tu entrenador.</p>
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
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-8 text-center">
          <Ruler className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">
            Aún no tienes mediciones. Agenda con tu entrenador.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Peso (kg)</th>
                <th className="px-4 py-3 font-semibold">% Grasa</th>
                <th className="px-4 py-3 font-semibold">Cintura</th>
                <th className="px-4 py-3 font-semibold">Notas</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m: any) => (
                <tr key={m.id} className="border-t border-slate-200 text-slate-900">
                  <td className="px-4 py-3">{m.measured_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3 tabular-nums">{m.weight_kg ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{m.body_fat_pct ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums">{m.waist_cm ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 truncate max-w-xs">
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
    <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="flex items-baseline gap-2 mt-2">
        <span className={`text-2xl font-bold tabular-nums ${neutral ? 'text-slate-900' : positive ? 'text-emerald-600' : 'text-amber-600'}`}>
          {value > 0 ? '+' : ''}{value}
        </span>
        <span className="text-slate-500">{unit}</span>
        {!neutral && <Icon className="w-4 h-4 text-slate-400 ml-auto" />}
      </div>
    </div>
  );
}
