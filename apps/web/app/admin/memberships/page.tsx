'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
import { adminApi, type AdminMember, type AdminMembershipPlan } from '@/lib/admin-api';
import type { ColumnDef } from '@tanstack/react-table';
import { useAuth } from '@/lib/auth';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

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
            className="accent-brand-orange"
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
            className="accent-brand-orange"
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete(row.original);
                  }}
                  aria-label="Eliminar membresía"
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
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
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Planes
            </h2>
            <p className="text-xs text-white/50">
              Precios por ciclo. Editar guarda inmediatamente.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {plans?.map((p) => (
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
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Membresías activas
          </h2>
          <Input
            placeholder="Buscar socio"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="ml-4 h-9 max-w-xs"
          />
          <Select
            value={filters.plan}
            onChange={(e) => setFilters({ ...filters, plan: e.target.value })}
            className="h-9 max-w-[160px]"
          >
            <option value="">Todos los planes</option>
            <option value="starter">Básico</option>
            <option value="pro">Pro</option>
            <option value="elite">Élite</option>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              disabled={selected.size === 0 || broadcast.isPending}
              onClick={() => broadcast.mutate()}
            >
              <Send className="h-3 w-3" />
              Recordatorio ({selected.size})
            </Button>
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
    </div>
  );
}

// Modal de eliminación: motivo obligatorio (10-500 chars).
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar membresía</DialogTitle>
          <DialogDescription>
            Se borrará de la base de datos permanentemente.
          </DialogDescription>
        </DialogHeader>

        {member && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
            <div className="font-semibold text-white">{member.name}</div>
            <div className="text-white/50">
              {member.plan_name ?? 'Sin plan'} · {member.phone}
            </div>
          </div>
        )}

        <label className="block text-xs uppercase tracking-wider text-white/50">
          Motivo (opcional)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Ej. Socio pidió baja"
            className="mt-2 w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-brand-orange/60 focus:outline-none"
            maxLength={500}
          />
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim())}
            loading={loading}
            disabled={loading}
          >
            Eliminar membresía
          </Button>
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-brand-orange">
            {form.code}
          </div>
          <h3 className="text-base font-bold text-white">{form.name}</h3>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="accent-brand-orange"
          />
          Activo
        </label>
      </div>

      <div className="space-y-2">
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Mensual (MXN)
          <Input
            type="number"
            value={form.monthly_price_mxn}
            onChange={(e) =>
              setForm({ ...form, monthly_price_mxn: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Trimestral (MXN)
          <Input
            type="number"
            value={form.quarterly_price_mxn}
            onChange={(e) =>
              setForm({
                ...form,
                quarterly_price_mxn: Number(e.target.value),
              })
            }
            className="mt-1"
          />
        </label>
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Anual (MXN)
          <Input
            type="number"
            value={form.yearly_price_mxn}
            onChange={(e) =>
              setForm({ ...form, yearly_price_mxn: Number(e.target.value) })
            }
            className="mt-1"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-white/40">
        <span>Mensual: {MXN.format(form.monthly_price_mxn)}</span>
        <Button size="sm" onClick={() => mut.mutate()} loading={mut.isPending}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
