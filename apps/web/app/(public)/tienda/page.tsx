'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { productsApi } from '@/lib/api';
import type { Product } from '@/lib/schemas';
import { ProductCard } from '@/components/marketplace/product-card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const SPORTS = [
  { v: '', l: 'Todos los deportes' },
  { v: 'football', l: 'Fútbol Americano' },
  { v: 'soccer', l: 'Fútbol Soccer' },
  { v: 'basketball', l: 'Básquetbol' },
  { v: 'tennis', l: 'Tenis / Pádel' },
  { v: 'powerlifting', l: 'Powerlifting' },
  { v: 'mma', l: 'MMA' },
  { v: 'hyrox', l: 'HYROX' },
  { v: 'general', l: 'General' },
];

const LEVELS = [
  { v: '', l: 'Todos los niveles' },
  { v: 'beginner', l: 'Principiante' },
  { v: 'intermediate', l: 'Intermedio' },
  { v: 'advanced', l: 'Avanzado' },
];

const KINDS = [
  { v: '', l: 'Todos los tipos' },
  { v: 'ROUTINE', l: 'Rutinas' },
  { v: 'NUTRITION_PLAN', l: 'Planes de nutrición' },
  { v: 'COURSE', l: 'Cursos' },
];

const PAGE_SIZE = 12;

// Fallback for dev when API is down.
const FALLBACK: Product[] = [
  {
    id: 'fb-1',
    slug: 'powerlifting-12w',
    name: 'Powerlifting 12 Semanas',
    short_description: 'Programa SBD con revisión por video semanal.',
    kind: 'ROUTINE',
    sport: 'powerlifting',
    level: 'advanced',
    price_mxn: 3190,
    weeks: 12,
    featured: true,
    rating_avg: 4.8,
    rating_count: 42,
  },
  {
    id: 'fb-2',
    slug: 'pretemporada-football',
    name: 'Pretemporada Football',
    short_description: 'Fuerza, potencia y condición para llegar al campo.',
    kind: 'ROUTINE',
    sport: 'football',
    level: 'intermediate',
    price_mxn: 2490,
    weeks: 8,
    featured: true,
    rating_avg: 4.7,
    rating_count: 31,
  },
  {
    id: 'fb-3',
    slug: 'nutricion-deportiva',
    name: 'Nutrición Deportiva',
    short_description: 'Plan alimenticio por objetivo.',
    kind: 'NUTRITION_PLAN',
    price_mxn: 1290,
    rating_avg: 4.6,
    rating_count: 28,
  },
];

export default function TiendaPage() {
  const [q, setQ] = useState('');
  const [sport, setSport] = useState('');
  const [level, setLevel] = useState('');
  const [kind, setKind] = useState('');
  const [minPrice, setMinPrice] = useState<number | ''>('');
  const [maxPrice, setMaxPrice] = useState<number | ''>('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({
      q: q || undefined,
      sport: sport || undefined,
      level: level || undefined,
      kind: kind || undefined,
      minPrice: minPrice === '' ? undefined : Number(minPrice),
      maxPrice: maxPrice === '' ? undefined : Number(maxPrice),
      page,
      limit: PAGE_SIZE,
    }),
    [q, sport, level, kind, minPrice, maxPrice, page],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tienda', params],
    queryFn: () => productsApi.list(params),
    placeholderData: (prev) => prev,
  });

  const items = data?.items && data.items.length > 0 ? data.items : FALLBACK;
  const total = data?.total ?? items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeFilters =
    [sport, level, kind].filter(Boolean).length +
    (minPrice !== '' ? 1 : 0) +
    (maxPrice !== '' ? 1 : 0);

  return (
    <>
      <section className="mb-10">
        <h1 className="text-4xl font-black uppercase leading-tight sm:text-5xl">
          Tienda <span className="text-gradient">CED·GYM</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/60 sm:text-base">
          Rutinas, planes de nutrición y cursos diseñados por los entrenadores de
          la casa. Compra una vez, descarga para siempre.
        </p>
      </section>

      {/* Filters */}
      <section className="mb-8 rounded-2xl border border-white/5 bg-brand-gray p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/60">
            <SlidersHorizontal size={14} />
            Filtros{' '}
            {activeFilters > 0 && (
              <Badge variant="brand">{activeFilters}</Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <Input
              placeholder="Buscar..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={sport}
            onChange={(e) => {
              setSport(e.target.value);
              setPage(1);
            }}
          >
            {SPORTS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </Select>
          <Select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPage(1);
            }}
          >
            {LEVELS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </Select>
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            {KINDS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="Min $"
              value={minPrice}
              min={0}
              onChange={(e) =>
                setMinPrice(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
            <Input
              type="number"
              placeholder="Max $"
              value={maxPrice}
              min={0}
              onChange={(e) =>
                setMaxPrice(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </div>
        </div>
      </section>

      {/* Results */}
      <section>
        <div className="mb-4 flex items-center justify-between text-sm text-white/60">
          <span>
            {isLoading
              ? 'Cargando…'
              : `${total.toLocaleString('es-MX')} resultados`}
          </span>
        </div>

        {isError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            No pudimos cargar el catálogo. Mostrando ejemplos mientras tanto.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-80 rounded-3xl" />
              ))
            : items.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>

        {pages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition hover:border-brand-orange/40 hover:text-white disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-white/60">
              Página {page} de {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/70 transition hover:border-brand-orange/40 hover:text-white disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </section>
    </>
  );
}
