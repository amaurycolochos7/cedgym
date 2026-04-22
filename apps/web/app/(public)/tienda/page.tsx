'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { productsApi } from '@/lib/api';
import type { Product } from '@/lib/schemas';
import { ProductCard } from '@/components/marketplace/product-card';

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

const inputCls =
  'flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60';

const selectCls =
  'flex h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60';

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
        <h1 className="font-display text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
          Tienda{' '}
          <span className="bg-gradient-to-r from-blue-600 to-sky-500 bg-clip-text text-transparent">
            CED·GYM
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
          Rutinas, planes de nutrición y cursos diseñados por los entrenadores de
          la casa. Compra una vez, descarga para siempre.
        </p>
      </section>

      {/* Filters */}
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-600">
            <SlidersHorizontal size={14} />
            Filtros{' '}
            {activeFilters > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                {activeFilters}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Buscar..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className={`${inputCls} pl-9`}
            />
          </div>
          <select
            value={sport}
            onChange={(e) => {
              setSport(e.target.value);
              setPage(1);
            }}
            className={selectCls}
          >
            {SPORTS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPage(1);
            }}
            className={selectCls}
          >
            {LEVELS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
            className={selectCls}
          >
            {KINDS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Min $"
              value={minPrice}
              min={0}
              onChange={(e) =>
                setMinPrice(e.target.value === '' ? '' : Number(e.target.value))
              }
              className={inputCls}
            />
            <input
              type="number"
              placeholder="Max $"
              value={maxPrice}
              min={0}
              onChange={(e) =>
                setMaxPrice(e.target.value === '' ? '' : Number(e.target.value))
              }
              className={inputCls}
            />
          </div>
        </div>
      </section>

      {/* Results */}
      <section>
        <div className="mb-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {isLoading
              ? 'Cargando…'
              : `${total.toLocaleString('es-MX')} resultados`}
          </span>
        </div>

        {isError && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            No pudimos cargar el catálogo. Mostrando ejemplos mientras tanto.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
                />
              ))
            : items.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>

        {pages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">
              Página {page} de {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </section>
    </>
  );
}
