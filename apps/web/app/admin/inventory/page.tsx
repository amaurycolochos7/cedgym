'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Download,
  Minus,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { adminApi, type InventoryItem } from '@/lib/admin-api';

const ADJUST_REASONS = [
  'compra',
  'merma',
  'devolucion',
  'conteo',
  'venta',
  'otro',
];

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const INPUT_CLS_SM =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';

export default function AdminInventoryPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'inventory'],
    queryFn: adminApi.listInventory,
  });

  const [newOpen, setNewOpen] = React.useState(false);
  const [adjust, setAdjust] = React.useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<InventoryItem | null>(
    null,
  );
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState<string>('');

  const items = data ?? [];

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.category) set.add(i.category);
    return [...set].sort();
  }, [items]);

  const filtered = React.useMemo(() => {
    return items.filter((i) => {
      if (cat && i.category !== cat) return false;
      if (!q.trim()) return true;
      const n = q.trim().toLowerCase();
      return (
        i.sku?.toLowerCase().includes(n) ||
        i.name?.toLowerCase().includes(n) ||
        i.category?.toLowerCase().includes(n)
      );
    });
  }, [items, q, cat]);

  const lowStockCount = items.filter(
    (i) => typeof i.min_stock === 'number' && i.stock <= (i.min_stock ?? 0),
  ).length;

  const upd = useMutation({
    mutationFn: ({
      sku,
      patch,
    }: {
      sku: string;
      patch: Partial<InventoryItem>;
    }) => adminApi.updateInventoryItem(sku, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
    },
    onError: () => toast.error('No se pudo actualizar'),
  });

  const softDelete = useMutation({
    mutationFn: async (it: InventoryItem) => {
      await adminApi.updateInventoryItem(it.sku, { enabled: false });
    },
    onSuccess: () => {
      toast.success('Ítem desactivado');
      qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
    },
    onError: () => toast.error('No se pudo desactivar'),
  });

  function exportCsv() {
    const header = [
      'sku',
      'name',
      'category',
      'price_mxn',
      'cost_mxn',
      'stock',
      'min_stock',
      'enabled',
    ];
    const rows = filtered.map((i) =>
      [
        i.sku,
        csvEscape(i.name),
        csvEscape(i.category ?? ''),
        i.price_mxn,
        i.cost_mxn ?? '',
        i.stock,
        i.min_stock ?? '',
        i.enabled ? '1' : '0',
      ].join(','),
    );
    const csv = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Inventario POS
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Suplementos, agua, toallas y extras que se venden en caja.
            {lowStockCount > 0 && (
              <span className="ml-2 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                {lowStockCount} con stock bajo
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={exportCsv} className={BTN_SECONDARY}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className={BTN_PRIMARY}
          >
            <Plus className="h-4 w-4" />
            Nuevo ítem
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar SKU, nombre o categoría"
            className={`${INPUT_CLS} w-72 pl-9`}
          />
        </div>
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className={`${INPUT_CLS} w-48`}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length} ítems
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-700">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Categoría
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Precio
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Stock
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Mín.
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Activo
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-xs text-slate-500"
                  >
                    Cargando…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-6 text-center text-xs text-slate-500"
                  >
                    Sin ítems.
                  </td>
                </tr>
              )}
              {filtered.map((it) => {
                const low =
                  typeof it.min_stock === 'number' &&
                  it.stock <= (it.min_stock ?? 0);
                return (
                  <tr
                    key={it.sku}
                    className="border-t border-slate-200 text-slate-700"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {it.sku}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        defaultValue={it.name}
                        onBlur={(e) => {
                          if (e.target.value !== it.name) {
                            upd.mutate({
                              sku: it.sku,
                              patch: { name: e.target.value },
                            });
                          }
                        }}
                        className={INPUT_CLS_SM}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        defaultValue={it.category ?? ''}
                        onBlur={(e) => {
                          const v = e.target.value || null;
                          if (v !== (it.category ?? null)) {
                            upd.mutate({
                              sku: it.sku,
                              patch: { category: v ?? undefined },
                            });
                          }
                        }}
                        className={`${INPUT_CLS_SM} w-32`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        defaultValue={it.price_mxn}
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0;
                          if (v !== it.price_mxn) {
                            upd.mutate({
                              sku: it.sku,
                              patch: { price_mxn: v },
                            });
                          }
                        }}
                        className={`${INPUT_CLS_SM} w-24`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setAdjust(it)}
                        className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100"
                      >
                        <span
                          className={
                            low
                              ? 'font-semibold text-rose-600'
                              : 'text-slate-900'
                          }
                        >
                          {it.stock}
                        </span>
                        {low && (
                          <AlertTriangle className="h-3 w-3 text-rose-600" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        defaultValue={it.min_stock ?? 0}
                        onBlur={(e) => {
                          const v = Number(e.target.value) || 0;
                          if (v !== (it.min_stock ?? 0)) {
                            upd.mutate({
                              sku: it.sku,
                              patch: { min_stock: v },
                            });
                          }
                        }}
                        className={`${INPUT_CLS_SM} w-20`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={it.enabled}
                        onChange={(e) =>
                          upd.mutate({
                            sku: it.sku,
                            patch: { enabled: e.target.checked },
                          })
                        }
                        className="accent-blue-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setAdjust(it)}
                          className={BTN_SECONDARY}
                        >
                          Ajustar stock
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(it)}
                          className="inline-flex items-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <NewItemDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ['admin', 'inventory'] })
        }
      />

      <AdjustDialog
        item={adjust}
        onClose={() => setAdjust(null)}
        onDone={() =>
          qc.invalidateQueries({ queryKey: ['admin', 'inventory'] })
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Desactivar "${deleteTarget?.name ?? ''}"`}
        description="El ítem dejará de aparecer en el POS. Puedes reactivarlo luego con el checkbox de 'Activo'."
        confirmLabel="Desactivar"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return;
          await softDelete.mutateAsync(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

/* =========================================================================
 * New item dialog
 * =========================================================================*/

function NewItemDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState<Omit<InventoryItem, 'id'>>({
    sku: '',
    name: '',
    category: '',
    price_mxn: 0,
    cost_mxn: null,
    stock: 0,
    min_stock: 5,
    enabled: true,
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        sku: '',
        name: '',
        category: '',
        price_mxn: 0,
        cost_mxn: null,
        stock: 0,
        min_stock: 5,
        enabled: true,
      });
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () =>
      adminApi.createInventoryItem({
        ...form,
        category: form.category || null,
      }),
    onSuccess: () => {
      toast.success('Ítem creado');
      onCreated();
      onOpenChange(false);
    },
    onError: () => toast.error('No se pudo crear'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            Nuevo ítem de inventario
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              SKU
            </label>
            <input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="BOTELLA-600"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Nombre
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Botella de agua 600ml"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Categoría
            </label>
            <input
              value={form.category ?? ''}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
              placeholder="Bebidas"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Precio
            </label>
            <input
              type="number"
              value={form.price_mxn}
              onChange={(e) =>
                setForm({ ...form, price_mxn: Number(e.target.value) || 0 })
              }
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Costo (opcional)
            </label>
            <input
              type="number"
              value={form.cost_mxn ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  cost_mxn:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Stock inicial
            </label>
            <input
              type="number"
              value={form.stock}
              onChange={(e) =>
                setForm({ ...form, stock: Number(e.target.value) || 0 })
              }
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Stock mínimo
            </label>
            <input
              type="number"
              value={form.min_stock ?? 0}
              onChange={(e) =>
                setForm({
                  ...form,
                  min_stock: Number(e.target.value) || 0,
                })
              }
              className={INPUT_CLS}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={BTN_SECONDARY}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.sku || !form.name}
            className={BTN_PRIMARY}
          >
            {mut.isPending ? 'Creando…' : 'Crear'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
 * Adjust stock dialog
 * =========================================================================*/

function AdjustDialog({
  item,
  onClose,
  onDone,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [delta, setDelta] = React.useState(1);
  const [reason, setReason] = React.useState('compra');
  const [customReason, setCustomReason] = React.useState('');

  React.useEffect(() => {
    if (item) {
      setDelta(1);
      setReason('compra');
      setCustomReason('');
    }
  }, [item]);

  const mut = useMutation({
    mutationFn: () => {
      const finalReason =
        reason === 'otro' ? customReason || 'otro' : reason;
      return adminApi.adjustStock(item!.sku, delta, finalReason);
    },
    onSuccess: () => {
      toast.success('Stock ajustado');
      onDone();
      onClose();
    },
    onError: () => toast.error('No se pudo ajustar'),
  });

  const newStock = item ? item.stock + delta : 0;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            Ajustar stock — {item?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDelta((d) => d - 1)}
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="number"
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value) || 0)}
              className={`${INPUT_CLS} text-center`}
            />
            <button
              type="button"
              onClick={() => setDelta((d) => d + 1)}
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-2 text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-slate-600">
            Stock actual:{' '}
            <span className="text-slate-900">{item?.stock ?? 0}</span> · Nuevo:{' '}
            <span
              className={
                newStock < 0
                  ? 'font-semibold text-rose-600'
                  : 'font-semibold text-emerald-700'
              }
            >
              {newStock}
            </span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Razón
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={INPUT_CLS}
            >
              {ADJUST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {reason === 'otro' && (
            <input
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Especifica la razón"
              className={INPUT_CLS}
            />
          )}
          {newStock < 0 && (
            <div className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
              Stock resultante negativo — revisa la cantidad
            </div>
          )}
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || delta === 0}
            className={BTN_PRIMARY}
          >
            {mut.isPending ? 'Aplicando…' : 'Aplicar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
 * Utilities
 * =========================================================================*/

function csvEscape(s: string | number | null | undefined) {
  const v = String(s ?? '');
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
