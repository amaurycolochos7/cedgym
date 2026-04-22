'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import {
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X as XIcon,
} from 'lucide-react';
import * as XLSX from 'xlsx';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/admin/data-table';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import {
  adminApi,
  type AdminExercise,
  type AdminExerciseInput,
  type ExerciseLevel,
  type ExerciseMuscleGroup,
  type ExerciseBulkImportResult,
} from '@/lib/admin-api';
import { cn } from '@/lib/utils';

// ─── Enums ───────────────────────────────────────────────────────
const MUSCLE_GROUPS: { value: ExerciseMuscleGroup; label: string }[] = [
  { value: 'CHEST', label: 'Pecho' },
  { value: 'BACK', label: 'Espalda' },
  { value: 'LEGS', label: 'Piernas' },
  { value: 'SHOULDERS', label: 'Hombros' },
  { value: 'ARMS', label: 'Brazos' },
  { value: 'CORE', label: 'Core' },
  { value: 'FULL_BODY', label: 'Full Body' },
  { value: 'CARDIO', label: 'Cardio' },
];

const LEVELS: { value: ExerciseLevel; label: string }[] = [
  { value: 'BEGINNER', label: 'Principiante' },
  { value: 'INTERMEDIATE', label: 'Intermedio' },
  { value: 'ADVANCED', label: 'Avanzado' },
];

const EQUIPMENT: string[] = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'bodyweight',
  'trx',
  'bike',
  'jump_rope',
  'kettlebell',
  'bench',
  'functional',
];

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';

// ─── Helpers ─────────────────────────────────────────────────────
function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function levelBadgeCls(level: ExerciseLevel) {
  if (level === 'BEGINNER')
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (level === 'INTERMEDIATE')
    return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-rose-100 text-rose-700 border-rose-200';
}

function muscleLabel(v: ExerciseMuscleGroup): string {
  return MUSCLE_GROUPS.find((m) => m.value === v)?.label ?? v;
}

function levelLabel(v: ExerciseLevel): string {
  return LEVELS.find((l) => l.value === v)?.label ?? v;
}

// =================================================================
// Page
// =================================================================
export default function AdminEjerciciosPage() {
  const qc = useQueryClient();

  const [filters, setFilters] = React.useState({
    q: '',
    muscle_group: '' as ExerciseMuscleGroup | '',
    level: '' as ExerciseLevel | '',
    equipment: [] as string[],
  });
  const [page, setPage] = React.useState(1);
  const limit = 50;

  const [editing, setEditing] = React.useState<AdminExercise | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminExercise | null>(
    null,
  );

  const listQuery = useQuery({
    queryKey: ['admin', 'exercises', filters, page],
    queryFn: () =>
      adminApi.listExercises({
        q: filters.q || undefined,
        muscle_group: filters.muscle_group || undefined,
        level: filters.level || undefined,
        equipment: filters.equipment.length
          ? filters.equipment.join(',')
          : undefined,
        page,
        limit,
      }),
  });

  const statsQuery = useQuery({
    queryKey: ['admin', 'exercises', 'stats'],
    queryFn: adminApi.getExerciseStats,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminApi.deleteExercise(id),
    onSuccess: () => {
      toast.success('Ejercicio eliminado');
      qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
    },
    onError: (err: { message?: string }) =>
      toast.error(err?.message ?? 'No se pudo eliminar'),
  });

  const columns = React.useMemo<ColumnDef<AdminExercise>[]>(
    () => [
      {
        header: 'Ejercicio',
        accessorKey: 'name',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-slate-900">
              {row.original.name}
            </div>
            <div className="text-[11px] text-slate-500">
              {row.original.slug}
            </div>
          </div>
        ),
      },
      {
        header: 'Grupo',
        accessorKey: 'muscle_group',
        cell: ({ row }) => (
          <span className="text-slate-700">
            {muscleLabel(row.original.muscle_group)}
          </span>
        ),
      },
      {
        header: 'Equipo',
        accessorKey: 'equipment',
        cell: ({ row }) => {
          const eq = row.original.equipment ?? [];
          if (eq.length === 0) return <span className="text-slate-400">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {eq.slice(0, 3).map((e) => (
                <span
                  key={e}
                  className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700"
                >
                  {e}
                </span>
              ))}
              {eq.length > 3 && (
                <span className="text-[10px] text-slate-500">
                  +{eq.length - 3}
                </span>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        header: 'Nivel',
        accessorKey: 'level',
        cell: ({ row }) => (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
              levelBadgeCls(row.original.level),
            )}
          >
            {levelLabel(row.original.level)}
          </span>
        ),
      },
      {
        header: 'Default',
        accessorKey: 'default_sets',
        cell: ({ row }) => (
          <span className="text-[11px] text-slate-600">
            {row.original.default_sets}×{row.original.default_reps} ·{' '}
            {row.original.default_rest_sec}s
          </span>
        ),
        enableSorting: false,
      },
      {
        header: 'Acciones',
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(row.original);
                setModalOpen(true);
              }}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(row.original);
              }}
              className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              aria-label="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [],
  );

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Biblioteca de Ejercicios
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              Total: {statsQuery.data?.total ?? total}
            </span>
            {statsQuery.data?.by_level &&
              LEVELS.map((l) => (
                <span
                  key={l.value}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                >
                  {l.label}: {statsQuery.data?.by_level[l.value] ?? 0}
                </span>
              ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className={BTN_SECONDARY}
          >
            <Upload className="h-3.5 w-3.5" />
            Importar Excel
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className={BTN_PRIMARY}
          >
            <Plus className="h-4 w-4" />
            Nuevo ejercicio
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            placeholder="Buscar por nombre o slug"
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
              setPage(1);
            }}
            className={INPUT_CLS}
          />
          <select
            value={filters.muscle_group}
            onChange={(e) => {
              setFilters({
                ...filters,
                muscle_group: e.target.value as ExerciseMuscleGroup | '',
              });
              setPage(1);
            }}
            className={INPUT_CLS}
          >
            <option value="">Grupo muscular</option>
            {MUSCLE_GROUPS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select
            value={filters.level}
            onChange={(e) => {
              setFilters({
                ...filters,
                level: e.target.value as ExerciseLevel | '',
              });
              setPage(1);
            }}
            className={INPUT_CLS}
          >
            <option value="">Nivel</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <EquipmentMultiSelect
            value={filters.equipment}
            onChange={(v) => {
              setFilters({ ...filters, equipment: v });
              setPage(1);
            }}
            compact
          />
        </div>
      </div>

      {/* Table */}
      <DataTable<AdminExercise>
        columns={columns}
        data={items}
        empty={
          listQuery.isLoading
            ? 'Cargando…'
            : 'Aún no hay ejercicios. Corre el seed o agrega manualmente.'
        }
      />

      {/* Server-side pagination */}
      {total > limit && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className={BTN_SECONDARY}
          >
            Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className={BTN_SECONDARY}
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modals */}
      <ExerciseFormDialog
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
        }}
      />

      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ['admin', 'exercises'] });
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title="Eliminar ejercicio"
        description={
          deleteTarget
            ? `Se marcará "${deleteTarget.name}" como inactivo. Esta acción es reversible.`
            : undefined
        }
        destructive
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (deleteTarget) await deleteMut.mutateAsync(deleteTarget.id);
        }}
      />
    </div>
  );
}

// =================================================================
// Equipment multi-select (chip picker)
// =================================================================
function EquipmentMultiSelect({
  value,
  onChange,
  compact = false,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function toggle(e: string) {
    if (value.includes(e)) onChange(value.filter((x) => x !== e));
    else onChange([...value, e]);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 text-left text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100',
          compact ? 'py-2.5' : 'py-3',
        )}
      >
        <span className={value.length ? 'text-slate-900' : 'text-slate-400'}>
          {value.length
            ? `${value.length} equipo${value.length > 1 ? 's' : ''}`
            : 'Equipo'}
        </span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {EQUIPMENT.map((e) => {
            const selected = value.includes(e);
            return (
              <button
                type="button"
                key={e}
                onClick={() => toggle(e)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs',
                  selected
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                <span>{e}</span>
                {selected && <span className="text-[10px]">✓</span>}
              </button>
            );
          })}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// =================================================================
// Create / Edit dialog
// =================================================================
interface ExerciseFormState {
  name: string;
  slug: string;
  muscle_group: ExerciseMuscleGroup;
  level: ExerciseLevel;
  equipment: string[];
  video_url: string;
  thumbnail_url: string;
  description: string;
  default_sets: number;
  default_reps: string;
  default_rest_sec: number;
  is_active: boolean;
}

const BLANK_FORM: ExerciseFormState = {
  name: '',
  slug: '',
  muscle_group: 'CHEST',
  level: 'BEGINNER',
  equipment: [],
  video_url: '',
  thumbnail_url: '',
  description: '',
  default_sets: 3,
  default_reps: '8-12',
  default_rest_sec: 60,
  is_active: true,
};

function ExerciseFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: AdminExercise | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<ExerciseFormState>(BLANK_FORM);
  const [slugTouched, setSlugTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        slug: editing.slug,
        muscle_group: editing.muscle_group,
        level: editing.level,
        equipment: editing.equipment ?? [],
        video_url: editing.video_url ?? '',
        thumbnail_url: editing.thumbnail_url ?? '',
        description: editing.description ?? '',
        default_sets: editing.default_sets ?? 3,
        default_reps: editing.default_reps ?? '8-12',
        default_rest_sec: editing.default_rest_sec ?? 60,
        is_active: editing.is_active,
      });
      setSlugTouched(true);
    } else {
      setForm(BLANK_FORM);
      setSlugTouched(false);
    }
  }, [editing, open]);

  React.useEffect(() => {
    if (slugTouched) return;
    setForm((f) => ({ ...f, slug: slugify(f.name) }));
  }, [form.name, slugTouched]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: AdminExerciseInput = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        muscle_group: form.muscle_group,
        level: form.level,
        equipment: form.equipment,
        video_url: form.video_url.trim() || null,
        thumbnail_url: form.thumbnail_url.trim() || null,
        description: form.description.trim() || null,
        default_sets: Number(form.default_sets) || 3,
        default_reps: form.default_reps.trim() || '8-12',
        default_rest_sec: Number(form.default_rest_sec) || 60,
        is_active: form.is_active,
      };
      if (editing) {
        return adminApi.updateExercise(editing.id, payload);
      }
      return adminApi.createExercise(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Ejercicio actualizado' : 'Ejercicio creado');
      onSaved();
      onOpenChange(false);
    },
    onError: (err: { message?: string }) =>
      toast.error(err?.message ?? 'No se pudo guardar'),
  });

  function submit() {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    saveMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            {editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Los ejercicios se comparten con el generador de rutinas IA.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Nombre *
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Press de banca"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Slug
              </label>
              <input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm({ ...form, slug: e.target.value });
                }}
                placeholder="press-de-banca"
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Grupo muscular *
              </label>
              <select
                value={form.muscle_group}
                onChange={(e) =>
                  setForm({
                    ...form,
                    muscle_group: e.target.value as ExerciseMuscleGroup,
                  })
                }
                className={INPUT_CLS}
              >
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Nivel *
              </label>
              <div className="flex gap-2">
                {LEVELS.map((l) => (
                  <label
                    key={l.value}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-2 py-2.5 text-xs font-semibold uppercase tracking-wider transition',
                      form.level === l.value
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="level"
                      value={l.value}
                      checked={form.level === l.value}
                      onChange={() => setForm({ ...form, level: l.value })}
                      className="sr-only"
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Equipo
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EQUIPMENT.map((e) => {
                const selected = form.equipment.includes(e);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        equipment: selected
                          ? f.equipment.filter((x) => x !== e)
                          : [...f.equipment, e],
                      }))
                    }
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                      selected
                        ? 'bg-blue-100 text-blue-700 border-blue-200'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Video URL
              </label>
              <input
                type="url"
                value={form.video_url}
                onChange={(e) =>
                  setForm({ ...form, video_url: e.target.value })
                }
                placeholder="https://…"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Miniatura URL
              </label>
              <input
                type="url"
                value={form.thumbnail_url}
                onChange={(e) =>
                  setForm({ ...form, thumbnail_url: e.target.value })
                }
                placeholder="https://…"
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Descripción
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
              className={INPUT_CLS}
              placeholder="Pasos, tips técnicos, seguridad…"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Sets
              </label>
              <input
                type="number"
                min={1}
                value={form.default_sets}
                onChange={(e) =>
                  setForm({
                    ...form,
                    default_sets: Number(e.target.value) || 0,
                  })
                }
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Reps
              </label>
              <input
                value={form.default_reps}
                onChange={(e) =>
                  setForm({ ...form, default_reps: e.target.value })
                }
                placeholder="8-12"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Descanso (s)
              </label>
              <input
                type="number"
                min={0}
                value={form.default_rest_sec}
                onChange={(e) =>
                  setForm({
                    ...form,
                    default_rest_sec: Number(e.target.value) || 0,
                  })
                }
                className={INPUT_CLS}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
              className="h-4 w-4 accent-blue-600"
            />
            Activo (visible para rutinas)
          </label>
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
            onClick={submit}
            disabled={saveMut.isPending}
            className={BTN_PRIMARY}
          >
            {saveMut.isPending
              ? 'Guardando…'
              : editing
              ? 'Guardar cambios'
              : 'Crear ejercicio'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================================================================
// Bulk import dialog
// =================================================================
const TEMPLATE_HEADERS = [
  'name',
  'slug',
  'muscle_group',
  'level',
  'equipment',
  'video_url',
  'thumbnail_url',
  'description',
  'default_sets',
  'default_reps',
  'default_rest_sec',
  'is_active',
];

interface ParsedRow {
  index: number;
  raw: Record<string, unknown>;
  parsed: AdminExerciseInput | null;
  error: string | null;
}

function parseRow(row: Record<string, unknown>, index: number): ParsedRow {
  const name = String(row.name ?? '').trim();
  if (!name) {
    return { index, raw: row, parsed: null, error: 'name vacío' };
  }
  const mg = String(row.muscle_group ?? '')
    .trim()
    .toUpperCase();
  if (!MUSCLE_GROUPS.some((m) => m.value === mg)) {
    return {
      index,
      raw: row,
      parsed: null,
      error: `muscle_group inválido: "${mg}"`,
    };
  }
  const lvl = String(row.level ?? '')
    .trim()
    .toUpperCase();
  if (!LEVELS.some((l) => l.value === lvl)) {
    return {
      index,
      raw: row,
      parsed: null,
      error: `level inválido: "${lvl}"`,
    };
  }
  const equipment = String(row.equipment ?? '')
    .split(/[,;|]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const isActiveRaw = row.is_active;
  let is_active: boolean | undefined;
  if (isActiveRaw === undefined || isActiveRaw === '') {
    is_active = undefined;
  } else {
    const s = String(isActiveRaw).trim().toLowerCase();
    is_active = !['false', '0', 'no', 'n'].includes(s);
  }

  return {
    index,
    raw: row,
    parsed: {
      name,
      slug: String(row.slug ?? '').trim() || undefined,
      muscle_group: mg as ExerciseMuscleGroup,
      level: lvl as ExerciseLevel,
      equipment,
      video_url: String(row.video_url ?? '').trim() || null,
      thumbnail_url: String(row.thumbnail_url ?? '').trim() || null,
      description: String(row.description ?? '').trim() || null,
      default_sets: row.default_sets ? Number(row.default_sets) : undefined,
      default_reps: row.default_reps
        ? String(row.default_reps).trim()
        : undefined,
      default_rest_sec: row.default_rest_sec
        ? Number(row.default_rest_sec)
        : undefined,
      is_active,
    },
    error: null,
  };
}

function BulkImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [dragOver, setDragOver] = React.useState(false);
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ExerciseBulkImportResult | null>(
    null,
  );

  React.useEffect(() => {
    if (!open) {
      setRows([]);
      setFileName(null);
      setResult(null);
      setDragOver(false);
    }
  }, [open]);

  const importMut = useMutation({
    mutationFn: () => {
      const valid = rows
        .filter((r) => r.parsed && !r.error)
        .map((r) => r.parsed!) as AdminExerciseInput[];
      return adminApi.bulkImportExercises(valid);
    },
    onSuccess: (res) => {
      setResult(res);
      toast.success(
        `Import: ${res.created} creados, ${res.updated} actualizados`,
      );
      onDone();
    },
    onError: (err: { message?: string }) =>
      toast.error(err?.message ?? 'No se pudo importar'),
  });

  async function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });
      const parsed = json.map((r, i) => parseRow(r, i + 2));
      setRows(parsed);
      if (parsed.length === 0) {
        toast.error('El archivo no tiene filas');
      }
    } catch (e) {
      console.error(e);
      toast.error('No se pudo leer el archivo');
    }
  }

  function downloadTemplate() {
    const sample = [
      {
        name: 'Press de banca',
        slug: 'press-de-banca',
        muscle_group: 'CHEST',
        level: 'INTERMEDIATE',
        equipment: 'barbell,bench',
        video_url: '',
        thumbnail_url: '',
        description: 'Técnica estándar.',
        default_sets: 4,
        default_reps: '6-10',
        default_rest_sec: 90,
        is_active: true,
      },
      {
        name: 'Sentadilla',
        slug: '',
        muscle_group: 'LEGS',
        level: 'BEGINNER',
        equipment: 'barbell',
        video_url: '',
        thumbnail_url: '',
        description: '',
        default_sets: 3,
        default_reps: '8-12',
        default_rest_sec: 90,
        is_active: true,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample, { header: TEMPLATE_HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ejercicios');
    XLSX.writeFile(wb, 'ejercicios-plantilla.xlsx');
  }

  const valid = rows.filter((r) => !r.error).length;
  const invalid = rows.length - valid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            Importar ejercicios desde Excel
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Usa la plantilla oficial: columnas <code>name</code>,{' '}
            <code>muscle_group</code> y <code>level</code> son obligatorias. El
            upsert se hace por <code>slug</code>.
          </DialogDescription>
        </DialogHeader>

        {!rows.length && !result && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 underline-offset-4 hover:underline"
            >
              <Download className="h-3 w-3" />
              Descargar plantilla (.xlsx)
            </button>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className={cn(
                'relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition',
                dragOver
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-slate-300 bg-white hover:border-slate-400',
              )}
            >
              <Upload className="h-6 w-6 text-slate-400" />
              <div className="text-sm text-slate-700">
                Arrastra un archivo <code>.xlsx</code> o <code>.csv</code>
              </div>
              <div className="text-[11px] text-slate-500">
                o haz click para seleccionar
              </div>
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </div>
          </div>
        )}

        {rows.length > 0 && !result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-600">{fileName}</span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                {valid} válidas
              </span>
              {invalid > 0 && (
                <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                  {invalid} errores
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setFileName(null);
                }}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
              >
                <XIcon className="h-3 w-3" />
                Limpiar
              </button>
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Fila</th>
                    <th className="px-2 py-1.5 text-left">Nombre</th>
                    <th className="px-2 py-1.5 text-left">Grupo</th>
                    <th className="px-2 py-1.5 text-left">Nivel</th>
                    <th className="px-2 py-1.5 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r) => (
                    <tr
                      key={r.index}
                      className={cn(
                        'border-t border-slate-200',
                        r.error && 'bg-rose-50',
                      )}
                    >
                      <td className="px-2 py-1 text-slate-500">{r.index}</td>
                      <td className="px-2 py-1 text-slate-900">
                        {String(r.raw.name ?? '—')}
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {String(r.raw.muscle_group ?? '')}
                      </td>
                      <td className="px-2 py-1 text-slate-600">
                        {String(r.raw.level ?? '')}
                      </td>
                      <td className="px-2 py-1">
                        {r.error ? (
                          <span className="text-rose-600">{r.error}</span>
                        ) : (
                          <span className="text-emerald-600">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <div className="px-2 py-1.5 text-[11px] text-slate-500">
                  + {rows.length - 50} filas más (se enviarán todas las
                  válidas)
                </div>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-slate-900">Resultado</div>
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-700">
                Creados: {result.created}
              </span>
              <span className="text-sky-700">
                Actualizados: {result.updated}
              </span>
              <span className="text-rose-700">
                Errores: {result.errors?.length ?? 0}
              </span>
            </div>
            {result.errors?.length > 0 && (
              <div className="max-h-40 overflow-auto text-[11px] text-slate-600">
                {result.errors.map((e, i) => (
                  <div key={i}>
                    #{e.index}: {e.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={BTN_SECONDARY}
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          {rows.length > 0 && !result && (
            <button
              type="button"
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending || valid === 0}
              className={BTN_PRIMARY}
            >
              {importMut.isPending
                ? 'Importando…'
                : `Confirmar import (${valid})`}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
