'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function AdminPromocodesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: '', type: 'PERCENTAGE', value: 10, applies_to: ['MEMBERSHIP'], max_uses: '', expires_at: ''
  });

  const { data } = useQuery({
    queryKey: ['promocodes'],
    queryFn: async () => (await api.get('/admin/promocodes')).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/admin/promocodes', {
      ...form,
      value: Number(form.value),
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at || null,
    })).data,
    onSuccess: () => {
      setCreating(false);
      qc.invalidateQueries({ queryKey: ['promocodes'] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/promocodes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promocodes'] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Códigos promocionales</h1>
          <p className="text-zinc-400 mt-1">Descuentos aplicables a membresías, cursos o rutinas.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo código
        </Button>
      </div>

      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50">
            <tr className="text-left">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Usos</th>
              <th className="px-4 py-3">Expira</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                Sin códigos. Crea el primero.
              </td></tr>
            ) : items.map((p: any) => (
              <tr key={p.id} className="border-t border-zinc-800">
                <td className="px-4 py-3 font-mono text-blue-400">{p.code}</td>
                <td className="px-4 py-3">{p.type}</td>
                <td className="px-4 py-3">
                  {p.type === 'PERCENTAGE' ? `${p.value}%` : `$${p.value}`}
                </td>
                <td className="px-4 py-3">{p.used_count}/{p.max_uses ?? '∞'}</td>
                <td className="px-4 py-3 text-zinc-400">{p.expires_at?.slice(0, 10) ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => del.mutate(p.id)}>
                    <Trash2 className="w-4 h-4 text-zinc-500 hover:text-red-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-3">
            <h3 className="text-xl font-bold">Nuevo código</h3>
            <input
              placeholder="CODIGO"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 font-mono"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            >
              <option value="PERCENTAGE">Porcentaje (%)</option>
              <option value="FIXED_AMOUNT">Monto fijo (MXN)</option>
            </select>
            <input
              type="number"
              placeholder="Valor"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            />
            <input
              type="number"
              placeholder="Máximo de usos (opcional)"
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            />
            <input
              type="date"
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>Crear</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
