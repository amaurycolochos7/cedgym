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

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const INPUT_CLS_SM =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_PRIMARY_SM =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';
const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60 disabled:pointer-events-none';

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
      <button
        type="button"
        onClick={() => approve.mutate(p.id)}
        disabled={approve.isPending}
        className={BTN_PRIMARY_SM}
      >
        <Check className="h-3 w-3" />
        Aprobar
      </button>
      <button
        type="button"
        onClick={() => setRejectTarget(p)}
        className={BTN_DANGER}
      >
        <X className="h-3 w-3" />
        Rechazar
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(p);
          setEditorOpen(true);
        }}
        className={BTN_SECONDARY}
      >
        <Pencil className="h-3 w-3" />
        Editar
      </button>
    </div>
  );

  const renderActionsPublished = (p: AdminProduct) => (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setEditing(p);
          setEditorOpen(true);
        }}
        className={BTN_SECONDARY}
      >
        <Pencil className="h-3 w-3" />
        Editar
      </button>
      <button
        type="button"
        onClick={() => feature.mutate({ id: p.id, featured: !p.featured })}
        className={p.featured ? BTN_PRIMARY_SM : BTN_SECONDARY}
      >
        <Star className="h-3 w-3" />
        {p.featured ? 'Destacado' : 'Destacar'}
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Marketplace
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Modera, destaca y crea rutinas y productos digitales.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
          className={BTN_PRIMARY}
        >
          <Plus className="h-4 w-4" />
          Crear rutina/producto
        </button>
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">
            Top vendidos
          </h3>
          <ul className="space-y-2">
            {(top.data ?? []).slice(0, 6).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm"
              >
                <span className="font-semibold text-slate-900">{p.name}</span>
                <span className="text-slate-600">
                  {p.sales_count ?? 0} ventas
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">
            Payouts pendientes
          </h3>
          <ul className="space-y-2">
            {(payouts.data ?? []).map((p) => (
              <li
                key={p.trainer_id}
                className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-slate-900">
                    {p.trainer_name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {p.orders} órdenes
                  </div>
                </div>
                <span className="font-semibold text-blue-600">
                  {MXN.format(p.amount_mxn)}
                </span>
              </li>
            ))}
            {payouts.data && payouts.data.length === 0 && (
              <li className="text-xs text-slate-500">
                Sin payouts pendientes.
              </li>
            )}
          </ul>
        </div>
      </section>

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              Rechazar producto
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Se notificará al creador con el motivo.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (ej. imágenes de baja calidad)"
            className={INPUT_CLS}
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className={BTN_SECONDARY}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => rejectMut.mutate()}
              disabled={rejectMut.isPending || reason.trim().length < 3}
              className={BTN_DANGER}
            >
              {rejectMut.isPending ? 'Rechazando…' : 'Rechazar'}
            </button>
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
          className="rounded-2xl border border-slate-200 bg-white p-4"
        >
          {p.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.cover_url}
              alt={p.name}
              className="mb-3 h-32 w-full rounded-lg object-cover"
            />
          ) : (
            <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
              Sin portada
            </div>
          )}
          <div className="mb-2 flex items-start justify-between">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-bold text-slate-900">
                {p.name}
              </h4>
              <div className="text-[11px] text-slate-500">
                {p.author_name ?? '—'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {p.featured && (
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  <Star className="h-3 w-3" />
                </span>
              )}
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {p.kind || p.type}
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-600">
            Precio:{' '}
            <span className="text-slate-900 font-semibold">
              {MXN.format(p.price_mxn)}
            </span>
          </div>
          {showReason && p.rejected_reason && (
            <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
              {p.rejected_reason}
            </div>
          )}
          {renderActions && <div className="mt-3">{renderActions(p)}</div>}
        </div>
      ))}
      {items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
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
        Pick<
          AdminProductCreateInput,
          'title' | 'description' | 'type' | 'price_mxn'
        > = {
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
      return adminApi.createAdminProduct(payload as AdminProductCreateInput);
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
        days: [
          ...(w.days ?? []),
          emptyDay(`Día ${(w.days?.length ?? 0) + 1}`),
        ],
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
      <DialogContent className="max-w-3xl bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
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

            <TabsContent value="info">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Título
                  </label>
                  <input
                    value={state.title}
                    onChange={(e) =>
                      setState({ ...state, title: e.target.value })
                    }
                    className={INPUT_CLS}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Descripción
                  </label>
                  <textarea
                    rows={4}
                    value={state.description}
                    onChange={(e) =>
                      setState({ ...state, description: e.target.value })
                    }
                    className={INPUT_CLS}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Tipo
                  </label>
                  <select
                    value={state.type}
                    onChange={(e) =>
                      setState({
                        ...state,
                        type: e.target.value as EditorState['type'],
                      })
                    }
                    className={INPUT_CLS}
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Deporte
                  </label>
                  <select
                    value={state.sport}
                    onChange={(e) =>
                      setState({ ...state, sport: e.target.value })
                    }
                    className={INPUT_CLS}
                  >
                    {SPORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Nivel
                  </label>
                  <select
                    value={state.level}
                    onChange={(e) =>
                      setState({
                        ...state,
                        level: e.target.value as EditorState['level'],
                      })
                    }
                    className={INPUT_CLS}
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Duración (semanas)
                  </label>
                  <input
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
                    className={INPUT_CLS}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Precio (MXN)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={state.price_mxn}
                    onChange={(e) =>
                      setState({
                        ...state,
                        price_mxn: Number(e.target.value) || 0,
                      })
                    }
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Precio oferta (opcional)
                  </label>
                  <input
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
                    className={INPUT_CLS}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
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

                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 md:col-span-1">
                  <input
                    type="checkbox"
                    checked={state.publish_now}
                    onChange={(e) =>
                      setState({ ...state, publish_now: e.target.checked })
                    }
                    className="accent-blue-600"
                  />
                  Publicar inmediatamente
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 md:col-span-1">
                  <input
                    type="checkbox"
                    checked={state.featured}
                    onChange={(e) =>
                      setState({ ...state, featured: e.target.checked })
                    }
                    className="accent-blue-600"
                  />
                  Destacar
                </label>
              </div>
            </TabsContent>

            <TabsContent value="content">
              <div className="space-y-3">
                {(state.content.weeks ?? []).map((w, wi) => (
                  <div
                    key={wi}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        value={w.label ?? ''}
                        onChange={(e) =>
                          updateWeek(wi, { label: e.target.value })
                        }
                        placeholder={`Semana ${wi + 1}`}
                        className={INPUT_CLS}
                      />
                      <button
                        type="button"
                        onClick={() => removeWeek(wi)}
                        className="rounded-md p-2 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(w.days ?? []).map((d, di) => (
                        <div
                          key={di}
                          className="rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <input
                              value={d.label ?? ''}
                              onChange={(e) =>
                                updateDay(wi, di, { label: e.target.value })
                              }
                              placeholder={`Día ${di + 1}`}
                              className={INPUT_CLS_SM}
                            />
                            <button
                              type="button"
                              onClick={() => removeDay(wi, di)}
                              className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {(d.exercises ?? []).map((ex, ei) => (
                              <div
                                key={ei}
                                className="grid grid-cols-12 gap-2"
                              >
                                <input
                                  className={`${INPUT_CLS_SM} col-span-5`}
                                  placeholder="Ejercicio"
                                  value={ex.name}
                                  onChange={(e) =>
                                    updateExercise(wi, di, ei, {
                                      name: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  className={`${INPUT_CLS_SM} col-span-2`}
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
                                <input
                                  className={`${INPUT_CLS_SM} col-span-2`}
                                  placeholder="Reps"
                                  value={ex.reps ?? ''}
                                  onChange={(e) =>
                                    updateExercise(wi, di, ei, {
                                      reps: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  className={`${INPUT_CLS_SM} col-span-2`}
                                  placeholder="Notas"
                                  value={ex.notes ?? ''}
                                  onChange={(e) =>
                                    updateExercise(wi, di, ei, {
                                      notes: e.target.value,
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeExercise(wi, di, ei)
                                  }
                                  className="col-span-1 rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addExercise(wi, di)}
                              className={BTN_SECONDARY}
                            >
                              <Plus className="h-3 w-3" />
                              Añadir ejercicio
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addDay(wi)}
                        className={BTN_SECONDARY}
                      >
                        <Plus className="h-3 w-3" />
                        Añadir día
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addWeek}
                  className={BTN_SECONDARY}
                >
                  <Plus className="h-4 w-4" />
                  Añadir semana
                </button>
              </div>
            </TabsContent>

            <TabsContent value="media">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    URL de portada
                  </label>
                  <input
                    value={state.cover_url}
                    onChange={(e) =>
                      setState({ ...state, cover_url: e.target.value })
                    }
                    placeholder="https://cdn.cedgym.mx/covers/…"
                    className={INPUT_CLS}
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
                    <label className="text-xs font-semibold text-slate-600">
                      Videos (URLs)
                    </label>
                    <button
                      type="button"
                      onClick={addVideo}
                      className={BTN_SECONDARY}
                    >
                      <Plus className="h-3 w-3" />
                      Añadir video
                    </button>
                  </div>
                  <div className="space-y-2">
                    {state.video_urls.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">
                        Sin videos.
                      </div>
                    )}
                    {state.video_urls.map((u, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={u}
                          onChange={(e) => updateVideo(i, e.target.value)}
                          placeholder="https://…"
                          className={INPUT_CLS}
                        />
                        <button
                          type="button"
                          onClick={() => removeVideo(i)}
                          className="rounded-md p-2 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
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
            onClick={() => save.mutate()}
            disabled={save.isPending || disabled}
            className={BTN_PRIMARY}
          >
            {save.isPending
              ? 'Guardando…'
              : isEdit
              ? 'Guardar cambios'
              : 'Crear producto'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
