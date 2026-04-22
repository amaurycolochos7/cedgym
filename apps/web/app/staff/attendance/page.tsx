'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
    <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Asistencia del día</h1>
        <p className="mt-1 text-sm text-slate-600">
          Marca quién asistió y quién no se presentó.
        </p>
      </div>
      {classes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No hay clases programadas hoy.
        </div>
      ) : (
        classes.map((c: any) => (
          <div
            key={c.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{c.name}</h3>
                <p className="text-xs text-slate-500">
                  {new Date(c.starts_at).toLocaleTimeString('es-MX', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  · {c.booked}/{c.capacity}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              {(c.bookings ?? []).map((b: any) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between border-t border-slate-200 py-2 first:border-0"
                >
                  <span className="text-sm text-slate-900">{b.user?.name}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        mark.mutate({
                          classId: c.id,
                          bookingId: b.id,
                          status: 'ATTENDED',
                        })
                      }
                      className={
                        b.status === 'ATTENDED'
                          ? 'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700'
                          : 'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                      }
                    >
                      Asistió
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        mark.mutate({
                          classId: c.id,
                          bookingId: b.id,
                          status: 'NO_SHOW',
                        })
                      }
                      className={
                        b.status === 'NO_SHOW'
                          ? 'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700'
                          : 'inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'
                      }
                    >
                      No-show
                    </button>
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
