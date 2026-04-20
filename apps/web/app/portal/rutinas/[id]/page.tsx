'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Download, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

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

  if (isLoading) return <div className="text-zinc-400">Cargando rutina…</div>;
  if (!data) return <div className="text-red-400">No se pudo cargar esta rutina.</div>;

  const product = data.product ?? {};
  const weeks: any[] = data.content?.weeks ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{product.title}</h1>
        <p className="text-zinc-400 mt-1">
          {product.level} · {product.duration_weeks} semanas · Autor: {product.author?.name}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => download.mutate()} disabled={download.isPending}>
          <Download className="w-4 h-4 mr-2" />
          {download.isPending ? 'Preparando…' : 'Descargar PDF'}
        </Button>
        <Button variant="ghost" onClick={() => alert('Ver reseña: pendiente.')}>
          <Star className="w-4 h-4 mr-2" />
          Escribir reseña
        </Button>
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
                    ? 'px-4 py-2 rounded-lg bg-orange-600 text-white shrink-0'
                    : 'px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 shrink-0'
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
                className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5"
              >
                <h3 className="font-semibold mb-3">
                  Día {di + 1} · {d.title ?? 'Entrenamiento'}
                </h3>
                <ul className="space-y-2">
                  {(d.exercises ?? []).map((ex: any, ei: number) => (
                    <li
                      key={ei}
                      className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0"
                    >
                      <div>
                        <div className="font-medium">{ex.name}</div>
                        <div className="text-xs text-zinc-500">{ex.notes}</div>
                      </div>
                      <div className="text-sm text-orange-400">
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
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-6 text-zinc-400">
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
