'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Save, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

const VARIABLES = [
  '{nombre}', '{plan}', '{vence_en}', '{fecha_venc}', '{precio}', '{precio_desc}',
  '{descuento}', '{link_pago}', '{link_portal}', '{gym}', '{qr_url}', '{coach}',
  '{clase}', '{curso}', '{producto}', '{badge}', '{xp}', '{days}', '{code}',
];

export default function AdminTemplatesPage() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<any>(null);
  const [preview, setPreview] = useState<string>('');

  const { data } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/admin/templates')).data,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (sel?.id) {
        return (await api.patch(`/admin/templates/${sel.id}`, sel)).data;
      }
      return (await api.post('/admin/templates', sel)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const doPreview = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/templates/${sel.id}/preview`, { context: {} })).data,
    onSuccess: (d) => setPreview(d.rendered ?? ''),
  });

  const insertVar = (v: string) => {
    if (!sel) return;
    setSel({ ...sel, body: (sel.body ?? '') + v });
  };

  const items = data?.items ?? [];

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-6">
      <aside className="bg-zinc-900/70 border border-zinc-800 rounded-xl">
        <div className="p-3 border-b border-zinc-800 flex justify-between">
          <h3 className="font-semibold text-sm">Templates</h3>
          <button
            onClick={() =>
              setSel({ code: '', name: '', channel: 'whatsapp', body: '' })
            }
            className="text-orange-400 hover:text-orange-300"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {items.map((t: any) => (
            <button
              key={t.id}
              onClick={() => { setSel(t); setPreview(''); }}
              className={
                sel?.id === t.id
                  ? 'w-full text-left p-3 border-b border-zinc-800 bg-orange-500/10'
                  : 'w-full text-left p-3 border-b border-zinc-800 hover:bg-zinc-800/60'
              }
            >
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-xs text-zinc-500 font-mono">{t.code}</div>
            </button>
          ))}
        </div>
      </aside>

      <section>
        {!sel ? (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-12 text-center text-zinc-500">
            Selecciona un template o crea uno nuevo.
          </div>
        ) : (
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <input
                value={sel.code}
                onChange={(e) => setSel({ ...sel, code: e.target.value })}
                placeholder="CODE_UNICO"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm"
              />
              <input
                value={sel.name}
                onChange={(e) => setSel({ ...sel, name: e.target.value })}
                placeholder="Nombre descriptivo"
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
              />
              <select
                value={sel.channel ?? 'whatsapp'}
                onChange={(e) => setSel({ ...sel, channel: e.target.value })}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="push">Push</option>
                <option value="email">Email</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-zinc-400">Cuerpo</label>
              <textarea
                value={sel.body ?? ''}
                onChange={(e) => setSel({ ...sel, body: e.target.value })}
                rows={8}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400">Variables (click para insertar)</label>
              <div className="mt-2 flex flex-wrap gap-1">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    onClick={() => insertVar(v)}
                    className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-orange-300 font-mono"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="w-4 h-4 mr-2" /> Guardar
              </Button>
              {sel.id && (
                <Button variant="ghost" onClick={() => doPreview.mutate()}>
                  <Eye className="w-4 h-4 mr-2" /> Preview
                </Button>
              )}
            </div>

            {preview && (
              <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-4 whitespace-pre-wrap text-sm">
                {preview}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
