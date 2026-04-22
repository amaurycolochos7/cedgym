'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Download, Star } from 'lucide-react';
import { api } from '@/lib/api';

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none min-h-[44px]';

export default function RutinaViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [activeWeek, setActiveWeek] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'purchase', id],
    queryFn: async () => (await api.get(`/products/me/purchases/${id}`)).data,
  });

  const download = useMutation({
    mutationFn: async () =>
      (await api.post(`/products/me/purchases/${id}/download`)).data,
    onSuccess: (data) => {
      if (data?.url) window.open(data.url, '_blank');
      if (data?.base64) {
        const blob = b64toBlob(data.base64, 'application/pdf');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    },
  });

  if (isLoading) return <div className="text-slate-500">Cargando rutina…</div>;
  if (!data) return <div className="text-rose-600">No se pudo cargar esta rutina.</div>;

  const product = data.product ?? {};
  const weeks: any[] = data.content?.weeks ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">{product.title}</h1>
        <p className="text-slate-500 mt-1">
          {product.level} · {product.duration_weeks} semanas · Autor: {product.author?.name}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button type="button" className={BTN_PRIMARY} onClick={() => download.mutate()} disabled={download.isPending}>
          <Download className="w-4 h-4" />
          {download.isPending ? 'Preparando…' : 'Descargar PDF'}
        </button>
        <button type="button" className={BTN_GHOST} onClick={() => alert('Ver reseña: pendiente.')}>
          <Star className="w-4 h-4" />
          Escribir reseña
        </button>
      </div>

      {weeks.length > 0 ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {weeks.map((w, i) => (
              <button
                key={i}
                onClick={() => setActiveWeek(i)}
                className={
                  activeWeek === i
                    ? 'px-4 py-2 rounded-lg bg-blue-600 text-white shrink-0 font-medium shadow-sm'
                    : 'px-4 py-2 rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-50 text-slate-700 shrink-0'
                }
              >
                Semana {i + 1}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {(weeks[activeWeek]?.days ?? []).map((d: any, di: number) => (
              <div
                key={di}
                className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl p-5"
              >
                <h3 className="font-semibold mb-3 text-slate-900">
                  Día {di + 1} · {d.title ?? 'Entrenamiento'}
                </h3>
                <ul className="space-y-2">
                  {(d.exercises ?? []).map((ex: any, ei: number) => (
                    <li
                      key={ei}
                      className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{ex.name}</div>
                        <div className="text-xs text-slate-500">{ex.notes}</div>
                      </div>
                      <div className="text-sm text-blue-700 font-mono tabular-nums px-2 py-0.5 rounded-md bg-blue-50 ring-1 ring-blue-200">
                        {ex.sets}×{ex.reps}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl p-6 text-slate-600">
          Esta rutina viene en formato PDF. Usa "Descargar PDF" arriba.
        </div>
      )}
    </div>
  );
}

function b64toBlob(b64: string, type: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
