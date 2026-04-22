'use client';

import { useState } from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  Clock,
  Lock,
  PlayCircle,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { productsApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Product } from '@/lib/schemas';
import { RatingStars } from '@/components/marketplace/rating-stars';

// Fallback product
const FALLBACK_MAP: Record<string, Product> = {
  'powerlifting-12w': {
    id: 'fb-1',
    slug: 'powerlifting-12w',
    name: 'Powerlifting 12 Semanas',
    short_description:
      'Programa SBD con revisión por video. Avanzado basado en ciencia.',
    description:
      'Programación de 12 semanas para Sentadilla, Press Banca y Peso Muerto. Incluye un microciclo inicial de acumulación, un bloque de intensificación y una semana de pico con simulacro de meet. Cada ejercicio trae videos explicativos, rangos RPE y tolerancias de peso. Esperas ganar 10–15kg en tu total de competencia al finalizar el ciclo.',
    kind: 'ROUTINE',
    sport: 'powerlifting',
    level: 'advanced',
    price_mxn: 3190,
    weeks: 12,
    featured: true,
    rating_avg: 4.8,
    rating_count: 42,
    cover_url:
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1600',
    author: {
      id: 'coach-nayo',
      name: 'Coach Nayo',
      bio: '+10 años preparando atletas. IPF coach certificado.',
    },
    preview_weeks: [
      {
        id: 'w1',
        week_index: 1,
        title: 'Semana 1 · Acumulación',
        days: [
          {
            id: 'd1',
            day_index: 1,
            title: 'Sentadilla + Accesorios',
            exercises: [
              { id: 'e1', name: 'Back Squat', sets: 4, reps: '8 @ RPE 7' },
              { id: 'e2', name: 'Prensa', sets: 3, reps: '10-12' },
              { id: 'e3', name: 'Split squat', sets: 3, reps: '12/lado' },
            ],
          },
          {
            id: 'd2',
            day_index: 2,
            title: 'Press banca pesado',
            exercises: [
              { id: 'e4', name: 'Bench press', sets: 4, reps: '6 @ RPE 8' },
              { id: 'e5', name: 'Press inclinado', sets: 3, reps: '8-10' },
              { id: 'e6', name: 'Remo con barra', sets: 4, reps: '8' },
            ],
          },
        ],
      },
      {
        id: 'w2',
        week_index: 2,
        title: 'Semana 2 · Acumulación',
        locked: false,
        days: [],
      },
      {
        id: 'w3',
        week_index: 3,
        locked: true,
        title: 'Semana 3',
        days: [],
      },
    ],
    reviews: [
      {
        id: 'r1',
        user_name: 'Andrés G.',
        rating: 5,
        title: 'Subí 17kg en mi total',
        body: 'Programa sólido. La revisión por video hace la diferencia.',
        created_at: '2026-03-10',
      },
    ],
  },
};

type TabKey = 'desc' | 'contenido' | 'reviews';

// Simple avatar (light theme)
function LightAvatar({
  src,
  fallback,
  className,
}: {
  src?: string;
  fallback: string;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  return (
    <span
      className={
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-sm font-bold uppercase text-blue-700 ' +
        (className ?? 'h-10 w-10')
      }
    >
      {src && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setErr(true)}
        />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  );
}

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<TabKey>('desc');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['product', slug],
    queryFn: () => productsApi.get(slug),
    retry: 1,
  });

  const product = data ?? FALLBACK_MAP[slug];
  if (!isLoading && isError && !product) return notFound();

  if (isLoading || !product) {
    return (
      <div className="space-y-8">
        <div className="h-72 w-full animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        <div className="h-12 w-2/3 animate-pulse rounded-md bg-slate-100" />
        <div className="h-96 w-full animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      </div>
    );
  }

  const buyHref = product.purchased
    ? `/portal/rutinas/${product.purchase_id}`
    : isAuthenticated
      ? `/checkout/${product.id}?type=product`
      : `/register?redirect=/checkout/${product.id}&product=${product.slug}`;

  const tabBtnCls = (k: TabKey) =>
    'inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition ' +
    (tab === k
      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900');

  return (
    <article className="space-y-10">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr]">
          <div className="relative h-64 md:h-auto">
            {product.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.cover_url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-blue-100 via-sky-50 to-white" />
            )}
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              {product.featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                  Destacado
                </span>
              )}
              {product.level && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700 ring-1 ring-slate-200 backdrop-blur">
                  {product.level}
                </span>
              )}
              {product.weeks && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700 ring-1 ring-slate-200 backdrop-blur">
                  <Clock size={10} /> {product.weeks} semanas
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-4 p-6 sm:p-8">
            <h1 className="font-display text-3xl font-black leading-tight tracking-tight text-slate-900 sm:text-4xl">
              {product.name}
            </h1>
            {product.rating_avg !== undefined && (
              <RatingStars
                value={product.rating_avg}
                count={product.rating_count}
                showValue
              />
            )}
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
              {product.short_description}
            </p>
            <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Precio
                </p>
                <p className="text-3xl font-black text-slate-900">
                  ${product.price_mxn.toLocaleString('es-MX')}{' '}
                  <span className="text-sm font-normal text-slate-500">MXN</span>
                </p>
              </div>
              {product.purchased ? (
                <Link
                  href={buyHref}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-3 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5"
                >
                  <PlayCircle size={14} /> Ir a mi rutina
                </Link>
              ) : (
                <button
                  onClick={() => router.push(buyHref)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-3 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5"
                >
                  <ShoppingCart size={14} /> Comprar ya
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              <ShieldCheck size={12} className="text-blue-600" /> Pago seguro con
              Mercado Pago
            </div>
          </div>
        </div>
      </section>

      {/* Tabs (native) */}
      <div>
        <div
          role="tablist"
          className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-sm shadow-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'desc'}
            onClick={() => setTab('desc')}
            className={tabBtnCls('desc')}
          >
            Descripción
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'contenido'}
            onClick={() => setTab('contenido')}
            className={tabBtnCls('contenido')}
          >
            Contenido
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'reviews'}
            onClick={() => setTab('reviews')}
            className={tabBtnCls('reviews')}
          >
            Reseñas
          </button>
        </div>

        <div className="mt-4">
          {tab === 'desc' && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 sm:text-base">
                {product.description ?? product.short_description}
              </p>
            </div>
          )}

          {tab === 'contenido' && (
            <div className="space-y-3">
              {(product.preview_weeks ?? []).length === 0 && (
                <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                  El contenido se desbloquea después de la compra.
                </p>
              )}
              {(product.preview_weeks ?? []).map((w) => (
                <details
                  key={w.id}
                  className={`group rounded-2xl border p-5 transition ${
                    w.locked
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-blue-200 bg-white shadow-sm'
                  }`}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${
                          w.locked
                            ? 'bg-slate-100 text-slate-400'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {w.week_index}
                      </span>
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-wide text-slate-900">
                          {w.title ?? `Semana ${w.week_index}`}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {w.locked
                            ? 'Desbloquea tras la compra'
                            : `${w.days.length} días`}
                        </p>
                      </div>
                    </div>
                    {w.locked ? (
                      <Lock size={16} className="text-slate-400" />
                    ) : (
                      <ArrowRight
                        size={16}
                        className="text-blue-600 transition group-open:rotate-90"
                      />
                    )}
                  </summary>
                  {!w.locked && w.days.length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                      {w.days.map((d) => (
                        <div
                          key={d.id}
                          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                        >
                          <h5 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-700">
                            Día {d.day_index} · {d.title}
                          </h5>
                          <ul className="space-y-1.5 text-sm">
                            {d.exercises.map((e) => (
                              <li
                                key={e.id}
                                className="flex items-center justify-between text-slate-700"
                              >
                                <span>{e.name}</span>
                                {e.sets && e.reps && (
                                  <span className="text-xs text-slate-500">
                                    {e.sets} × {e.reps}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              ))}
            </div>
          )}

          {tab === 'reviews' && (
            <div className="space-y-4">
              {(product.reviews ?? []).length === 0 && (
                <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
                  Todavía no hay reseñas. Sé el primero.
                </p>
              )}
              {(product.reviews ?? []).map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <LightAvatar
                        src={r.user_avatar}
                        fallback={r.user_name.slice(0, 2)}
                        className="h-9 w-9 text-xs"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {r.user_name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(r.created_at).toLocaleDateString('es-MX')}
                        </p>
                      </div>
                    </div>
                    <RatingStars value={r.rating} />
                  </div>
                  <h5 className="mt-3 text-sm font-bold uppercase text-slate-900">
                    {r.title}
                  </h5>
                  <p className="mt-1 text-sm text-slate-600">{r.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Author */}
      {product.author && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <LightAvatar
              src={product.author.avatar_url}
              fallback={product.author.name.slice(0, 2)}
              className="h-20 w-20 text-xl"
            />
            <div className="flex-1 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
                Autor
              </p>
              <h4 className="font-display text-xl font-black uppercase text-slate-900">
                {product.author.name}
              </h4>
              {product.author.bio && (
                <p className="mt-1 text-sm text-slate-600">{product.author.bio}</p>
              )}
              <Link
                href={`/tienda?authorId=${product.author.id}`}
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-blue-600 transition hover:text-blue-700"
              >
                Ver otros productos <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Features row */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          'Acceso de por vida',
          'Videos explicativos',
          'Descarga PDF',
          'Reembolso 7 días',
        ].map((t) => (
          <div
            key={t}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm"
          >
            <Check size={14} className="text-blue-600" /> {t}
          </div>
        ))}
      </section>
    </article>
  );
}
