'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Image as ImageIcon,
  Plus,
  Save,
  Send,
  Trash2,
  Video,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  trainerApi,
  type CreateProductBody,
  type TrainerProduct,
  type UpdateProductBody,
} from '@/lib/trainer-api';

/* ─── Content shape (loose) ──────────────────────────────────────── */

interface EditorExercise {
  id: string;
  name: string;
  sets?: number;
  reps?: string;
  rest_sec?: number;
  notes?: string;
  video_url?: string;
}

interface EditorDay {
  id: string;
  day_index: number;
  title: string;
  exercises: EditorExercise[];
}

interface EditorWeek {
  id: string;
  week_index: number;
  title: string;
  days: EditorDay[];
}

type ProductLevel = NonNullable<CreateProductBody['level']>;

interface EditorState {
  type: CreateProductBody['type'];
  title: string;
  description: string;
  sport?: string;
  level: ProductLevel;
  duration_weeks?: number;
  price_mxn: number;
  sale_price_mxn?: number | null;
  cover_url?: string;
  video_urls: string[];
  weeks: EditorWeek[];
}

const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

function hydrateFromProduct(p: TrainerProduct): EditorState {
  const content = (p.content ?? {}) as { weeks?: EditorWeek[] };
  const weeks = Array.isArray(content.weeks) ? content.weeks : [];
  return {
    type: p.type as CreateProductBody['type'],
    title: p.title,
    description: p.description,
    sport: p.sport ?? undefined,
    level: (p.level as EditorState['level']) ?? 'ALL_LEVELS',
    duration_weeks: p.duration_weeks ?? undefined,
    price_mxn: p.price_mxn,
    sale_price_mxn: p.sale_price_mxn ?? null,
    cover_url: p.cover_url ?? undefined,
    video_urls: Array.isArray(p.video_urls) ? p.video_urls : [],
    weeks: weeks.map((w, wi) => ({
      id: w.id || uid(),
      week_index: w.week_index ?? wi + 1,
      title: w.title || `Semana ${wi + 1}`,
      days: Array.isArray(w.days)
        ? w.days.map((d, di) => ({
            id: d.id || uid(),
            day_index: d.day_index ?? di + 1,
            title: d.title || `Día ${di + 1}`,
            exercises: Array.isArray(d.exercises)
              ? d.exercises.map((e) => ({
                  id: (e as { id?: string }).id || uid(),
                  name: e.name || '',
                  sets: e.sets,
                  reps: e.reps,
                  rest_sec: e.rest_sec,
                  notes: e.notes,
                  video_url: e.video_url,
                }))
              : [],
          }))
        : [],
    })),
  };
}

function blankState(): EditorState {
  return {
    type: 'ROUTINE',
    title: '',
    description: '',
    level: 'ALL_LEVELS',
    price_mxn: 0,
    sale_price_mxn: null,
    video_urls: [],
    weeks: [],
  };
}

/* ─── Main component ─────────────────────────────────────────────── */

interface ProductEditorProps {
  /** When present, we're in edit mode. */
  initial?: TrainerProduct;
}

export function ProductEditor({ initial }: ProductEditorProps) {
  const router = useRouter();
  const qc = useQueryClient();

  const [state, setState] = React.useState<EditorState>(() =>
    initial ? hydrateFromProduct(initial) : blankState(),
  );
  const [tab, setTab] = React.useState('info');

  const isEditing = !!initial;
  const wasPublished = !!initial?.published;

  const patch = <K extends keyof EditorState>(k: K, v: EditorState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const buildBody = React.useCallback(
    (): CreateProductBody => ({
      type: state.type,
      title: state.title.trim(),
      description: state.description.trim(),
      level: state.level,
      price_mxn: Number(state.price_mxn) || 0,
      sale_price_mxn:
        state.sale_price_mxn == null || state.sale_price_mxn === 0
          ? null
          : Number(state.sale_price_mxn),
      duration_weeks: state.duration_weeks
        ? Number(state.duration_weeks)
        : undefined,
      sport: state.sport || undefined,
      cover_url: state.cover_url || undefined,
      video_urls: state.video_urls.filter(Boolean),
      content: { weeks: state.weeks },
    }),
    [state],
  );

  const validate = React.useCallback(() => {
    if (state.title.trim().length < 3) return 'Título demasiado corto';
    if (state.description.trim().length < 10)
      return 'La descripción necesita al menos 10 caracteres';
    if (state.price_mxn < 0) return 'El precio no puede ser negativo';
    if (
      state.sale_price_mxn != null &&
      state.sale_price_mxn !== 0 &&
      state.sale_price_mxn >= state.price_mxn
    ) {
      return 'El precio en oferta debe ser menor al normal';
    }
    return null;
  }, [state]);

  const save = useMutation({
    mutationFn: async () => {
      const body = buildBody();
      if (initial) {
        return trainerApi.updateProduct(initial.id, body as UpdateProductBody);
      }
      return trainerApi.createProduct(body);
    },
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['trainer', 'products'] });
      qc.invalidateQueries({ queryKey: ['trainer', 'dashboard'] });
      toast.success(
        initial ? 'Cambios guardados' : 'Producto creado como borrador',
      );
      if (!initial) {
        router.replace(`/trainer/products/${product.id}`);
      }
    },
    onError: (e: unknown) => {
      const msg =
        (e as { message?: string })?.message ?? 'No se pudo guardar';
      toast.error(msg);
    },
  });

  const onSaveDraft = () => {
    const err = validate();
    if (err) return toast.error(err);
    save.mutate();
  };

  const onRequestReview = () => {
    const err = validate();
    if (err) return toast.error(err);
    // On the backend, non-admin PATCH on published=true flips back to false.
    // For fresh creates, products are created with published=false by default.
    // So "solicitar revisión" is functionally the same as "guardar" — we
    // surface it to the user as a clear intent.
    save.mutate(undefined, {
      onSuccess: () => {
        toast.success('Enviado a revisión', {
          description: 'Un admin revisará el producto antes de publicarlo.',
        });
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-widest text-white">
            {initial ? 'Editar rutina' : 'Nueva rutina'}
          </h1>
          <p className="text-sm text-white/50">
            {initial
              ? 'Modifica la info, contenido o multimedia. Cualquier cambio manda el producto a revisión.'
              : 'Crea tu producto como borrador. Cuando esté listo, envíalo a revisión.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {initial && (
            <Badge variant={wasPublished ? 'success' : 'warning'}>
              {wasPublished ? 'Publicado' : 'Borrador / Pendiente'}
            </Badge>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onSaveDraft}
            loading={save.isPending}
          >
            <Save className="h-4 w-4" />
            Guardar borrador
          </Button>
          <Button size="sm" onClick={onRequestReview} loading={save.isPending}>
            <Send className="h-4 w-4" />
            Solicitar revisión
          </Button>
        </div>
      </div>

      {wasPublished && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            Este producto ya está publicado. Guardar cambios lo devolverá a
            estado <strong>pendiente de aprobación</strong> hasta que un admin
            lo revise otra vez.
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="content">Contenido</TabsTrigger>
          <TabsTrigger value="media">Multimedia</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <InfoTab state={state} patch={patch} />
        </TabsContent>
        <TabsContent value="content">
          <ContentTab state={state} setState={setState} />
        </TabsContent>
        <TabsContent value="media">
          <MediaTab state={state} patch={patch} />
        </TabsContent>
        <TabsContent value="preview">
          <PreviewTab state={state} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Tabs ───────────────────────────────────────────────────────── */

interface TabProps {
  state: EditorState;
  patch: <K extends keyof EditorState>(k: K, v: EditorState[K]) => void;
}

function InfoTab({ state, patch }: TabProps) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Field label="Título">
        <Input
          value={state.title}
          onChange={(e) => patch('title', e.target.value)}
          placeholder="Rutina de fuerza 12 semanas"
        />
      </Field>
      <Field label="Tipo">
        <Select
          value={state.type}
          onChange={(e) =>
            patch('type', e.target.value as CreateProductBody['type'])
          }
        >
          <option value="ROUTINE">Rutina</option>
          <option value="NUTRITION_PLAN">Plan nutrición</option>
          <option value="EBOOK">E-book</option>
          <option value="VIDEO_COURSE">Curso en video</option>
          <option value="BUNDLE">Bundle</option>
        </Select>
      </Field>
      <Field label="Descripción" className="lg:col-span-2">
        <textarea
          value={state.description}
          onChange={(e) => patch('description', e.target.value)}
          rows={5}
          placeholder="Describe qué aprenderá el atleta, objetivos, equipamiento…"
          className="flex w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-orange/60 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
        />
      </Field>
      <Field label="Nivel">
        <Select
          value={state.level}
          onChange={(e) =>
            patch('level', e.target.value as EditorState['level'])
          }
        >
          <option value="ALL_LEVELS">Todos los niveles</option>
          <option value="BEGINNER">Principiante</option>
          <option value="INTERMEDIATE">Intermedio</option>
          <option value="ADVANCED">Avanzado</option>
        </Select>
      </Field>
      <Field label="Deporte">
        <Select
          value={state.sport ?? ''}
          onChange={(e) => patch('sport', e.target.value || undefined)}
        >
          <option value="">—</option>
          <option value="GENERAL_FITNESS">Fitness general</option>
          <option value="FOOTBALL">Fútbol</option>
          <option value="BOXING">Boxeo</option>
          <option value="MMA">MMA</option>
          <option value="POWERLIFTING">Powerlifting</option>
          <option value="CROSSFIT">Crossfit</option>
          <option value="WEIGHTLIFTING">Weightlifting</option>
          <option value="RUNNING">Running</option>
          <option value="NUTRITION">Nutrición</option>
          <option value="OTHER">Otro</option>
        </Select>
      </Field>
      <Field label="Duración (semanas)">
        <Input
          type="number"
          min={1}
          max={104}
          value={state.duration_weeks ?? ''}
          onChange={(e) =>
            patch(
              'duration_weeks',
              e.target.value ? Number(e.target.value) : undefined,
            )
          }
          placeholder="12"
        />
      </Field>
      <Field label="Precio (MXN)">
        <Input
          type="number"
          min={0}
          value={state.price_mxn}
          onChange={(e) => patch('price_mxn', Number(e.target.value))}
        />
      </Field>
      <Field label="Precio en oferta (opcional)">
        <Input
          type="number"
          min={0}
          value={state.sale_price_mxn ?? ''}
          onChange={(e) =>
            patch(
              'sale_price_mxn',
              e.target.value ? Number(e.target.value) : null,
            )
          }
          placeholder="Vacío para no ofertar"
        />
      </Field>
    </div>
  );
}

function MediaTab({ state, patch }: TabProps) {
  const addVideoUrl = () => patch('video_urls', [...state.video_urls, '']);
  const setVideoUrl = (idx: number, v: string) => {
    const next = [...state.video_urls];
    next[idx] = v;
    patch('video_urls', next);
  };
  const removeVideoUrl = (idx: number) =>
    patch(
      'video_urls',
      state.video_urls.filter((_, i) => i !== idx),
    );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
          <ImageIcon className="h-4 w-4" />
          Portada
        </h3>
        <Input
          value={state.cover_url ?? ''}
          onChange={(e) => patch('cover_url', e.target.value)}
          placeholder="https://…/cover.jpg"
        />
        {state.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.cover_url}
            alt="Preview"
            className="mt-3 h-48 w-full rounded-lg object-cover"
          />
        )}
        <p className="mt-2 text-[11px] text-white/40">
          Pega un URL a una imagen 16:9. El admin puede rechazar portadas de
          baja calidad.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
            <Video className="h-4 w-4" />
            Videos
          </h3>
          <Button size="sm" variant="ghost" onClick={addVideoUrl}>
            <Plus className="h-3 w-3" />
            Agregar URL
          </Button>
        </div>
        {state.video_urls.length === 0 ? (
          <p className="text-xs text-white/40">
            Sin videos todavía. Acepta URLs de YouTube, Vimeo o MP4 directo.
          </p>
        ) : (
          <ul className="space-y-2">
            {state.video_urls.map((u, i) => (
              <li key={i} className="flex items-center gap-2">
                <Input
                  value={u}
                  onChange={(e) => setVideoUrl(i, e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
                <button
                  type="button"
                  onClick={() => removeVideoUrl(i)}
                  className="rounded-md p-2 text-white/50 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PreviewTab({ state }: { state: EditorState }) {
  const price = state.sale_price_mxn ?? state.price_mxn;
  const weeks = state.weeks;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      {state.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.cover_url}
          alt={state.title}
          className="h-56 w-full object-cover"
        />
      )}
      <div className="p-6 space-y-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-brand-orange">
            {state.type.replace('_', ' ')}
          </div>
          <h2 className="mt-1 text-2xl font-bold text-white">
            {state.title || 'Sin título'}
          </h2>
          <p className="mt-2 text-sm text-white/70 whitespace-pre-wrap">
            {state.description || 'Sin descripción.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="brand">{state.level.replace('_', ' ')}</Badge>
          {state.sport && <Badge variant="default">{state.sport}</Badge>}
          {state.duration_weeks && (
            <Badge variant="default">{state.duration_weeks} semanas</Badge>
          )}
          <span className="ml-auto font-bold text-brand-orange">
            $ {price.toLocaleString('es-MX')} MXN
          </span>
        </div>
        {weeks.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/80">
              Contenido
            </h3>
            {weeks.map((w) => (
              <div
                key={w.id}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3"
              >
                <div className="text-xs font-semibold text-white">
                  {w.title}
                </div>
                <ul className="mt-1 space-y-0.5 text-[11px] text-white/60">
                  {w.days.map((d) => (
                    <li key={d.id}>
                      · {d.title} — {d.exercises.length} ejercicios
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Content tab ────────────────────────────────────────────────── */

function ContentTab({
  state,
  setState,
}: {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
}) {
  const addWeek = () => {
    setState((s) => ({
      ...s,
      weeks: [
        ...s.weeks,
        {
          id: uid(),
          week_index: s.weeks.length + 1,
          title: `Semana ${s.weeks.length + 1}`,
          days: [],
        },
      ],
    }));
  };

  const updateWeek = (id: string, patch: Partial<EditorWeek>) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));

  const removeWeek = (id: string) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks
        .filter((w) => w.id !== id)
        .map((w, i) => ({ ...w, week_index: i + 1 })),
    }));

  const moveWeek = (id: string, dir: -1 | 1) =>
    setState((s) => {
      const idx = s.weeks.findIndex((w) => w.id === id);
      if (idx < 0) return s;
      const j = idx + dir;
      if (j < 0 || j >= s.weeks.length) return s;
      const next = [...s.weeks];
      const [x] = next.splice(idx, 1);
      next.splice(j, 0, x);
      return {
        ...s,
        weeks: next.map((w, i) => ({ ...w, week_index: i + 1 })),
      };
    });

  const addDay = (weekId: string) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks.map((w) => {
        if (w.id !== weekId) return w;
        return {
          ...w,
          days: [
            ...w.days,
            {
              id: uid(),
              day_index: w.days.length + 1,
              title: `Día ${w.days.length + 1}`,
              exercises: [],
            },
          ],
        };
      }),
    }));

  const updateDay = (
    weekId: string,
    dayId: string,
    patch: Partial<EditorDay>,
  ) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks.map((w) =>
        w.id === weekId
          ? {
              ...w,
              days: w.days.map((d) =>
                d.id === dayId ? { ...d, ...patch } : d,
              ),
            }
          : w,
      ),
    }));

  const removeDay = (weekId: string, dayId: string) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks.map((w) =>
        w.id === weekId
          ? {
              ...w,
              days: w.days
                .filter((d) => d.id !== dayId)
                .map((d, i) => ({ ...d, day_index: i + 1 })),
            }
          : w,
      ),
    }));

  const addExercise = (weekId: string, dayId: string) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks.map((w) =>
        w.id === weekId
          ? {
              ...w,
              days: w.days.map((d) =>
                d.id === dayId
                  ? {
                      ...d,
                      exercises: [
                        ...d.exercises,
                        {
                          id: uid(),
                          name: '',
                          sets: 3,
                          reps: '10',
                          rest_sec: 60,
                        },
                      ],
                    }
                  : d,
              ),
            }
          : w,
      ),
    }));

  const updateExercise = (
    weekId: string,
    dayId: string,
    exId: string,
    patch: Partial<EditorExercise>,
  ) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks.map((w) =>
        w.id === weekId
          ? {
              ...w,
              days: w.days.map((d) =>
                d.id === dayId
                  ? {
                      ...d,
                      exercises: d.exercises.map((ex) =>
                        ex.id === exId ? { ...ex, ...patch } : ex,
                      ),
                    }
                  : d,
              ),
            }
          : w,
      ),
    }));

  const removeExercise = (weekId: string, dayId: string, exId: string) =>
    setState((s) => ({
      ...s,
      weeks: s.weeks.map((w) =>
        w.id === weekId
          ? {
              ...w,
              days: w.days.map((d) =>
                d.id === dayId
                  ? {
                      ...d,
                      exercises: d.exercises.filter((ex) => ex.id !== exId),
                    }
                  : d,
              ),
            }
          : w,
      ),
    }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/50">
          Organiza el programa en semanas → días → ejercicios.
        </p>
        <Button size="sm" variant="secondary" onClick={addWeek}>
          <Plus className="h-3 w-3" />
          Agregar semana
        </Button>
      </div>

      {state.weeks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/40">
          Aún no has agregado semanas. Empieza con la primera.
        </div>
      ) : (
        <div className="space-y-3">
          {state.weeks.map((w, wi) => (
            <div
              key={w.id}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-brand-orange">
                  Semana {wi + 1}
                </span>
                <Input
                  value={w.title}
                  onChange={(e) =>
                    updateWeek(w.id, { title: e.target.value })
                  }
                  className="h-9 flex-1"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveWeek(w.id, -1)}
                    className="rounded-md p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveWeek(w.id, 1)}
                    className="rounded-md p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWeek(w.id)}
                    className="rounded-md p-1.5 text-white/50 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 pl-3">
                {w.days.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-white/5 bg-white/[0.02] p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                        Día
                      </span>
                      <Input
                        value={d.title}
                        onChange={(e) =>
                          updateDay(w.id, d.id, { title: e.target.value })
                        }
                        className="h-9 flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removeDay(w.id, d.id)}
                        className="rounded-md p-1.5 text-white/50 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {d.exercises.map((ex) => (
                        <div
                          key={ex.id}
                          className="grid grid-cols-12 items-center gap-1.5"
                        >
                          <Input
                            value={ex.name}
                            onChange={(e) =>
                              updateExercise(w.id, d.id, ex.id, {
                                name: e.target.value,
                              })
                            }
                            placeholder="Ejercicio"
                            className="col-span-5 h-9"
                          />
                          <Input
                            type="number"
                            min={0}
                            value={ex.sets ?? ''}
                            onChange={(e) =>
                              updateExercise(w.id, d.id, ex.id, {
                                sets: e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              })
                            }
                            placeholder="Sets"
                            className="col-span-2 h-9"
                          />
                          <Input
                            value={ex.reps ?? ''}
                            onChange={(e) =>
                              updateExercise(w.id, d.id, ex.id, {
                                reps: e.target.value,
                              })
                            }
                            placeholder="Reps"
                            className="col-span-2 h-9"
                          />
                          <Input
                            type="number"
                            min={0}
                            value={ex.rest_sec ?? ''}
                            onChange={(e) =>
                              updateExercise(w.id, d.id, ex.id, {
                                rest_sec: e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              })
                            }
                            placeholder="Rest (s)"
                            className="col-span-2 h-9"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              removeExercise(w.id, d.id, ex.id)
                            }
                            className="col-span-1 rounded-md p-1.5 text-white/50 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addExercise(w.id, d.id)}
                      >
                        <Plus className="h-3 w-3" />
                        Ejercicio
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => addDay(w.id)}
                >
                  <Plus className="h-3 w-3" />
                  Agregar día
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Field helper ───────────────────────────────────────────────── */

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
        {label}
      </span>
      {children}
    </label>
  );
}
