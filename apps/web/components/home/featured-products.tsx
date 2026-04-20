'use client';

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { productsApi } from '@/lib/api';
import type { Product } from '@/lib/schemas';
import { ProductCard } from '@/components/marketplace/product-card';

/* Fallback placeholder cards when API is unreachable / empty. */
const FALLBACK: Product[] = [
  {
    id: 'placeholder-1',
    slug: 'powerlifting-12w',
    name: 'Powerlifting 12 Semanas',
    short_description:
      'Programa SBD con revisión por video. Avanzado basado en ciencia.',
    kind: 'ROUTINE',
    sport: 'powerlifting',
    level: 'advanced',
    price_mxn: 3190,
    weeks: 12,
    featured: true,
    rating_avg: 4.8,
    rating_count: 42,
    cover_url:
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200',
  },
  {
    id: 'placeholder-2',
    slug: 'pretemporada-football',
    name: 'Pretemporada Football',
    short_description:
      'Fuerza, potencia y condición para llegar al campo al 100%.',
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
    id: 'placeholder-3',
    slug: 'nutricion-deportiva',
    name: 'Nutrición Deportiva',
    short_description:
      'Plan alimenticio por objetivo con seguimiento semanal.',
    kind: 'NUTRITION_PLAN',
    sport: 'general',
    level: 'beginner',
    price_mxn: 1290,
    featured: false,
    rating_avg: 4.6,
    rating_count: 28,
  },
];

export function FeaturedProducts() {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () =>
      productsApi.list({ featured: true, limit: 6 }).then((r) => r.items),
    retry: 0,
  });

  const items = data && data.length > 0 ? data : FALLBACK;

  return (
    <section
      id="marketplace"
      className="border-y border-white/5 bg-brand-dark py-16 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-brand-orange sm:text-sm">
            Marketplace
          </span>
          <h2 className="px-2 text-3xl font-black uppercase sm:text-4xl md:text-5xl">
            Rutinas <span className="text-gradient">destacadas</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base font-light text-gray-400 sm:text-lg">
            Programas probados, escritos por entrenadores de la casa.
            Compra, descarga y entrena hoy.
          </p>
          <div className="mx-auto mt-6 h-1.5 w-20 rounded-full bg-brand-orange sm:w-24" />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="glass-card h-80 animate-pulse rounded-3xl"
                />
              ))
            : items.slice(0, 6).map((p) => (
                <div key={p.id} className="relative">
                  <ProductCard product={p} />
                  <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <Link
                      href={
                        isAuthenticated
                          ? `/checkout/${p.id}?type=product`
                          : `/register?redirect=/checkout/${p.id}&product=${p.slug}`
                      }
                      className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-brand-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-black shadow-brand"
                    >
                      <ShoppingCart size={14} /> Comprar
                    </Link>
                  </div>
                </div>
              ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/tienda"
            className="inline-flex items-center gap-2 rounded-full border border-brand-orange/40 bg-brand-orange/10 px-6 py-3 text-xs font-black uppercase tracking-widest text-brand-orange transition-colors hover:bg-brand-orange hover:text-black"
          >
            Ver tienda completa
          </Link>
        </div>
      </div>
    </section>
  );
}
