'use client';

import Link from 'next/link';
import { Clock, Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from './rating-stars';
import type { Product } from '@/lib/schemas';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: Product;
  className?: string;
}

export function ProductCard({ product, className }: ProductCardProps) {
  return (
    <Link
      href={`/tienda/${product.slug}`}
      className={cn(
        'group block overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md',
        className,
      )}
    >
      <div className="relative h-44 overflow-hidden">
        {product.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.cover_url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
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

        <div className="absolute left-3 top-3 flex gap-2">
          {product.level && (
            <Badge variant="muted" className="capitalize">
              {product.level}
            </Badge>
          )}
          {product.featured && (
            <Badge variant="brand" className="gap-1">
              <Flame size={10} /> Destacado
            </Badge>
          )}
        </div>
        {product.weeks && (
          <div className="absolute right-3 top-3">
            <Badge variant="muted" className="gap-1">
              <Clock size={10} /> {product.weeks} sem
            </Badge>
          </div>
        )}
      </div>

      <div className="p-5">
        <h3 className="line-clamp-2 font-display text-lg font-bold tracking-tight text-slate-900">
          {product.name}
        </h3>
        {product.short_description && (
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">
            {product.short_description}
          </p>
        )}
        {product.rating_avg !== undefined && (
          <div className="mt-3">
            <RatingStars
              value={product.rating_avg}
              count={product.rating_count}
            />
          </div>
        )}

        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Desde
            </p>
            <p className="text-2xl font-black text-slate-900">
              ${product.price_mxn.toLocaleString('es-MX')}{' '}
              <span className="text-xs font-normal text-slate-500">MXN</span>
            </p>
          </div>
          <span className="rounded-full bg-blue-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-sm">
            Ver más
          </span>
        </div>
      </div>
    </Link>
  );
}
