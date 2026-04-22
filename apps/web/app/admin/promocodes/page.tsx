'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Trash2, Pencil, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { api, normalizeError } from '@/lib/api';
import type { ApiError } from '@/lib/schemas';

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';
const LABEL_CLS = 'block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5';

const APPLIES_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Todo' },
  { value: 'MEMBERSHIP', label: 'Membresía' },
  { value: 'PRODUCT', label: 'Producto' },
  { value: 'COURSE', label: 'Curso' },
];

type PromoType = 'PERCENTAGE' | 'FIXED_AMOUNT';

type FormState = {
  code: string;
  type: PromoType;
  value: number;
  applies_to: string[];
  min_amount_mxn: string;
  max_uses: string;
  expires_at: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  code: '',
  type: 'PERCENTAGE',
  value: 10,
  applies_to: ['ALL'],
  min_amount_mxn: '',
  max_uses: '',
  expires_at: '',
  enabled: true,
};

const CODE_REGEX = /^[A-Z0-9-]+$/;

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
      {label && (
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      )}
    </label>
  );
}

function StatusPill({ item }: { item: any }) {
  const now = Date.now();
  const expired =
    item.expires_at && new Date(item.expires_at).getTime() < now;
  const exhausted =
    item.max_uses != null && (item.used_count ?? 0) >= item.max_uses;

  if (expired || exhausted) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        Agotado
      </span>
    );
  }
  if (item.enabled === false) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Pausado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
      Activo
    </span>
  );
}

export default function AdminPromocodesPage() {
  const qc = useQueryClient();
  const [modalMode, setModalMode] = useState<'closed' | 'create' | 'edit'>(
    'closed',
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['promocodes'],
    queryFn: async () => (await api.get('/admin/promocodes')).data,
  });

  const buildPayload = () => {
    // Backend zod schema rejects `null` on optional fields — omit them
    // instead of sending null so the request actually validates.
    const appliesTo =
      form.applies_to.length === 0 ? ['ALL'] : form.applies_to;
    const payload: Record<string, unknown> = {
      code: form.code,
      type: form.type,
      value: Number(form.value),
      applies_to: appliesTo,
      enabled: form.enabled,
    };
    if (form.min_amount_mxn) payload.min_amount_mxn = Number(form.min_amount_mxn);
    if (form.max_uses) payload.max_uses = Number(form.max_uses);
    if (form.expires_at) payload.expires_at = form.expires_at;
    return payload;
  };

  const create = useMutation({
    mutationFn: async () => (await api.post('/admin/promocodes', buildPayload())).data,
    onSuccess: () => {
      toast.success('Código creado.');
      closeModal();
      qc.invalidateQueries({ queryKey: ['promocodes'] });
    },
    onError: (e) => {
      const msg = (normalizeError(e) as ApiError)?.message || 'No pudimos crear el código.';
      setError(msg);
      toast.error(msg);
    },
  });

  const update = useMutation({
    mutationFn: async () =>
      (await api.patch(`/admin/promocodes/${editingId}`, buildPayload())).data,
    onSuccess: () => {
      toast.success('Código actualizado.');
      closeModal();
      qc.invalidateQueries({ queryKey: ['promocodes'] });
    },
    onError: (e) => {
      const msg = (normalizeError(e) as ApiError)?.message || 'No pudimos guardar el código.';
      setError(msg);
      toast.error(msg);
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/promocodes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promocodes'] }),
    onError: (e) => {
      const msg = (normalizeError(e) as ApiError)?.message || 'No pudimos borrar el código.';
      toast.error(msg);
    },
  });

  // Backend responds with `{ promocodes: [...] }`. Fall back to `items`
  // in case an older build is still being served during the deploy.
  const items = data?.promocodes ?? data?.items ?? [];

  const closeModal = () => {
    setModalMode('closed');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
    setModalMode('create');
  };

  const openEdit = (item: any) => {
    setForm({
      code: item.code ?? '',
      type: (item.type as PromoType) ?? 'PERCENTAGE',
      value: Number(item.value ?? 0),
      applies_to:
        Array.isArray(item.applies_to) && item.applies_to.length > 0
          ? item.applies_to
          : ['ALL'],
      min_amount_mxn:
        item.min_amount_mxn != null ? String(item.min_amount_mxn) : '',
      max_uses: item.max_uses != null ? String(item.max_uses) : '',
      expires_at: item.expires_at ? String(item.expires_at).slice(0, 10) : '',
      enabled: item.enabled !== false,
    });
    setEditingId(item.id);
    setError(null);
    setModalMode('edit');
  };

  const applyPreset100 = () => {
    setForm({
      code: 'TEST100',
      type: 'PERCENTAGE',
      value: 100,
      applies_to: ['MEMBERSHIP'],
      min_amount_mxn: '',
      max_uses: '5',
      expires_at: '',
      enabled: true,
    });
    setError(null);
  };

  const toggleApply = (value: string) => {
    setForm((f) => {
      // If clicking ALL, reset to just ['ALL']
      if (value === 'ALL') {
        return { ...f, applies_to: ['ALL'] };
      }
      // Clicking any other: remove ALL if present
      const withoutAll = f.applies_to.filter((v) => v !== 'ALL');
      const has = withoutAll.includes(value);
      const next = has
        ? withoutAll.filter((v) => v !== value)
        : [...withoutAll, value];
      return { ...f, applies_to: next.length === 0 ? ['ALL'] : next };
    });
  };

  const allSelected = form.applies_to.includes('ALL');

  const validate = (): string | null => {
    if (!form.code.trim()) return 'El código es obligatorio.';
    if (!CODE_REGEX.test(form.code))
      return 'El código sólo admite letras, números y guiones (mayúsculas).';
    if (form.type === 'PERCENTAGE') {
      if (!(form.value >= 1 && form.value <= 100))
        return 'Para porcentaje, el valor debe estar entre 1 y 100.';
    } else {
      if (!(form.value > 0))
        return 'Para monto fijo, el valor debe ser mayor a 0.';
    }
    if (form.max_uses && Number(form.max_uses) <= 0)
      return 'El máximo de usos debe ser mayor a 0 (o vacío para ilimitado).';
    if (form.min_amount_mxn && Number(form.min_amount_mxn) < 0)
      return 'El monto mínimo no puede ser negativo.';
    return null;
  };

  const handleSubmit = () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (modalMode === 'create') create.mutate();
    else if (modalMode === 'edit') update.mutate();
  };

  const submitting = create.isPending || update.isPending;
  const modalOpen = modalMode !== 'closed';

  const appliesLabel = (list: string[] | undefined) => {
    if (!list || list.length === 0 || list.includes('ALL')) return 'Todo';
    return list
      .map((v) => APPLIES_OPTIONS.find((o) => o.value === v)?.label ?? v)
      .join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Códigos promocionales
          </h1>
          <p className="text-slate-600 mt-1">
            Descuentos aplicables a membresías, cursos o rutinas.
          </p>
        </div>
        <button type="button" onClick={openCreate} className={BTN_PRIMARY}>
          <Plus className="w-4 h-4" /> Nuevo código
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Código
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Valor
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Aplica a
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Usos
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Expira
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Sin códigos. Crea el primero.
                  </td>
                </tr>
              ) : (
                items.map((p: any) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3.5 font-mono font-semibold text-blue-600">
                      {p.code}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{p.type}</td>
                    <td className="px-4 py-3.5 text-slate-900 font-semibold">
                      {p.type === 'PERCENTAGE' ? `${p.value}%` : `$${p.value}`}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {appliesLabel(p.applies_to)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      {p.used_count ?? 0}/{p.max_uses ?? '∞'}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {p.expires_at?.slice(0, 10) ?? '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusPill item={p} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                          aria-label="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => del.mutate(p.id)}
                          className="inline-flex items-center rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/75 backdrop-blur-md z-[90] flex items-end sm:items-center justify-center sm:p-4"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full h-[100dvh] overflow-y-auto p-5 sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:p-6 sm:max-w-lg sm:border sm:border-slate-200 sm:shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">
                {modalMode === 'create' ? 'Nuevo código' : 'Editar código'}
              </h3>
            </div>

            {modalMode === 'create' && (
              <button
                type="button"
                onClick={applyPreset100}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
              >
                <FlaskConical className="w-4 h-4" /> Preset 100% prueba
              </button>
            )}

            <div>
              <label className={LABEL_CLS}>Código</label>
              <input
                placeholder="CODIGO"
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                className={`${INPUT_CLS} font-mono tracking-wider`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as PromoType })
                  }
                  className={INPUT_CLS}
                >
                  <option value="PERCENTAGE">Porcentaje (%)</option>
                  <option value="FIXED_AMOUNT">Monto fijo (MXN)</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Valor</label>
                <input
                  type="number"
                  placeholder="Valor"
                  value={form.value}
                  onChange={(e) =>
                    setForm({ ...form, value: Number(e.target.value) })
                  }
                  className={INPUT_CLS}
                />
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Aplica a</label>
              <div className="flex flex-wrap gap-2">
                {APPLIES_OPTIONS.map((opt) => {
                  const active = form.applies_to.includes(opt.value);
                  const disabled = allSelected && opt.value !== 'ALL';
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleApply(opt.value)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      } ${
                        disabled
                          ? 'opacity-40 cursor-not-allowed hover:bg-slate-100'
                          : ''
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Si "Todo" está activo, aplica a cualquier compra.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Monto mínimo</label>
                <input
                  type="number"
                  placeholder="— sin mínimo —"
                  value={form.min_amount_mxn}
                  onChange={(e) =>
                    setForm({ ...form, min_amount_mxn: e.target.value })
                  }
                  className={INPUT_CLS}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Monto mínimo en MXN. Deja en blanco para no aplicar.
                </p>
              </div>
              <div>
                <label className={LABEL_CLS}>Máximo de usos</label>
                <input
                  type="number"
                  placeholder="Ilimitado"
                  value={form.max_uses}
                  onChange={(e) =>
                    setForm({ ...form, max_uses: e.target.value })
                  }
                  className={INPUT_CLS}
                />
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Expira</label>
              <input
                type="date"
                value={form.expires_at}
                onChange={(e) =>
                  setForm({ ...form, expires_at: e.target.value })
                }
                className={INPUT_CLS}
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <Toggle
                checked={form.enabled}
                onChange={(v) => setForm({ ...form, enabled: v })}
                label="Activo"
              />
              <span className="text-xs text-slate-500">
                {form.enabled ? 'Los usuarios pueden canjearlo' : 'Pausado'}
              </span>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={closeModal}
                className={BTN_SECONDARY}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className={BTN_PRIMARY}
              >
                {submitting
                  ? modalMode === 'create'
                    ? 'Creando…'
                    : 'Guardando…'
                  : modalMode === 'create'
                    ? 'Crear'
                    : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
