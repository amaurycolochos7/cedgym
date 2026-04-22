'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Send, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin/status-badge';
import { DataTable } from '@/components/admin/data-table';
import { MemberSearch } from '@/components/admin/member-search';
import { AssignPlanModal } from '@/components/admin/assign-plan-modal';
import {
  adminApi,
  type AdminMember,
  type AdminMembershipPlan,
} from '@/lib/admin-api';
import type { ColumnDef } from '@tanstack/react-table';
import { useAuth } from '@/lib/auth';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';
const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60 disabled:pointer-events-none';

export default function AdminMembershipsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canDelete =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPERADMIN' ||
    user?.role === 'RECEPTIONIST';

  const { data: plans } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: adminApi.listMembershipPlans,
  });

  const [filters, setFilters] = React.useState({ q: '', plan: '' });
  const { data: members } = useQuery({
    queryKey: ['admin', 'memberships-active', filters],
    queryFn: () =>
      adminApi.listActiveMemberships({
        q: filters.q || undefined,
        plan: filters.plan || undefined,
        page: 1,
      }),
  });

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = React.useState<AdminMember | null>(null);
  const [assignPicker, setAssignPicker] = React.useState(false);
  const [assignFor, setAssignFor] = React.useState<AdminMember | null>(null);

  const broadcast = useMutation({
    mutationFn: () => adminApi.broadcastMembershipReminder([...selected]),
    onSuccess: () => {
      toast.success('Recordatorios enviados');
      setSelected(new Set());
    },
    onError: () => toast.error('No se pudo enviar'),
  });

  const del = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.deleteMembership(id, reason),
    onSuccess: () => {
      toast.success('Membresía eliminada');
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['admin', 'memberships-active'] });
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.error?.message ||
        'No se pudo eliminar la membresía';
      toast.error(msg);
    },
  });

  const columns = React.useMemo<ColumnDef<AdminMember>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={
              !!members?.items.length &&
              members.items.every((m) => selected.has(m.id))
            }
            onChange={(e) => {
              if (e.target.checked) {
                setSelected(new Set(members?.items.map((m) => m.id)));
              } else {
                setSelected(new Set());
              }
            }}
            className="accent-blue-600"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selected.has(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = new Set(selected);
              if (e.target.checked) next.add(row.original.id);
              else next.delete(row.original.id);
              setSelected(next);
            }}
            className="accent-blue-600"
          />
        ),
      },
      { header: 'Socio', accessorKey: 'name' },
      { header: 'Plan', accessorKey: 'plan_name' },
      {
        header: 'Estado',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        header: 'Vence',
        accessorKey: 'expires_at',
      },
      ...(canDelete
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">Acciones</span>,
              cell: ({ row }: { row: { original: AdminMember } }) => (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete(row.original);
                  }}
                  aria-label="Eliminar membresía"
                  className="inline-flex items-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ),
            } as ColumnDef<AdminMember>,
          ]
        : []),
    ],
    [selected, members, canDelete],
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
              Planes
            </h2>
            <p className="text-xs text-slate-500">
              Precios por ciclo. Editar guarda inmediatamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAssignPicker(true)}
            className={BTN_PRIMARY}
          >
            <Plus className="h-4 w-4" />
            Asignar plan a miembro
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {plans?.map((p: AdminMembershipPlan) => (
            <PlanEditor
              key={p.id}
              plan={p}
              onSaved={() =>
                qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
              }
            />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Membresías activas
          </h2>
          <input
            placeholder="Buscar socio"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className={`${INPUT_CLS} ml-4 max-w-xs`}
          />
          <select
            value={filters.plan}
            onChange={(e) => setFilters({ ...filters, plan: e.target.value })}
            className={`${INPUT_CLS} max-w-[160px]`}
          >
            <option value="">Todos los planes</option>
            <option value="starter">Básico</option>
            <option value="pro">Pro</option>
            <option value="elite">Élite</option>
          </select>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={selected.size === 0 || broadcast.isPending}
              onClick={() => broadcast.mutate()}
              className={BTN_SECONDARY}
            >
              <Send className="h-3.5 w-3.5" />
              Recordatorio ({selected.size})
            </button>
          </div>
        </div>

        <DataTable<AdminMember>
          columns={columns}
          data={members?.items ?? []}
        />
      </section>

      <DeleteMembershipDialog
        member={toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={(reason) =>
          toDelete && del.mutate({ id: toDelete.id, reason })
        }
        loading={del.isPending}
      />

      {/* Picker para elegir el miembro al que asignar plan */}
      <Dialog
        open={assignPicker}
        onOpenChange={(v) => !v && setAssignPicker(false)}
      >
        <DialogContent className="bg-white border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              Asignar plan a miembro
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Busca al socio por nombre, teléfono o email. Si ya tiene una
              membresía activa, recibirás un aviso.
            </DialogDescription>
          </DialogHeader>
          <MemberSearch
            onSelect={(m) => {
              setAssignPicker(false);
              setAssignFor(m);
            }}
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setAssignPicker(false)}
              className={BTN_SECONDARY}
            >
              Cancelar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assignFor && (
        <AssignPlanModal
          open={!!assignFor}
          onClose={() => setAssignFor(null)}
          member={{
            id: assignFor.id,
            name: assignFor.name,
            phone: assignFor.phone,
          }}
          onAssigned={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'memberships-active'] });
            qc.invalidateQueries({ queryKey: ['admin', 'members'] });
          }}
        />
      )}
    </div>
  );
}

function DeleteMembershipDialog({
  member,
  onClose,
  onConfirm,
  loading,
}: {
  member: AdminMember | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = React.useState('');
  React.useEffect(() => {
    if (member) setReason('');
  }, [member]);

  return (
    <Dialog open={!!member} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            Eliminar membresía
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Se borrará de la base de datos permanentemente.
          </DialogDescription>
        </DialogHeader>

        {member && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-slate-900">{member.name}</div>
            <div className="text-slate-500">
              {member.plan_name ?? 'Sin plan'} · {member.phone}
            </div>
          </div>
        )}

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Motivo (opcional)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Ej. Socio pidió baja"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
            maxLength={500}
          />
        </label>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={BTN_SECONDARY}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={loading}
            className={BTN_DANGER}
          >
            {loading ? 'Eliminando…' : 'Eliminar membresía'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanEditor({
  plan,
  onSaved,
}: {
  plan: AdminMembershipPlan;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState(plan);
  const mut = useMutation({
    mutationFn: () => adminApi.updateMembershipPlan(plan.id, form),
    onSuccess: () => {
      toast.success('Plan actualizado');
      onSaved();
    },
    onError: () => toast.error('No se pudo guardar'),
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
            {form.code}
          </div>
          <h3 className="text-base font-bold text-slate-900">{form.name}</h3>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="accent-blue-600"
          />
          Activo
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Mensual (MXN)
          <input
            type="number"
            value={form.monthly_price_mxn}
            onChange={(e) =>
              setForm({
                ...form,
                monthly_price_mxn: Number(e.target.value),
              })
            }
            className={`${INPUT_CLS} mt-1`}
          />
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Trimestral (MXN)
          <input
            type="number"
            value={form.quarterly_price_mxn}
            onChange={(e) =>
              setForm({
                ...form,
                quarterly_price_mxn: Number(e.target.value),
              })
            }
            className={`${INPUT_CLS} mt-1`}
          />
        </label>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Anual (MXN)
          <input
            type="number"
            value={form.yearly_price_mxn}
            onChange={(e) =>
              setForm({
                ...form,
                yearly_price_mxn: Number(e.target.value),
              })
            }
            className={`${INPUT_CLS} mt-1`}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>Mensual: {MXN.format(form.monthly_price_mxn)}</span>
        <button
          type="button"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className={BTN_PRIMARY}
        >
          {mut.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
