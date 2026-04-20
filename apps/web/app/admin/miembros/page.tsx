'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Download, Plus } from 'lucide-react';
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
import { DataTable } from '@/components/admin/data-table';
import { StatusBadge } from '@/components/admin/status-badge';
import { adminApi, type AdminMember } from '@/lib/admin-api';
import { format } from 'date-fns';

export default function AdminMiembrosPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [filters, setFilters] = React.useState({
    q: '',
    status: '',
    plan: '',
    sport: '',
  });
  const [modal, setModal] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'members', filters],
    queryFn: () =>
      adminApi.listMembers({
        q: filters.q || undefined,
        status: filters.status || undefined,
        plan: filters.plan || undefined,
        sport: filters.sport || undefined,
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
            <div className="font-semibold text-white">{row.original.name}</div>
            <div className="text-[11px] text-white/40">
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
          <span className="text-brand-orange">{row.original.xp ?? 0}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <Input
          placeholder="Buscar por nombre, teléfono o email"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          className="h-9 w-full sm:max-w-xs"
        />
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="h-9 w-full sm:max-w-[160px]"
          >
            <option value="">Estado</option>
            <option value="active">Activo</option>
            <option value="frozen">Congelado</option>
            <option value="expired">Vencido</option>
            <option value="cancelled">Cancelado</option>
          </Select>
          <Select
            value={filters.plan}
            onChange={(e) => setFilters({ ...filters, plan: e.target.value })}
            className="h-9 w-full sm:max-w-[160px]"
          >
            <option value="">Plan</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="elite">Elite</option>
          </Select>
          <Select
            value={filters.sport}
            onChange={(e) => setFilters({ ...filters, sport: e.target.value })}
            className="h-9 w-full sm:max-w-[160px]"
          >
            <option value="">Deporte</option>
            <option value="boxeo">Boxeo</option>
            <option value="muaythai">Muay Thai</option>
            <option value="mma">MMA</option>
            <option value="crossfit">CrossFit</option>
            <option value="funcional">Funcional</option>
          </Select>

          <div className="col-span-3 mt-1 flex items-center gap-2 sm:col-span-1 sm:ml-auto sm:mt-0">
            <Button
              variant="ghost"
              onClick={() => exportMut.mutate()}
              loading={exportMut.isPending}
              className="flex-1 sm:flex-initial"
            >
              <Download className="h-3 w-3" />
              Exportar CSV
            </Button>
            <Button onClick={() => setModal(true)} className="flex-1 sm:flex-initial">
              <Plus className="h-4 w-4" />
              Nuevo miembro
            </Button>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo miembro</DialogTitle>
          <DialogDescription>
            Alta rápida. Se enviará un WhatsApp con credenciales temporales.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs text-white/60">Nombre</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre completo"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Teléfono
              </label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="10 dígitos"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Plan</label>
              <Select
                value={form.plan_code}
                onChange={(e) =>
                  setForm({ ...form, plan_code: e.target.value })
                }
              >
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="elite">Elite</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Email (opcional)
            </label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="correo@dominio.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} loading={mut.isPending}>
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
