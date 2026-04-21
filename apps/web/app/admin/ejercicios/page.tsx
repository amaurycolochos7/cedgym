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

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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

// ─── Helpers ─────────────────────────────────────────────────────
function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function levelBadgeVariant(
  level: ExerciseLevel,
): 'success' | 'warning' | 'danger' {
  if (level === 'BEGINNER') return 'success';
  if (level === 'INTERMEDIATE') return 'warning';
  return 'danger';
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
            <div className="font-semibold text-white">{row.original.name}</div>
            <div className="text-[11px] text-white/40">{row.original.slug}</div>
          </div>
        ),
      },
      {
        header: 'Grupo',
        accessorKey: 'muscle_group',
        cell: ({ row }) => (
          <span className="text-white/80">
            {muscleLabel(row.original.muscle_group)}
          </span>
        ),
      },
      {
        header: 'Equipo',
        accessorKey: 'equipment',
        cell: ({ row }) => {
          const eq = row.original.equipment ?? [];
          if (eq.length === 0) return <span className="text-white/30">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {eq.slice(0, 3).map((e) => (
                <span
                  key={e}
                  className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70 ring-1 ring-inset ring-white/10"
                >
                  {e}
                </span>
              ))}
              {eq.length > 3 && (
                <span className="text-[10px] text-white/40">
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
          <Badge variant={levelBadgeVariant(row.original.level)}>
            {levelLabel(row.original.level)}
          </Badge>
        ),
      },
      {
        header: 'Default',
        accessorKey: 'default_sets',
        cell: ({ row }) => (
          <span className="text-[11px] text-white/60">
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
              className="rounded-md p-1.5 text-white/60 hover:bg-white/5 hover:text-white"
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
              className="rounded-md p-1.5 text-white/60 hover:bg-red-500/10 hover:text-red-300"
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
          <h1 className="font-display text-2xl uppercase tracking-tight text-white sm:text-3xl">
            Biblioteca de Ejercicios
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="brand">
              Total: {statsQuery.data?.total ?? total}
            </Badge>
            {statsQuery.data?.by_level &&
              LEVELS.map((l) => (
                <Badge key={l.value} variant="default">
                  {l.label}: {statsQuery.data?.by_level[l.value] ?? 0}
                </Badge>
              ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setImportOpen(true)}
            size="sm"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar Excel
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Nuevo ejercicio
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Input
            placeholder="Buscar por nombre o slug"
            value={filters.q}
            onChange={(e) => {
              setFilters({ ...filters, q: e.target.value });
              setPage(1);
            }}
            className="h-9"
          />
          <Select
            value={filters.muscle_group}
            onChange={(e) => {
              setFilters({
                ...filters,
                muscle_group: e.target.value as ExerciseMuscleGroup | '',
              });
              setPage(1);
            }}
            className="h-9"
          >
            <option value="">Grupo muscular</option>
            {MUSCLE_GROUPS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Select
            value={filters.level}
            onChange={(e) => {
              setFilters({
                ...filters,
                level: e.target.value as ExerciseLevel | '',
              });
              setPage(1);
            }}
            className="h-9"
          >
            <option value="">Nivel</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
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
        <div className="flex items-center justify-end gap-2 text-xs text-white/50">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span>
            Página {page} de {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
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
          'flex w-full items-center justify-between rounded-lg border border-white/10 bg-input/60 px-3 text-left text-sm text-white focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30',
          compact ? 'h-9' : 'h-10',
        )}
      >
        <span className={value.length ? 'text-white' : 'text-white/40'}>
          {value.length
            ? `${value.length} equipo${value.length > 1 ? 's' : ''}`
            : 'Equipo'}
        </span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/10 bg-neutral-950 p-2 shadow-xl">
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
                    ? 'bg-brand-orange/10 text-brand-orange'
                    : 'text-white/70 hover:bg-white/5',
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
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[11px] text-white/40 hover:bg-white/5 hover:text-white/70"
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

  // Hydrate form when editing changes (or resets to blank on new).
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

  // Auto-slug from name until the user manually edits it.
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
          </DialogTitle>
          <DialogDescription>
            Los ejercicios se comparten con el generador de rutinas IA.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Nombre *
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Press de banca"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Slug</label>
              <Input
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm({ ...form, slug: e.target.value });
                }}
                placeholder="press-de-banca"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Grupo muscular *
              </label>
              <Select
                value={form.muscle_group}
                onChange={(e) =>
                  setForm({
                    ...form,
                    muscle_group: e.target.value as ExerciseMuscleGroup,
                  })
                }
              >
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Nivel *
              </label>
              <div className="flex gap-2">
                {LEVELS.map((l) => (
                  <label
                    key={l.value}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-2 py-2 text-xs font-semibold uppercase tracking-wider transition',
                      form.level === l.value
                        ? 'border-brand-orange/60 bg-brand-orange/10 text-brand-orange'
                        : 'border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/5',
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
            <label className="mb-1 block text-xs text-white/60">Equipo</label>
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
                      'rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset transition',
                      selected
                        ? 'bg-brand-orange/15 text-brand-orange ring-brand-orange/40'
                        : 'bg-white/5 text-white/60 ring-white/10 hover:bg-white/10',
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
              <label className="mb-1 block text-xs text-white/60">
                Video URL
              </label>
              <Input
                type="url"
                value={form.video_url}
                onChange={(e) =>
                  setForm({ ...form, video_url: e.target.value })
                }
                placeholder="https://…"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Miniatura URL
              </label>
              <Input
                type="url"
                value={form.thumbnail_url}
                onChange={(e) =>
                  setForm({ ...form, thumbnail_url: e.target.value })
                }
                placeholder="https://…"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">
              Descripción
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-input/60 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
              placeholder="Pasos, tips técnicos, seguridad…"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs text-white/60">Sets</label>
              <Input
                type="number"
                min={1}
                value={form.default_sets}
                onChange={(e) =>
                  setForm({
                    ...form,
                    default_sets: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Reps</label>
              <Input
                value={form.default_reps}
                onChange={(e) =>
                  setForm({ ...form, default_reps: e.target.value })
                }
                placeholder="8-12"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Descanso (s)
              </label>
              <Input
                type="number"
                min={0}
                value={form.default_rest_sec}
                onChange={(e) =>
                  setForm({
                    ...form,
                    default_rest_sec: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/80">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.checked })
              }
              className="h-4 w-4 accent-brand-orange"
            />
            Activo (visible para rutinas)
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saveMut.isPending}>
            {editing ? 'Guardar cambios' : 'Crear ejercicio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================================================================
// Bulk import dialog (template-based, no mapping UI)
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
  index: number; // 1-based row # for user messages
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

  // Reset state on close
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
      const parsed = json.map((r, i) => parseRow(r, i + 2)); // +2 for 1-based + header row
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar ejercicios desde Excel</DialogTitle>
          <DialogDescription>
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
              className="inline-flex items-center gap-2 text-xs font-semibold text-brand-orange underline-offset-4 hover:underline"
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
                'relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition',
                dragOver
                  ? 'border-brand-orange/60 bg-brand-orange/5'
                  : 'border-white/15 bg-white/[0.02] hover:border-white/25',
              )}
            >
              <Upload className="h-6 w-6 text-white/40" />
              <div className="text-sm text-white/80">
                Arrastra un archivo <code>.xlsx</code> o <code>.csv</code>
              </div>
              <div className="text-[11px] text-white/40">
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
              <span className="text-white/60">{fileName}</span>
              <Badge variant="success">{valid} válidas</Badge>
              {invalid > 0 && <Badge variant="danger">{invalid} errores</Badge>}
              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setFileName(null);
                }}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white"
              >
                <XIcon className="h-3 w-3" />
                Limpiar
              </button>
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-900 text-white/60">
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
                        'border-t border-white/5',
                        r.error && 'bg-red-500/5',
                      )}
                    >
                      <td className="px-2 py-1 text-white/40">{r.index}</td>
                      <td className="px-2 py-1 text-white/90">
                        {String(r.raw.name ?? '—')}
                      </td>
                      <td className="px-2 py-1 text-white/60">
                        {String(r.raw.muscle_group ?? '')}
                      </td>
                      <td className="px-2 py-1 text-white/60">
                        {String(r.raw.level ?? '')}
                      </td>
                      <td className="px-2 py-1">
                        {r.error ? (
                          <span className="text-red-300">{r.error}</span>
                        ) : (
                          <span className="text-emerald-300">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <div className="px-2 py-1.5 text-[11px] text-white/40">
                  + {rows.length - 50} filas más (se enviarán todas las válidas)
                </div>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
            <div className="font-semibold text-white">Resultado</div>
            <div className="flex gap-4 text-xs">
              <span className="text-emerald-300">
                Creados: {result.created}
              </span>
              <span className="text-sky-300">
                Actualizados: {result.updated}
              </span>
              <span className="text-red-300">
                Errores: {result.errors?.length ?? 0}
              </span>
            </div>
            {result.errors?.length > 0 && (
              <div className="max-h-40 overflow-auto text-[11px] text-white/60">
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {rows.length > 0 && !result && (
            <Button
              onClick={() => importMut.mutate()}
              loading={importMut.isPending}
              disabled={valid === 0}
            >
              Confirmar import ({valid})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
