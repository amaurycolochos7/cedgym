'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Shield, Dumbbell, UserCog, Trash2, Edit2, Ban, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TRAINER: 'Entrenador',
  RECEPTIONIST: 'Recepción',
};

const ROLE_ICONS: Record<string, any> = {
  SUPERADMIN: Shield,
  ADMIN: UserCog,
  TRAINER: Dumbbell,
  RECEPTIONIST: UserPlus,
};

const ROLE_DESC: Record<string, string> = {
  ADMIN: 'Gestiona todo el gym (excepto crear otros admins).',
  TRAINER: 'Crea rutinas, imparte clases, toma mediciones.',
  RECEPTIONIST: 'Escanea QR, check-in manual, POS, asistencias.',
};

export default function AdminStaffPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPERADMIN';

  const [creating, setCreating] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: async () => (await api.get('/admin/staff')).data,
  });

  const suspend = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.patch(`/admin/staff/${id}`, { status })).data,
    onSuccess: () => {
      toast.success('Actualizado');
      qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/staff/${id}`)).data,
    onSuccess: (res) => {
      if (res?.success) {
        toast.success('Usuario eliminado');
        qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
      } else {
        toast.error(res?.error ?? 'No se pudo eliminar');
      }
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mi equipo</h1>
          <p className="text-zinc-400 mt-1">
            Administra quién puede acceder al sistema y qué permisos tiene.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> Nuevo integrante
        </Button>
      </div>

      {/* Role explanation cards */}
      <div className="grid md:grid-cols-3 gap-3">
        {(['ADMIN', 'TRAINER', 'RECEPTIONIST'] as const).map((r) => {
          const Icon = ROLE_ICONS[r];
          return (
            <div
              key={r}
              className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-brand-orange" />
                <span className="font-semibold text-sm">{ROLE_LABEL[r]}</span>
              </div>
              <p className="text-xs text-zinc-400">{ROLE_DESC[r]}</p>
            </div>
          );
        })}
      </div>

      {/* Staff table */}
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Alta</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">Cargando…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                Aún no tienes equipo. Crea el primero con "Nuevo integrante".
              </td></tr>
            )}
            {items.map((s: any) => {
              const Icon = ROLE_ICONS[s.role] ?? UserCog;
              const isSelf = s.id === user?.id;
              const canEdit = isSuperAdmin || (s.role !== 'ADMIN' && s.role !== 'SUPERADMIN');
              return (
                <tr key={s.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 font-medium">
                    {s.name} {isSelf && <span className="text-xs text-brand-orange ml-2">(tú)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-800 text-xs">
                      <Icon className="w-3 h-3 text-brand-orange" />
                      {ROLE_LABEL[s.role] ?? s.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    <div>{s.email}</div>
                    <div>{s.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        s.status === 'ACTIVE'
                          ? 'text-emerald-400 text-xs'
                          : s.status === 'SUSPENDED'
                          ? 'text-amber-400 text-xs'
                          : 'text-zinc-500 text-xs'
                      }
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {s.created_at?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEdit && !isSelf && (
                      <div className="flex gap-1 justify-end">
                        {s.status === 'ACTIVE' ? (
                          <button
                            className="p-1.5 rounded hover:bg-zinc-800 text-amber-400"
                            title="Suspender"
                            onClick={() =>
                              confirm(`¿Suspender a ${s.name}?`) &&
                              suspend.mutate({ id: s.id, status: 'SUSPENDED' })
                            }
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            className="p-1.5 rounded hover:bg-zinc-800 text-emerald-400"
                            title="Reactivar"
                            onClick={() =>
                              suspend.mutate({ id: s.id, status: 'ACTIVE' })
                            }
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button
                            className="p-1.5 rounded hover:bg-zinc-800 text-red-400"
                            title="Eliminar"
                            onClick={() =>
                              confirm(`¿Eliminar a ${s.name}? Esta acción es irreversible.`) &&
                              del.mutate(s.id)
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateStaffModal
          isSuperAdmin={isSuperAdmin}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
          }}
        />
      )}
    </div>
  );
}

function CreateStaffModal({
  isSuperAdmin,
  onClose,
  onDone,
}: {
  isSuperAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'RECEPTIONIST',
  });
  const [err, setErr] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const phone = form.phone.startsWith('+')
        ? form.phone
        : `+52${form.phone.replace(/\D/g, '')}`;
      return (await api.post('/admin/staff', { ...form, phone })).data;
    },
    onSuccess: () => {
      toast.success('Integrante creado');
      onDone();
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.error?.message ?? 'Error');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4"
      >
        <h3 className="text-xl font-bold">Nuevo integrante del equipo</h3>

        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400">Rol</label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {(['RECEPTIONIST', 'TRAINER', ...(isSuperAdmin ? ['ADMIN'] : [])] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setForm({ ...form, role: r })}
                className={
                  form.role === r
                    ? 'p-3 rounded-lg bg-brand-orange/20 border border-brand-orange text-brand-orange text-sm font-semibold'
                    : 'p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-sm'
                }
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">{ROLE_DESC[form.role]}</p>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400">Nombre completo</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Juan Pérez"
            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="juan@cedgym.mx"
            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400">WhatsApp</label>
          <div className="flex mt-1 gap-1">
            <span className="inline-flex items-center px-3 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-sm">
              +52
            </span>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
              placeholder="6141234567"
              maxLength={10}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-zinc-400">
            Contraseña temporal
          </label>
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Mínimo 8 caracteres"
            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 font-mono"
          />
          <p className="text-xs text-zinc-500 mt-1">
            El usuario podrá cambiarla en su perfil después.
          </p>
        </div>

        {err && <p className="text-sm text-red-400">{err}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => {
              setErr(null);
              if (!form.name || !form.email || !form.phone || !form.password) {
                setErr('Todos los campos son requeridos');
                return;
              }
              create.mutate();
            }}
            disabled={create.isPending}
          >
            {create.isPending ? 'Creando…' : 'Crear integrante'}
          </Button>
        </div>
      </div>
    </div>
  );
}
