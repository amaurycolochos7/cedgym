'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Calendar, Users, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function PortalClasesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'disponibles' | 'mis-reservas'>('disponibles');

  const { data: classes } = useQuery({
    queryKey: ['classes', 'upcoming'],
    queryFn: async () => (await api.get('/classes')).data,
  });

  const { data: myBookings } = useQuery({
    queryKey: ['classes', 'me', 'upcoming'],
    queryFn: async () => (await api.get('/classes/me/upcoming')).data,
  });

  const book = useMutation({
    mutationFn: async (classId: string) =>
      (await api.post(`/classes/${classId}/book`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  const cancel = useMutation({
    mutationFn: async (classId: string) =>
      (await api.delete(`/classes/${classId}/booking`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Clases grupales</h1>
        <p className="text-slate-500 mt-1">Reserva tu lugar o revisa tus reservas.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(['disponibles', 'mis-reservas'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'px-4 py-2 border-b-2 border-blue-600 text-blue-700 font-semibold'
                : 'px-4 py-2 text-slate-500 hover:text-slate-900 border-b-2 border-transparent'
            }
          >
            {t === 'disponibles' ? 'Disponibles' : 'Mis reservas'}
          </button>
        ))}
      </div>

      {tab === 'disponibles' ? (
        <div className="grid md:grid-cols-2 gap-4">
          {(classes?.items ?? []).length === 0 ? (
            <p className="text-slate-500 md:col-span-2 text-center py-12">
              No hay clases próximas disponibles.
            </p>
          ) : (
            (classes?.items ?? []).map((c: any) => (
              <div
                key={c.id}
                className="bg-white shadow-sm hover:shadow-md ring-1 ring-slate-200 rounded-xl p-5 transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900">{c.name}</h3>
                    <p className="text-xs text-slate-500">{c.sport}</p>
                  </div>
                  {c.min_plan && (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-medium">
                      Solo {c.min_plan}+
                    </span>
                  )}
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    {new Date(c.starts_at).toLocaleString('es-MX', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    {c.duration_min} min · {c.location}
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="tabular-nums">{c.spots_available} / {c.capacity}</span> cupos
                  </div>
                </div>
                <Button
                  className="w-full mt-4"
                  onClick={() => book.mutate(c.id)}
                  disabled={book.isPending}
                >
                  {c.spots_available > 0 ? 'Reservar' : 'Lista de espera'}
                </Button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(myBookings?.items ?? []).length === 0 ? (
            <p className="text-slate-500 text-center py-12">
              No tienes reservas activas.
            </p>
          ) : (
            (myBookings?.items ?? []).map((b: any) => (
              <div
                key={b.id}
                className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl p-5 flex items-center justify-between"
              >
                <div>
                  <h3 className="font-semibold text-slate-900">{b.class?.name}</h3>
                  <p className="text-sm text-slate-600">
                    {new Date(b.class?.starts_at).toLocaleString('es-MX')}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Status: <span className="text-blue-700 font-medium">{b.status}</span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => cancel.mutate(b.class_id)}
                  disabled={cancel.isPending}
                >
                  Cancelar
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
