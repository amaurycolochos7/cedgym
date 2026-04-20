'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Utensils, BookOpen, Play } from 'lucide-react';
import { api } from '@/lib/api';

const TYPE_ICONS: Record<string, any> = {
  ROUTINE: <Dumbbell className="w-5 h-5" />,
  NUTRITION_PLAN: <Utensils className="w-5 h-5" />,
  EBOOK: <BookOpen className="w-5 h-5" />,
  VIDEO_COURSE: <Play className="w-5 h-5" />,
};

export default function PortalRutinasPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['products', 'me', 'purchases'],
    queryFn: async () => (await api.get('/products/me/purchases')).data,
  });

  if (isLoading) return <div className="text-zinc-400">Cargando…</div>;

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mis rutinas</h1>
        <p className="text-zinc-400 mt-1">Acceso a todas tus rutinas y planes.</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 text-center">
          <Dumbbell className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-4">Aún no has adquirido rutinas.</p>
          <Link
            href="/tienda"
            className="inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            Ver marketplace
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p: any) => (
            <Link
              key={p.id}
              href={`/portal/rutinas/${p.id}`}
              className="group bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 hover:border-blue-500/40 rounded-2xl overflow-hidden transition"
            >
              {p.product?.cover_url && (
                <div
                  className="h-32 bg-cover bg-center"
                  style={{ backgroundImage: `url(${p.product.cover_url})` }}
                />
              )}
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-blue-400 mb-2">
                  {TYPE_ICONS[p.product?.type] ?? <Dumbbell className="w-4 h-4" />}
                  <span>{p.product?.type?.replace('_', ' ')}</span>
                </div>
                <h3 className="font-semibold group-hover:text-blue-400 transition">
                  {p.product?.title}
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Comprado el {p.access_granted_at?.slice(0, 10)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
