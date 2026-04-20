'use client';

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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/marketplace/rating-stars';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

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

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

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
        <Skeleton className="h-72 w-full rounded-3xl" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const buyHref = product.purchased
    ? `/portal/rutinas/${product.purchase_id}`
    : isAuthenticated
      ? `/checkout/${product.id}?type=product`
      : `/register?redirect=/checkout/${product.id}&product=${product.slug}`;

  return (
    <article className="space-y-10">
      {/* Hero */}
      <section className="glass-card overflow-hidden rounded-3xl">
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
              <div
                className="h-full w-full"
                style={{
                  background:
                    'radial-gradient(circle at 30% 40%, rgba(255,107,26,.45), transparent 55%), linear-gradient(135deg, #2a1004, #0a0503)',
                }}
              />
            )}
            <div className="absolute left-4 top-4 flex gap-2">
              {product.featured && <Badge variant="brand">Destacado</Badge>}
              {product.level && (
                <Badge variant="muted" className="capitalize">
                  {product.level}
                </Badge>
              )}
              {product.weeks && (
                <Badge variant="muted" className="gap-1">
                  <Clock size={10} /> {product.weeks} semanas
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-4 p-6 sm:p-8">
            <h1 className="text-3xl font-black uppercase leading-tight tracking-tight sm:text-4xl">
              {product.name}
            </h1>
            {product.rating_avg !== undefined && (
              <RatingStars
                value={product.rating_avg}
                count={product.rating_count}
                showValue
              />
            )}
            <p className="text-sm leading-relaxed text-white/70 sm:text-base">
              {product.short_description}
            </p>
            <div className="mt-auto flex items-end justify-between border-t border-white/5 pt-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Precio
                </p>
                <p className="text-3xl font-black">
                  ${product.price_mxn.toLocaleString('es-MX')}{' '}
                  <span className="text-sm font-normal text-white/60">MXN</span>
                </p>
              </div>
              {product.purchased ? (
                <Link
                  href={buyHref}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-5 py-3 text-xs font-black uppercase tracking-widest text-black shadow-brand"
                >
                  <PlayCircle size={14} /> Ir a mi rutina
                </Link>
              ) : (
                <button
                  onClick={() => router.push(buyHref)}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-orange px-5 py-3 text-xs font-black uppercase tracking-widest text-black shadow-brand transition hover:bg-brand-orange-2"
                >
                  <ShoppingCart size={14} /> Comprar
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/50">
              <ShieldCheck size={12} className="text-brand-orange" /> Pago seguro
              con Mercado Pago
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <Tabs defaultValue="desc">
        <TabsList>
          <TabsTrigger value="desc">Descripción</TabsTrigger>
          <TabsTrigger value="contenido">Contenido</TabsTrigger>
          <TabsTrigger value="reviews">Reseñas</TabsTrigger>
        </TabsList>

        <TabsContent value="desc">
          <div className="glass-card rounded-3xl p-6 sm:p-8">
            <p className="whitespace-pre-line text-sm leading-relaxed text-white/80 sm:text-base">
              {product.description ?? product.short_description}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="contenido">
          <div className="space-y-3">
            {(product.preview_weeks ?? []).length === 0 && (
              <p className="rounded-2xl border border-white/5 bg-white/5 p-6 text-sm text-white/60">
                El contenido se desbloquea después de la compra.
              </p>
            )}
            {(product.preview_weeks ?? []).map((w) => (
              <details
                key={w.id}
                className={`group rounded-2xl border p-5 transition ${
                  w.locked
                    ? 'border-white/5 bg-white/[0.02]'
                    : 'border-brand-orange/20 bg-white/[0.04]'
                }`}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${
                        w.locked
                          ? 'bg-white/5 text-white/40'
                          : 'bg-brand-orange/15 text-brand-orange'
                      }`}
                    >
                      {w.week_index}
                    </span>
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wide">
                        {w.title ?? `Semana ${w.week_index}`}
                      </h4>
                      <p className="text-xs text-white/50">
                        {w.locked
                          ? 'Desbloquea tras la compra'
                          : `${w.days.length} días`}
                      </p>
                    </div>
                  </div>
                  {w.locked ? (
                    <Lock size={16} className="text-white/40" />
                  ) : (
                    <ArrowRight
                      size={16}
                      className="text-brand-orange transition group-open:rotate-90"
                    />
                  )}
                </summary>
                {!w.locked && w.days.length > 0 && (
                  <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                    {w.days.map((d) => (
                      <div
                        key={d.id}
                        className="rounded-xl border border-white/5 bg-white/[0.02] p-4"
                      >
                        <h5 className="mb-2 text-xs font-bold uppercase tracking-widest text-white/80">
                          Día {d.day_index} · {d.title}
                        </h5>
                        <ul className="space-y-1.5 text-sm">
                          {d.exercises.map((e) => (
                            <li
                              key={e.id}
                              className="flex items-center justify-between text-white/70"
                            >
                              <span>{e.name}</span>
                              {e.sets && e.reps && (
                                <span className="text-xs text-white/40">
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
        </TabsContent>

        <TabsContent value="reviews">
          <div className="space-y-4">
            {(product.reviews ?? []).length === 0 && (
              <p className="rounded-2xl border border-white/5 bg-white/5 p-6 text-sm text-white/60">
                Todavía no hay reseñas. Sé el primero.
              </p>
            )}
            {(product.reviews ?? []).map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-white/5 bg-white/[0.03] p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      {r.user_avatar && <AvatarImage src={r.user_avatar} />}
                      <AvatarFallback>
                        {r.user_name.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-bold text-white">
                        {r.user_name}
                      </p>
                      <p className="text-[11px] text-white/50">
                        {new Date(r.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                  </div>
                  <RatingStars value={r.rating} />
                </div>
                <h5 className="mt-3 text-sm font-bold uppercase">{r.title}</h5>
                <p className="mt-1 text-sm text-white/70">{r.body}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Author */}
      {product.author && (
        <section className="glass-card rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <Avatar className="h-20 w-20">
              {product.author.avatar_url && (
                <AvatarImage src={product.author.avatar_url} />
              )}
              <AvatarFallback>{product.author.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-orange">
                Autor
              </p>
              <h4 className="text-xl font-black uppercase">
                {product.author.name}
              </h4>
              {product.author.bio && (
                <p className="mt-1 text-sm text-white/70">{product.author.bio}</p>
              )}
              <Link
                href={`/tienda?authorId=${product.author.id}`}
                className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-brand-orange hover:text-white"
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
            className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-xs text-white/70"
          >
            <Check size={14} className="text-brand-orange" /> {t}
          </div>
        ))}
      </section>
    </article>
  );
}
