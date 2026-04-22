'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Star } from 'lucide-react';
import { trainerApi, type TrainerProduct } from '@/lib/trainer-api';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

function StatusBadge({ p }: { p: TrainerProduct }) {
  if (p.published)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
        Publicado
      </span>
    );
  // We currently don't persist a "rejected" flag; admin rejection keeps
  // published=false and sends a notification. Treat everything else as
  // "pending approval".
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
      Pendiente
    </span>
  );
}

export default function TrainerProductsPage() {
  const router = useRouter();

  const q = useQuery({
    queryKey: ['trainer', 'products'],
    queryFn: trainerApi.products,
  });

  const items = q.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Mis rutinas y productos
          </h1>
          <p className="text-sm text-slate-600">
            Crea, edita y publica rutinas, planes de nutrición y cursos en
            video. Un admin revisa cada versión antes de publicar.
          </p>
        </div>
        <Link
          href="/trainer/products/new"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nueva rutina
        </Link>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-slate-500">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <h3 className="text-lg font-semibold text-slate-900">
            Aún no tienes productos
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Publica tu primera rutina para empezar a generar ingresos.
          </p>
          <Link
            href="/trainer/products/new"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Crear rutina
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/trainer/products/${p.id}`)}
              className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-400 hover:shadow-md"
            >
              {p.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.cover_url}
                  alt={p.title}
                  className="h-36 w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-36 w-full items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                  Sin portada
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold text-slate-900">
                    {p.title}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span>{p.type.replace('_', ' ')}</span>
                    {p.duration_weeks ? (
                      <>
                        <span>·</span>
                        <span>{p.duration_weeks} sem</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <StatusBadge p={p} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-slate-600">
                  <span className="flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500" />
                    {(p.rating_avg ?? 0).toFixed(1)}
                  </span>
                  <span>·</span>
                  <span>{p.sales_count ?? 0} ventas</span>
                </div>
                <span className="font-semibold text-blue-600">
                  {MXN.format(
                    p.sale_price_mxn != null ? p.sale_price_mxn : p.price_mxn,
                  )}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
