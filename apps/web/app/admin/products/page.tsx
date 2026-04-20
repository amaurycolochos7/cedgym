'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TrainerAutocomplete,
  type TrainerOption,
} from '@/components/admin/trainer-autocomplete';
import {
  adminApi,
  type AdminProduct,
  type AdminProductCreateInput,
  type ProductContent,
  type RoutineDay,
  type RoutineExercise,
  type RoutineWeek,
} from '@/lib/admin-api';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const TYPES: { value: AdminProductCreateInput['type']; label: string }[] = [
  { value: 'ROUTINE', label: 'Rutina' },
  { value: 'NUTRITION_PLAN', label: 'Plan nutricional' },
  { value: 'EBOOK', label: 'Ebook' },
  { value: 'VIDEO_COURSE', label: 'Video-curso' },
  { value: 'BUNDLE', label: 'Bundle' },
];

const SPORTS = [
  { value: '', label: '—' },
  { value: 'FOOTBALL', label: 'Fútbol' },
  { value: 'BOXING', label: 'Boxeo' },
  { value: 'MMA', label: 'MMA' },
  { value: 'POWERLIFTING', label: 'Powerlifting' },
  { value: 'CROSSFIT', label: 'CrossFit' },
  { value: 'WEIGHTLIFTING', label: 'Weightlifting' },
  { value: 'GENERAL_FITNESS', label: 'Fitness general' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'NUTRITION', label: 'Nutrición' },
  { value: 'OTHER', label: 'Otro' },
];

const LEVELS: { value: AdminProductCreateInput['level']; label: string }[] = [
  { value: 'BEGINNER', label: 'Principiante' },
  { value: 'INTERMEDIATE', label: 'Intermedio' },
  { value: 'ADVANCED', label: 'Avanzado' },
  { value: 'ALL_LEVELS', label: 'Todos los niveles' },
];

export default function AdminProductsPage() {
  const qc = useQueryClient();

  const pending = useQuery({
    queryKey: ['admin', 'products', 'pending'],
    queryFn: () => adminApi.listProducts('pending'),
  });
  const published = useQuery({
    queryKey: ['admin', 'products', 'published'],
    queryFn: () => adminApi.listProducts('published'),
  });
  const rejected = useQuery({
    queryKey: ['admin', 'products', 'rejected'],
    queryFn: () => adminApi.listProducts('rejected'),
  });

  const top = useQuery({
    queryKey: ['admin', 'products-top'],
    queryFn: adminApi.topSellingProducts,
  });
  const payouts = useQuery({
    queryKey: ['admin', 'payouts-pending'],
    queryFn: adminApi.payoutsPending,
  });

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminProduct | null>(null);

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approveProduct(id),
    onSuccess: () => {
      toast.success('Producto aprobado');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
  });
  const feature = useMutation({
    mutationFn: ({ id, featured }: { id: string; featured: boolean }) =>
      adminApi.featureProduct(id, featured),
    onSuccess: () => {
      toast.success('Destacado actualizado');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
  });

  const [rejectTarget, setRejectTarget] = React.useState<AdminProduct | null>(
    null,
  );
  const [reason, setReason] = React.useState('');
  const rejectMut = useMutation({
    mutationFn: () =>
      adminApi.rejectProduct(
        rejectTarget!.id,
        reason || 'No cumple guidelines',
      ),
    onSuccess: () => {
      toast.success('Producto rechazado');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      setRejectTarget(null);
      setReason('');
    },
    onError: () => toast.error('No se pudo rechazar'),
  });

  const renderActionsPending = (p: AdminProduct) => (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => approve.mutate(p.id)}
        loading={approve.isPending}
      >
        <Check className="h-3 w-3" />
        Aprobar
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => setRejectTarget(p)}
      >
        <X className="h-3 w-3" />
        Rechazar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(p);
          setEditorOpen(true);
        }}
      >
        <Pencil className="h-3 w-3" />
        Editar
      </Button>
    </div>
  );

  const renderActionsPublished = (p: AdminProduct) => (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(p);
          setEditorOpen(true);
        }}
      >
        <Pencil className="h-3 w-3" />
        Editar
      </Button>
      <Button
        size="sm"
        variant={p.featured ? 'primary' : 'ghost'}
        onClick={() =>
          feature.mutate({ id: p.id, featured: !p.featured })
        }
      >
        <Star className="h-3 w-3" />
        {p.featured ? 'Destacado' : 'Destacar'}
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Marketplace
          </h2>
          <p className="text-xs text-white/50">
            Modera, destaca y crea rutinas y productos digitales.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Crear rutina/producto
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pendientes {pending.data?.total ? `(${pending.data.total})` : ''}
          </TabsTrigger>
          <TabsTrigger value="published">Publicados</TabsTrigger>
          <TabsTrigger value="rejected">Rechazados</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Grid
            items={pending.data?.items ?? []}
            renderActions={renderActionsPending}
          />
        </TabsContent>
        <TabsContent value="published">
          <Grid
            items={published.data?.items ?? []}
            renderActions={renderActionsPublished}
          />
        </TabsContent>
        <TabsContent value="rejected">
          <Grid items={rejected.data?.items ?? []} showReason />
        </TabsContent>
      </Tabs>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">
            Top vendidos
          </h3>
          <ul className="space-y-2">
            {(top.data ?? []).slice(0, 6).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-white/[0.02] p-3 text-sm"
              >
                <span className="font-semibold text-white">{p.name}</span>
                <span className="text-white/60">
                  {p.sales_count ?? 0} ventas
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">
            Payouts pendientes
          </h3>
          <ul className="space-y-2">
            {(payouts.data ?? []).map((p) => (
              <li
                key={p.trainer_id}
                className="flex items-center justify-between rounded-lg bg-white/[0.02] p-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-white">
                    {p.trainer_name}
                  </div>
                  <div className="text-[11px] text-white/50">
                    {p.orders} órdenes
                  </div>
                </div>
                <span className="text-brand-orange">
                  {MXN.format(p.amount_mxn)}
                </span>
              </li>
            ))}
            {payouts.data && payouts.data.length === 0 && (
              <li className="text-xs text-white/40">Sin payouts pendientes.</li>
            )}
          </ul>
        </div>
      </section>

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar producto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-white/60">
            Se notificará al creador con el motivo.
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (ej. imágenes de baja calidad)"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMut.mutate()}
              loading={rejectMut.isPending}
              disabled={reason.trim().length < 3}
            >
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductEditor
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditing(null);
        }}
        product={editing}
        onSaved={() =>
          qc.invalidateQueries({ queryKey: ['admin', 'products'] })
        }
      />
    </div>
  );
}

function Grid({
  items,
  renderActions,
  showReason,
}: {
  items: AdminProduct[];
  renderActions?: (p: AdminProduct) => React.ReactNode;
  showReason?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((p) => (
        <div
          key={p.id}
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
        >
          {p.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.cover_url}
              alt={p.name}
              className="mb-3 h-32 w-full rounded-lg object-cover"
            />
          ) : (
            <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-white/[0.03] text-xs text-white/30">
              Sin portada
            </div>
          )}
          <div className="mb-2 flex items-start justify-between">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-bold text-white">
                {p.name}
              </h4>
              <div className="text-[11px] text-white/50">
                {p.author_name ?? '—'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {p.featured && (
                <Badge variant="brand">
                  <Star className="h-3 w-3" />
                </Badge>
              )}
              <Badge variant="default">{p.kind || p.type}</Badge>
            </div>
          </div>
          <div className="text-xs text-white/60">
            Precio:{' '}
            <span className="text-white">{MXN.format(p.price_mxn)}</span>
          </div>
          {showReason && p.rejected_reason && (
            <div className="mt-2 rounded-md bg-red-500/10 p-2 text-[11px] text-red-300">
              {p.rejected_reason}
            </div>
          )}
          {renderActions && <div className="mt-3">{renderActions(p)}</div>}
        </div>
      ))}
      {items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40 md:col-span-2 xl:col-span-3">
          Nada por acá.
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * Product editor
 * =========================================================================*/

interface EditorState {
  type: AdminProductCreateInput['type'];
  title: string;
  description: string;
  sport: string;
  level: NonNullable<AdminProductCreateInput['level']>;
  duration_weeks: number;
  price_mxn: number;
  sale_price_mxn: number | '';
  author_id: string;
  author_name: string;
  cover_url: string;
  video_urls: string[];
  content: ProductContent;
  publish_now: boolean;
  featured: boolean;
}

function emptyExercise(): RoutineExercise {
  return { name: '', sets: 3, reps: '10', notes: '' };
}
function emptyDay(label = 'Día 1'): RoutineDay {
  return { label, exercises: [emptyExercise()] };
}
function emptyWeek(label = 'Semana 1'): RoutineWeek {
  return { label, days: [emptyDay('Día 1')] };
}

function makeInitial(product: AdminProduct | null): EditorState {
  if (!product) {
    return {
      type: 'ROUTINE',
      title: '',
      description: '',
      sport: '',
      level: 'ALL_LEVELS',
      duration_weeks: 4,
      price_mxn: 0,
      sale_price_mxn: '',
      author_id: '',
      author_name: '',
      cover_url: '',
      video_urls: [],
      content: { weeks: [emptyWeek()] },
      publish_now: true,
      featured: false,
    };
  }
  const content = (product.content as ProductContent) ?? {};
  const weeks: RoutineWeek[] = Array.isArray(content.weeks)
    ? content.weeks
    : [];
  return {
    type: (product.type as AdminProductCreateInput['type']) ?? 'ROUTINE',
    title: product.name ?? '',
    description: product.description ?? '',
    sport: product.sport ?? '',
    level: (product.level as EditorState['level']) ?? 'ALL_LEVELS',
    duration_weeks: product.duration_weeks ?? 4,
    price_mxn: product.price_mxn ?? 0,
    sale_price_mxn: product.sale_price_mxn ?? '',
    author_id: product.author_id ?? '',
    author_name: product.author_name ?? '',
    cover_url: product.cover_url ?? '',
    video_urls: product.video_urls ?? [],
    content: { weeks: weeks.length > 0 ? weeks : [emptyWeek()] },
    publish_now: product.published,
    featured: !!product.featured,
  };
}

function ProductEditor({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: AdminProduct | null;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [state, setState] = React.useState<EditorState>(() =>
    makeInitial(product),
  );

  React.useEffect(() => {
    if (open) setState(makeInitial(product));
  }, [open, product]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Partial<AdminProductCreateInput> &
        Pick<AdminProductCreateInput, 'title' | 'description' | 'type' | 'price_mxn'> = {
        type: state.type,
        title: state.title,
        description: state.description,
        sport: state.sport || undefined,
        level: state.level,
        duration_weeks: Number(state.duration_weeks) || null,
        price_mxn: Number(state.price_mxn) || 0,
        sale_price_mxn:
          state.sale_price_mxn === '' ? null : Number(state.sale_price_mxn),
        cover_url: state.cover_url || null,
        video_urls: state.video_urls.filter(Boolean),
        content: state.content,
        author_id: state.author_id || undefined,
        published: state.publish_now,
        featured: state.featured,
      };
      if (isEdit && product) {
        return adminApi.updateAdminProduct(product.id, payload);
      }
      return adminApi.createAdminProduct(
        payload as AdminProductCreateInput,
      );
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Producto actualizado' : 'Producto creado');
      onSaved();
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error?.message ?? 'No se pudo guardar');
    },
  });

  const disabled =
    !state.title ||
    state.title.length < 3 ||
    !state.description ||
    state.description.length < 10 ||
    state.price_mxn < 0;

  /* ----- Content helpers ----- */

  const addWeek = () => {
    setState((s) => ({
      ...s,
      content: {
        ...s.content,
        weeks: [
          ...(s.content.weeks ?? []),
          emptyWeek(`Semana ${(s.content.weeks?.length ?? 0) + 1}`),
        ],
      },
    }));
  };
  const removeWeek = (wi: number) => {
    setState((s) => ({
      ...s,
      content: {
        ...s.content,
        weeks: (s.content.weeks ?? []).filter((_, idx) => idx !== wi),
      },
    }));
  };
  const updateWeek = (wi: number, patch: Partial<RoutineWeek>) => {
    setState((s) => ({
      ...s,
      content: {
        ...s.content,
        weeks: (s.content.weeks ?? []).map((w, idx) =>
          idx === wi ? { ...w, ...patch } : w,
        ),
      },
    }));
  };

  const addDay = (wi: number) => {
    setState((s) => {
      const weeks = [...(s.content.weeks ?? [])];
      const w = weeks[wi];
      if (!w) return s;
      weeks[wi] = {
        ...w,
        days: [...(w.days ?? []), emptyDay(`Día ${(w.days?.length ?? 0) + 1}`)],
      };
      return { ...s, content: { ...s.content, weeks } };
    });
  };
  const removeDay = (wi: number, di: number) => {
    setState((s) => {
      const weeks = [...(s.content.weeks ?? [])];
      const w = weeks[wi];
      if (!w) return s;
      weeks[wi] = {
        ...w,
        days: (w.days ?? []).filter((_, idx) => idx !== di),
      };
      return { ...s, content: { ...s.content, weeks } };
    });
  };
  const updateDay = (wi: number, di: number, patch: Partial<RoutineDay>) => {
    setState((s) => {
      const weeks = [...(s.content.weeks ?? [])];
      const w = weeks[wi];
      if (!w) return s;
      const days = [...(w.days ?? [])];
      days[di] = { ...days[di], ...patch };
      weeks[wi] = { ...w, days };
      return { ...s, content: { ...s.content, weeks } };
    });
  };

  const addExercise = (wi: number, di: number) => {
    setState((s) => {
      const weeks = [...(s.content.weeks ?? [])];
      const w = weeks[wi];
      const d = w?.days?.[di];
      if (!w || !d) return s;
      const days = [...w.days];
      days[di] = {
        ...d,
        exercises: [...(d.exercises ?? []), emptyExercise()],
      };
      weeks[wi] = { ...w, days };
      return { ...s, content: { ...s.content, weeks } };
    });
  };
  const removeExercise = (wi: number, di: number, ei: number) => {
    setState((s) => {
      const weeks = [...(s.content.weeks ?? [])];
      const w = weeks[wi];
      const d = w?.days?.[di];
      if (!w || !d) return s;
      const days = [...w.days];
      days[di] = {
        ...d,
        exercises: (d.exercises ?? []).filter((_, idx) => idx !== ei),
      };
      weeks[wi] = { ...w, days };
      return { ...s, content: { ...s.content, weeks } };
    });
  };
  const updateExercise = (
    wi: number,
    di: number,
    ei: number,
    patch: Partial<RoutineExercise>,
  ) => {
    setState((s) => {
      const weeks = [...(s.content.weeks ?? [])];
      const w = weeks[wi];
      const d = w?.days?.[di];
      if (!w || !d) return s;
      const days = [...w.days];
      const exercises = [...(d.exercises ?? [])];
      exercises[ei] = { ...exercises[ei], ...patch };
      days[di] = { ...d, exercises };
      weeks[wi] = { ...w, days };
      return { ...s, content: { ...s.content, weeks } };
    });
  };

  /* ----- Video URLs ----- */

  const addVideo = () =>
    setState((s) => ({ ...s, video_urls: [...s.video_urls, ''] }));
  const updateVideo = (i: number, v: string) =>
    setState((s) => ({
      ...s,
      video_urls: s.video_urls.map((u, idx) => (idx === i ? v : u)),
    }));
  const removeVideo = (i: number) =>
    setState((s) => ({
      ...s,
      video_urls: s.video_urls.filter((_, idx) => idx !== i),
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar producto' : 'Nuevo producto'}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="content">Contenido</TabsTrigger>
              <TabsTrigger value="media">Multimedia</TabsTrigger>
            </TabsList>

            {/* ─── Info ──────────────────────────────────────── */}
            <TabsContent value="info">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-white/60">
                    Título
                  </label>
                  <Input
                    value={state.title}
                    onChange={(e) =>
                      setState({ ...state, title: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-white/60">
                    Descripción
                  </label>
                  <textarea
                    rows={4}
                    value={state.description}
                    onChange={(e) =>
                      setState({ ...state, description: e.target.value })
                    }
                    className="w-full rounded-xl border border-white/10 bg-input/60 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-white/60">
                    Tipo
                  </label>
                  <Select
                    value={state.type}
                    onChange={(e) =>
                      setState({
                        ...state,
                        type: e.target.value as EditorState['type'],
                      })
                    }
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/60">
                    Deporte
                  </label>
                  <Select
                    value={state.sport}
                    onChange={(e) =>
                      setState({ ...state, sport: e.target.value })
                    }
                  >
                    {SPORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-white/60">
                    Nivel
                  </label>
                  <Select
                    value={state.level}
                    onChange={(e) =>
                      setState({
                        ...state,
                        level: e.target.value as EditorState['level'],
                      })
                    }
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/60">
                    Duración (semanas)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={104}
                    value={state.duration_weeks}
                    onChange={(e) =>
                      setState({
                        ...state,
                        duration_weeks: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-white/60">
                    Precio (MXN)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={state.price_mxn}
                    onChange={(e) =>
                      setState({
                        ...state,
                        price_mxn: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/60">
                    Precio oferta (opcional)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={state.sale_price_mxn}
                    onChange={(e) =>
                      setState({
                        ...state,
                        sale_price_mxn:
                          e.target.value === ''
                            ? ''
                            : Number(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-white/60">
                    Autor
                  </label>
                  <TrainerAutocomplete
                    value={state.author_id || null}
                    valueLabel={state.author_name || null}
                    onSelect={(u: TrainerOption | null) =>
                      setState({
                        ...state,
                        author_id: u?.id ?? '',
                        author_name: u?.name ?? '',
                      })
                    }
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-white md:col-span-1">
                  <input
                    type="checkbox"
                    checked={state.publish_now}
                    onChange={(e) =>
                      setState({ ...state, publish_now: e.target.checked })
                    }
                    className="accent-brand-orange"
                  />
                  Publicar inmediatamente
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-white md:col-span-1">
                  <input
                    type="checkbox"
                    checked={state.featured}
                    onChange={(e) =>
                      setState({ ...state, featured: e.target.checked })
                    }
                    className="accent-brand-orange"
                  />
                  Destacar
                </label>
              </div>
            </TabsContent>

            {/* ─── Contenido ─────────────────────────────────── */}
            <TabsContent value="content">
              <div className="space-y-3">
                {(state.content.weeks ?? []).map((w, wi) => (
                  <div
                    key={wi}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Input
                        value={w.label ?? ''}
                        onChange={(e) =>
                          updateWeek(wi, { label: e.target.value })
                        }
                        placeholder={`Semana ${wi + 1}`}
                        className="h-9"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeWeek(wi)}
                      >
                        <Trash2 className="h-4 w-4 text-red-300" />
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {(w.days ?? []).map((d, di) => (
                        <div
                          key={di}
                          className="rounded-lg border border-white/10 bg-white/[0.02] p-3"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <Input
                              value={d.label ?? ''}
                              onChange={(e) =>
                                updateDay(wi, di, { label: e.target.value })
                              }
                              placeholder={`Día ${di + 1}`}
                              className="h-8"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeDay(wi, di)}
                            >
                              <Trash2 className="h-3 w-3 text-red-300" />
                            </Button>
                          </div>
                          <div className="space-y-1.5">
                            {(d.exercises ?? []).map((ex, ei) => (
                              <div
                                key={ei}
                                className="grid grid-cols-12 gap-2"
                              >
                                <Input
                                  className="col-span-5 h-8"
                                  placeholder="Ejercicio"
                                  value={ex.name}
                                  onChange={(e) =>
                                    updateExercise(wi, di, ei, {
                                      name: e.target.value,
                                    })
                                  }
                                />
                                <Input
                                  className="col-span-2 h-8"
                                  placeholder="Sets"
                                  type="number"
                                  value={ex.sets ?? ''}
                                  onChange={(e) =>
                                    updateExercise(wi, di, ei, {
                                      sets:
                                        e.target.value === ''
                                          ? undefined
                                          : Number(e.target.value),
                                    })
                                  }
                                />
                                <Input
                                  className="col-span-2 h-8"
                                  placeholder="Reps"
                                  value={ex.reps ?? ''}
                                  onChange={(e) =>
                                    updateExercise(wi, di, ei, {
                                      reps: e.target.value,
                                    })
                                  }
                                />
                                <Input
                                  className="col-span-2 h-8"
                                  placeholder="Notas"
                                  value={ex.notes ?? ''}
                                  onChange={(e) =>
                                    updateExercise(wi, di, ei, {
                                      notes: e.target.value,
                                    })
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="col-span-1"
                                  onClick={() =>
                                    removeExercise(wi, di, ei)
                                  }
                                >
                                  <Trash2 className="h-3 w-3 text-red-300" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addExercise(wi, di)}
                            >
                              <Plus className="h-3 w-3" />
                              Añadir ejercicio
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addDay(wi)}
                      >
                        <Plus className="h-3 w-3" />
                        Añadir día
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addWeek}
                >
                  <Plus className="h-4 w-4" />
                  Añadir semana
                </Button>
              </div>
            </TabsContent>

            {/* ─── Multimedia ────────────────────────────────── */}
            <TabsContent value="media">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-white/60">
                    URL de portada
                  </label>
                  <Input
                    value={state.cover_url}
                    onChange={(e) =>
                      setState({ ...state, cover_url: e.target.value })
                    }
                    placeholder="https://cdn.cedgym.mx/covers/…"
                  />
                  {state.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={state.cover_url}
                      alt="portada"
                      className="mt-2 h-40 w-full rounded-lg object-cover"
                    />
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs text-white/60">
                      Videos (URLs)
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addVideo}
                    >
                      <Plus className="h-3 w-3" />
                      Añadir video
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {state.video_urls.length === 0 && (
                      <div className="rounded-lg border border-dashed border-white/10 p-3 text-center text-xs text-white/40">
                        Sin videos.
                      </div>
                    )}
                    {state.video_urls.map((u, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={u}
                          onChange={(e) => updateVideo(i, e.target.value)}
                          placeholder="https://…"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeVideo(i)}
                        >
                          <Trash2 className="h-3 w-3 text-red-300" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={disabled}
          >
            {isEdit ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
