'use client';

import Link from 'next/link';
import { Clock, Flame } from 'lucide-react';
import { RatingStars } from './rating-stars';
import type { Product } from '@/lib/schemas';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  className?: string;
}

// Unsplash fallbacks por categoría — se aplican cuando el producto no trae cover_url.
// Verified-working IDs that the landing already uses for similar contexts.
const SPORT_FALLBACK_IMG: Record<string, string> = {
  powerlifting: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200',
  weightlifting: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200',
  crossfit: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200',
  football: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?q=80&w=1200',
  soccer: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=1200',
  boxeo: 'https://images.unsplash.com/photo-1517438476312-10d79c077509?q=80&w=1200',
  boxing: 'https://images.unsplash.com/photo-1517438476312-10d79c077509?q=80&w=1200',
  mma: 'https://images.unsplash.com/photo-1517438476312-10d79c077509?q=80&w=1200',
  muaythai: 'https://images.unsplash.com/photo-1517438476312-10d79c077509?q=80&w=1200',
  funcional: 'https://images.unsplash.com/photo-1517344884509-a0c97ec11bc2?q=80&w=1200',
  general: 'https://images.unsplash.com/photo-1517344884509-a0c97ec11bc2?q=80&w=1200',
};

const KIND_FALLBACK_IMG: Record<string, string> = {
  NUTRITION_PLAN: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1200',
  ROUTINE: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200',
  COURSE: 'https://images.unsplash.com/photo-1517344884509-a0c97ec11bc2?q=80&w=1200',
};

const GENERIC_FALLBACK_IMG =
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1200';

function pickCover(p: Product): string {
  if (p.cover_url) return p.cover_url;
  if (p.sport && SPORT_FALLBACK_IMG[p.sport.toLowerCase()])
    return SPORT_FALLBACK_IMG[p.sport.toLowerCase()];
  if (p.kind && KIND_FALLBACK_IMG[p.kind]) return KIND_FALLBACK_IMG[p.kind];
  return GENERIC_FALLBACK_IMG;
}

export function ProductCard({ product, className }: ProductCardProps) {
  const cover = pickCover(product);

  return (
    <Link
      href={`/tienda/${product.slug}`}
      className={cn(
        'group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-md',
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            const img = e.currentTarget;
            img.src = GENERIC_FALLBACK_IMG;
          }}
        />
        {/* Bottom gradient for text contrast on photos */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-slate-900/60 via-slate-900/10 to-transparent" />

        {/* Featured ribbon — top-left corner, prominent */}
        {product.featured && (
          <span className="absolute left-0 top-3 inline-flex items-center gap-1 rounded-r-full bg-blue-600 py-1 pl-3 pr-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-md shadow-blue-600/30">
            <Flame className="h-3 w-3" />
            Destacado
          </span>
        )}

        {/* Weeks chip — top-right, dark blur for legibility on any photo */}
        {product.weeks && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
            <Clock className="h-3 w-3" />
            {product.weeks} sem
          </span>
        )}

        {/* Level — bottom-left, sits on the gradient for legibility */}
        {product.level && (
          <span className="absolute bottom-3 left-3 inline-flex items-center rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-800 shadow-sm">
            {product.level}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="line-clamp-2 font-display text-base font-bold tracking-tight text-slate-900 sm:text-lg">
          {product.name}
        </h3>
        {product.short_description && (
          <p className="mt-1.5 line-clamp-2 text-xs text-slate-600 sm:text-sm">
            {product.short_description}
          </p>
        )}
        {product.rating_avg !== undefined && (
          <div className="mt-2.5">
            <RatingStars
              value={product.rating_avg}
              count={product.rating_count}
            />
          </div>
        )}

        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Desde
            </p>
            <p className="text-xl font-bold text-slate-900">
              ${product.price_mxn.toLocaleString('es-MX')}{' '}
              <span className="text-xs font-normal text-slate-500">MXN</span>
            </p>
          </div>
          <span className="rounded-full bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-sm shadow-blue-600/25 transition group-hover:bg-blue-700">
            Ver más
          </span>
        </div>
      </div>
    </Link>
  );
}
