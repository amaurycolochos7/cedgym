'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function StaffAttendancePage() {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['classes', 'today'],
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      const to = new Date(now.setHours(23, 59, 59, 999)).toISOString();
      return (await api.get(`/classes?from=${from}&to=${to}`)).data;
    },
  });

  const mark = useMutation({
    mutationFn: async ({ classId, bookingId, status }: any) =>
      (await api.post(`/classes/${classId}/attendance`, {
        attendance: [{ booking_id: bookingId, status }],
      })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classes'] }),
  });

  const classes = data?.items ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Asistencia del día</h1>
      {classes.length === 0 ? (
        <p className="text-zinc-500">No hay clases programadas hoy.</p>
      ) : (
        classes.map((c: any) => (
          <div key={c.id} className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold">{c.name}</h3>
                <p className="text-xs text-zinc-500">
                  {new Date(c.starts_at).toLocaleTimeString('es-MX', {
                    hour: '2-digit', minute: '2-digit',
                  })} · {c.booked}/{c.capacity}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              {(c.bookings ?? []).map((b: any) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-2 border-t border-zinc-800 first:border-0"
                >
                  <span className="text-sm">{b.user?.name}</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={b.status === 'ATTENDED' ? 'primary' : 'ghost'}
                      onClick={() =>
                        mark.mutate({ classId: c.id, bookingId: b.id, status: 'ATTENDED' })
                      }
                    >
                      Asistió
                    </Button>
                    <Button
                      size="sm"
                      variant={b.status === 'NO_SHOW' ? 'primary' : 'ghost'}
                      onClick={() =>
                        mark.mutate({ classId: c.id, bookingId: b.id, status: 'NO_SHOW' })
                      }
                    >
                      No-show
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
