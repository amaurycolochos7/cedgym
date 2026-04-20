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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
    mutationFn: ({ sku, patch }: { sku: string; patch: Partial<InventoryItem> }) =>
      adminApi.updateInventoryItem(sku, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
    },
    onError: () => toast.error('No se pudo actualizar'),
  });

  // The backend doesn't expose a DELETE on inventory; we soft-delete
  // by disabling + zeroing stock so the item stops appearing in POS.
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Inventario POS
          </h2>
          <p className="text-xs text-white/50">
            Suplementos, agua, toallas y extras que se venden en caja.
            {lowStockCount > 0 && (
              <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                {lowStockCount} con stock bajo
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            Nuevo ítem
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar SKU, nombre o categoría"
            className="w-72 pl-9"
          />
        </div>
        <Select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="w-48"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-white/50">
          {filtered.length} ítems
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Precio</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Mín.</th>
              <th className="px-3 py-2">Activo</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-xs text-white/40"
                >
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-xs text-white/40"
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
                  className="border-t border-white/5 text-white/80"
                >
                  <td className="px-3 py-2 font-mono text-xs text-white/60">
                    {it.sku}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      defaultValue={it.name}
                      onBlur={(e) => {
                        if (e.target.value !== it.name) {
                          upd.mutate({
                            sku: it.sku,
                            patch: { name: e.target.value },
                          });
                        }
                      }}
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
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
                      className="h-8 w-32"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
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
                      className="h-8 w-24"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setAdjust(it)}
                      className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5"
                    >
                      <span
                        className={
                          low ? 'font-semibold text-red-300' : 'text-white'
                        }
                      >
                        {it.stock}
                      </span>
                      {low && <AlertTriangle className="h-3 w-3 text-red-300" />}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Input
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
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={it.enabled}
                      onChange={(e) =>
                        upd.mutate({
                          sku: it.sku,
                          patch: { enabled: e.target.checked },
                        })
                      }
                      className="accent-brand-orange"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdjust(it)}
                    >
                      Ajustar stock
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(it)}
                      className="text-red-300 hover:text-red-200"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo ítem de inventario</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-white/60">SKU</label>
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder="BOTELLA-600"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">Nombre</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Botella de agua 600ml"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Categoría
            </label>
            <Input
              value={form.category ?? ''}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value })
              }
              placeholder="Bebidas"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">Precio</label>
            <Input
              type="number"
              value={form.price_mxn}
              onChange={(e) =>
                setForm({ ...form, price_mxn: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Costo (opcional)
            </label>
            <Input
              type="number"
              value={form.cost_mxn ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  cost_mxn:
                    e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Stock inicial
            </label>
            <Input
              type="number"
              value={form.stock}
              onChange={(e) =>
                setForm({ ...form, stock: Number(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Stock mínimo
            </label>
            <Input
              type="number"
              value={form.min_stock ?? 0}
              onChange={(e) =>
                setForm({ ...form, min_stock: Number(e.target.value) || 0 })
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mut.mutate()}
            loading={mut.isPending}
            disabled={!form.sku || !form.name}
          >
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
 * Adjust stock dialog (popover-like)
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar stock — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDelta((d) => d - 1)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value) || 0)}
              className="text-center"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDelta((d) => d + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-xs text-white/60">
            Stock actual:{' '}
            <span className="text-white">{item?.stock ?? 0}</span> · Nuevo:{' '}
            <span
              className={
                newStock < 0
                  ? 'font-semibold text-red-300'
                  : 'font-semibold text-emerald-300'
              }
            >
              {newStock}
            </span>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">Razón</label>
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {ADJUST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
          {reason === 'otro' && (
            <Input
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Especifica la razón"
            />
          )}
          {newStock < 0 && (
            <Badge variant="danger">
              Stock resultante negativo — revisa la cantidad
            </Badge>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => mut.mutate()}
            loading={mut.isPending}
            disabled={delta === 0}
          >
            Aplicar
          </Button>
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
