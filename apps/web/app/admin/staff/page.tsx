'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  Shield,
  Dumbbell,
  UserCog,
  Trash2,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
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

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';

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
    mutationFn: async (id: string) =>
      (await api.delete(`/admin/staff/${id}`)).data,
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
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Mi equipo
          </h1>
          <p className="text-slate-600 mt-1">
            Administra quién puede acceder al sistema y qué permisos tiene.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={BTN_PRIMARY}
        >
          <UserPlus className="w-4 h-4" /> Nuevo integrante
        </button>
      </div>

      {/* Role explanation cards */}
      <div className="grid md:grid-cols-3 gap-3">
        {(['ADMIN', 'TRAINER', 'RECEPTIONIST'] as const).map((r) => {
          const Icon = ROLE_ICONS[r];
          return (
            <div
              key={r}
              className="bg-white border border-slate-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex rounded-lg bg-blue-50 p-2 text-blue-700">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="font-semibold text-sm text-slate-900">
                  {ROLE_LABEL[r]}
                </span>
              </div>
              <p className="text-xs text-slate-600">{ROLE_DESC[r]}</p>
            </div>
          );
        })}
      </div>

      {/* Staff table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Rol
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Contacto
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider">
                  Alta
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Cargando…
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Aún no tienes equipo. Crea el primero con &quot;Nuevo
                    integrante&quot;.
                  </td>
                </tr>
              )}
              {items.map((s: any) => {
                const Icon = ROLE_ICONS[s.role] ?? UserCog;
                const isSelf = s.id === user?.id;
                const canEdit =
                  isSuperAdmin ||
                  (s.role !== 'ADMIN' && s.role !== 'SUPERADMIN');
                return (
                  <tr
                    key={s.id}
                    className="border-t border-slate-200 hover:bg-slate-50 transition"
                  >
                    <td className="px-4 py-3.5 text-sm text-slate-900 font-medium">
                      {s.name}{' '}
                      {isSelf && (
                        <span className="text-xs text-blue-600 ml-2 font-semibold">
                          (tú)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                        <Icon className="w-3 h-3" />
                        {ROLE_LABEL[s.role] ?? s.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 text-xs">
                      <div>{s.email}</div>
                      <div>{s.phone}</div>
                    </td>
                    <td className="px-4 py-3.5 text-sm">
                      <span
                        className={
                          s.status === 'ACTIVE'
                            ? 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : s.status === 'SUSPENDED'
                            ? 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200'
                            : 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200'
                        }
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 text-xs">
                      {s.created_at?.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {canEdit && !isSelf && (
                        <div className="flex gap-1 justify-end">
                          {s.status === 'ACTIVE' ? (
                            <button
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600"
                              title="Suspender"
                              onClick={() =>
                                confirm(`¿Suspender a ${s.name}?`) &&
                                suspend.mutate({
                                  id: s.id,
                                  status: 'SUSPENDED',
                                })
                              }
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"
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
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600"
                              title="Eliminar"
                              onClick={() =>
                                confirm(
                                  `¿Eliminar a ${s.name}? Esta acción es irreversible.`,
                                ) && del.mutate(s.id)
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
        : `+${form.phone.replace(/\D/g, '')}`;
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
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl"
      >
        <h3 className="text-xl font-bold text-slate-900">
          Nuevo integrante del equipo
        </h3>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Rol
          </label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {(
              [
                'RECEPTIONIST',
                'TRAINER',
                ...(isSuperAdmin ? ['ADMIN'] : []),
              ] as const
            ).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setForm({ ...form, role: r })}
                className={
                  form.role === r
                    ? 'p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold'
                    : 'p-3 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm'
                }
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">{ROLE_DESC[form.role]}</p>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Nombre completo
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Juan Pérez"
            className={`${INPUT_CLS} mt-1`}
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Email
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="juan@cedgym.mx"
            className={`${INPUT_CLS} mt-1`}
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            WhatsApp
          </label>
          <div className="flex mt-1 gap-1">
            <span className="inline-flex items-center px-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-600 text-sm">
              +52
            </span>
            <input
              value={form.phone}
              onChange={(e) =>
                setForm({
                  ...form,
                  phone: e.target.value.replace(/\D/g, ''),
                })
              }
              placeholder="6141234567"
              maxLength={10}
              className={`${INPUT_CLS} flex-1`}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Contraseña temporal
          </label>
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Mínimo 8 caracteres"
            className={`${INPUT_CLS} mt-1 font-mono`}
          />
          <p className="text-xs text-slate-500 mt-1">
            El usuario podrá cambiarla en su perfil después.
          </p>
        </div>

        {err && <p className="text-sm text-rose-600">{err}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              setErr(null);
              if (
                !form.name ||
                !form.email ||
                !form.phone ||
                !form.password
              ) {
                setErr('Todos los campos son requeridos');
                return;
              }
              create.mutate();
            }}
            disabled={create.isPending}
            className={BTN_PRIMARY}
          >
            {create.isPending ? 'Creando…' : 'Crear integrante'}
          </button>
        </div>
      </div>
    </div>
  );
}
