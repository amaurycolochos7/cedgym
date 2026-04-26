'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Download, Plus, Ticket } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/admin/data-table';
import { StatusBadge } from '@/components/admin/status-badge';
import { AssignPlanModal } from '@/components/admin/assign-plan-modal';
import { adminApi, type AdminMember } from '@/lib/admin-api';
import { format } from 'date-fns';

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';

export default function AdminMiembrosPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [filters, setFilters] = React.useState({
    q: '',
    status: '',
    plan: '',
  });
  const [modal, setModal] = React.useState(false);
  const [assignFor, setAssignFor] = React.useState<AdminMember | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'members', filters],
    queryFn: () =>
      adminApi.listMembers({
        q: filters.q || undefined,
        status: filters.status || undefined,
        plan: filters.plan || undefined,
        page: 1,
        page_size: 200,
      }),
  });

  const exportMut = useMutation({
    mutationFn: () => adminApi.exportMembersCsv(),
    onSuccess: ({ url }) => {
      window.open(url, '_blank');
      toast.success('CSV generado');
    },
    onError: () => toast.error('No se pudo generar el CSV'),
  });

  const columns = React.useMemo<ColumnDef<AdminMember>[]>(
    () => [
      {
        header: 'Socio',
        accessorKey: 'name',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-slate-900">
              {row.original.name}
            </div>
            <div className="text-[11px] text-slate-500">
              {row.original.email ?? '—'}
            </div>
          </div>
        ),
      },
      { header: 'Teléfono', accessorKey: 'phone' },
      {
        header: 'Plan',
        accessorKey: 'plan_name',
        cell: ({ row }) => row.original.plan_name ?? '—',
      },
      {
        header: 'Estado',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        header: 'Vence',
        accessorKey: 'expires_at',
        cell: ({ row }) =>
          row.original.expires_at
            ? format(new Date(row.original.expires_at), 'dd MMM yyyy')
            : '—',
      },
      {
        header: 'Último check-in',
        accessorKey: 'last_checkin_at',
        cell: ({ row }) =>
          row.original.last_checkin_at
            ? format(new Date(row.original.last_checkin_at), 'dd MMM HH:mm')
            : '—',
      },
      {
        header: 'XP',
        accessorKey: 'xp',
        cell: ({ row }) => (
          <span className="font-semibold text-blue-600">
            {row.original.xp ?? 0}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Acciones</span>,
        cell: ({ row }) => {
          // "Asignar plan" solo aparece para miembros SIN membresía activa.
          // Los activos ya tienen un flujo de "Editar" en su detalle.
          const m = row.original;
          if (m.status?.toUpperCase() === 'ACTIVE') return null;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAssignFor(m);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Ticket className="h-3 w-3" />
              Asignar plan
            </button>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <input
          placeholder="Buscar por nombre, teléfono o email"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          className={`${INPUT_CLS} sm:max-w-xs`}
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className={`${INPUT_CLS} sm:max-w-[160px]`}
          >
            <option value="">Estado</option>
            <option value="active">Activo</option>
            <option value="frozen">Congelado</option>
            <option value="expired">Vencido</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <select
            value={filters.plan}
            onChange={(e) => setFilters({ ...filters, plan: e.target.value })}
            className={`${INPUT_CLS} sm:max-w-[160px]`}
          >
            <option value="">Plan</option>
            <option value="starter">Básico</option>
            <option value="pro">Pro</option>
            <option value="elite">Élite</option>
          </select>

          <div className="col-span-2 mt-1 flex items-center gap-2 sm:col-span-1 sm:ml-auto sm:mt-0">
            <button
              type="button"
              onClick={() => exportMut.mutate()}
              disabled={exportMut.isPending}
              className={`${BTN_SECONDARY} flex-1 sm:flex-initial`}
            >
              <Download className="h-4 w-4" />
              {exportMut.isPending ? 'Generando…' : 'Exportar CSV'}
            </button>
            <button
              type="button"
              onClick={() => setModal(true)}
              className={`${BTN_PRIMARY} flex-1 sm:flex-initial`}
            >
              <Plus className="h-4 w-4" />
              Nuevo miembro
            </button>
          </div>
        </div>
      </div>

      <DataTable<AdminMember>
        columns={columns}
        data={data?.items ?? []}
        onRowClick={(m) => router.push(`/admin/miembros/${m.id}`)}
        empty={
          isLoading ? 'Cargando…' : 'No hay miembros que coincidan con los filtros.'
        }
      />

      <NewMemberDialog
        open={modal}
        onOpenChange={setModal}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['admin', 'members'] });
        }}
      />

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
            qc.invalidateQueries({ queryKey: ['admin', 'members'] });
            qc.invalidateQueries({ queryKey: ['admin', 'memberships-active'] });
          }}
        />
      )}
    </div>
  );
}

function NewMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({
    name: '',
    phone: '',
    email: '',
    plan_code: 'starter',
  });

  const mut = useMutation({
    mutationFn: () => adminApi.createMember(form),
    onSuccess: () => {
      toast.success('Miembro creado');
      onCreated();
      onOpenChange(false);
      setForm({ name: '', phone: '', email: '', plan_code: 'starter' });
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'No se pudo crear');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-slate-200 text-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Nuevo miembro</DialogTitle>
          <DialogDescription className="text-slate-600">
            Alta rápida. Se enviará un WhatsApp con credenciales temporales.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Nombre
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre completo"
              className={INPUT_CLS}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Teléfono
              </label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="10 dígitos"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Plan
              </label>
              <select
                value={form.plan_code}
                onChange={(e) =>
                  setForm({ ...form, plan_code: e.target.value })
                }
                className={INPUT_CLS}
              >
                <option value="starter">Básico</option>
                <option value="pro">Pro</option>
                <option value="elite">Élite</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Email (opcional)
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="correo@dominio.com"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={BTN_SECONDARY}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className={BTN_PRIMARY}
          >
            {mut.isPending ? 'Creando…' : 'Crear'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
