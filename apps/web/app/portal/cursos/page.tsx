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
        <h1 className="font-display text-3xl font-bold text-slate-900">Mis cursos</h1>
        <p className="text-slate-500 mt-1">Programas en los que estás inscrito.</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white shadow-sm ring-1 ring-slate-200 rounded-2xl p-8 text-center">
          <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 mb-4">Sin cursos activos.</p>
          <Link
            href="/#cursos"
            className="inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm transition"
          >
            Ver cursos
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((c: any) => (
            <div
              key={c.id}
              className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl p-5 hover:shadow-md transition"
            >
              <h3 className="font-semibold text-lg text-slate-900">{c.name}</h3>
              <p className="text-xs text-slate-500 mt-1">{c.sport}</p>
              <p className="text-sm text-slate-600 mt-3">{c.description}</p>
              <div className="text-xs text-slate-500 mt-3">
                Del {c.starts_at?.slice(0, 10)} al {c.ends_at?.slice(0, 10)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
