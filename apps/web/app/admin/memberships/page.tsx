'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/admin/status-badge';
import { DataTable } from '@/components/admin/data-table';
import { adminApi, type AdminMember, type AdminMembershipPlan } from '@/lib/admin-api';
import type { ColumnDef } from '@tanstack/react-table';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export default function AdminMembershipsPage() {
  const qc = useQueryClient();
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

  const broadcast = useMutation({
    mutationFn: () => adminApi.broadcastMembershipReminder([...selected]),
    onSuccess: () => {
      toast.success('Recordatorios enviados');
      setSelected(new Set());
    },
    onError: () => toast.error('No se pudo enviar'),
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
    ],
    [selected, members],
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
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="elite">Elite</option>
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
    </div>
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
