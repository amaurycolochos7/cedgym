'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';

export default function PortalCursosPage() {
  const { data } = useQuery({
    queryKey: ['courses', 'me'],
    queryFn: async () => (await api.get('/courses/me/enrolled')).data,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mis cursos</h1>
        <p className="text-zinc-400 mt-1">Programas en los que estás inscrito.</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 text-center">
          <GraduationCap className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 mb-4">Sin cursos activos.</p>
          <Link
            href="/#cursos"
            className="inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            Ver cursos
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((c: any) => (
            <div
              key={c.id}
              className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5"
            >
              <h3 className="font-semibold text-lg">{c.name}</h3>
              <p className="text-xs text-zinc-500 mt-1">{c.sport}</p>
              <p className="text-sm text-zinc-400 mt-3">{c.description}</p>
              <div className="text-xs text-zinc-500 mt-3">
                Del {c.starts_at?.slice(0, 10)} al {c.ends_at?.slice(0, 10)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
