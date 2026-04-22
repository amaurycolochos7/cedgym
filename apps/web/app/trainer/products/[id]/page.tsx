'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { ProductEditor } from '@/components/trainer/product-editor';
import { trainerApi } from '@/lib/trainer-api';

export default function TrainerProductEditPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  // We reuse /products/me/authored (fully hydrates the product) since there's
  // no author-facing GET /products/:id endpoint on the backend yet.
  const q = useQuery({
    queryKey: ['trainer', 'products'],
    queryFn: trainerApi.products,
  });

  const product = q.data?.find((p) => p.id === id);

  return (
    <div className="space-y-4">
      <Link
        href="/trainer/products"
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600"
      >
        <ChevronLeft className="h-3 w-3" />
        Volver a mis rutinas
      </Link>

      {q.isLoading ? (
        <div className="text-sm text-slate-500">Cargando…</div>
      ) : !product ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No se encontró este producto.
        </div>
      ) : (
        <ProductEditor initial={product} />
      )}
    </div>
  );
}
