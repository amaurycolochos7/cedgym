'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
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
import { ChartLine } from '@/components/admin/chart-line';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { adminApi, type AdminPayment } from '@/lib/admin-api';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export default function AdminPaymentsPage() {
  const [filters, setFilters] = React.useState({
    type: '',
    status: '',
    from: '',
    to: '',
  });
  const [detail, setDetail] = React.useState<AdminPayment | null>(null);
  const [refund, setRefund] = React.useState<AdminPayment | null>(null);

  const { data } = useQuery({
    queryKey: ['admin', 'payments', filters],
    queryFn: () =>
      adminApi.listPayments({
        type: filters.type || undefined,
        status: filters.status || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        page: 1,
      }),
  });

  const { data: series } = useQuery({
    queryKey: ['admin', 'payments-series'],
    queryFn: () => adminApi.paymentsSeries('week'),
  });

  const exportMut = useMutation({
    mutationFn: () => adminApi.exportPaymentsCsv(filters),
    onSuccess: ({ url }) => {
      window.open(url, '_blank');
      toast.success('CSV generado');
    },
    onError: () => toast.error('No se pudo exportar'),
  });

  const columns = React.useMemo<ColumnDef<AdminPayment>[]>(
    () => [
      {
        header: 'Fecha',
        accessorKey: 'created_at',
        cell: ({ row }) =>
          format(new Date(row.original.created_at), 'dd MMM HH:mm'),
      },
      { header: 'Socio', accessorKey: 'user_name' },
      { header: 'Tipo', accessorKey: 'type' },
      {
        header: 'Monto',
        accessorKey: 'amount_mxn',
        cell: ({ row }) => MXN.format(row.original.amount_mxn),
      },
      { header: 'Método', accessorKey: 'method' },
      {
        header: 'Estado',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">
          Ingresos semanales
        </h3>
        <ChartLine
          data={series ?? []}
          xKey="bucket"
          yKey="amount_mxn"
          formatter={(v) => MXN.format(v)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="h-9 max-w-[160px]"
        >
          <option value="">Todos los tipos</option>
          <option value="MEMBERSHIP">Membresía</option>
          <option value="COURSE">Curso</option>
          <option value="POS">POS</option>
          <option value="PRODUCT">Producto</option>
        </Select>
        <Select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="h-9 max-w-[160px]"
        >
          <option value="">Todos los estados</option>
          <option value="APPROVED">Aprobado</option>
          <option value="PENDING">Pendiente</option>
          <option value="REJECTED">Rechazado</option>
          <option value="CANCELLED">Cancelado</option>
          <option value="REFUNDED">Reembolsado</option>
        </Select>
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className="h-9 max-w-[160px]"
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className="h-9 max-w-[160px]"
        />

        <div className="ml-auto">
          <Button
            variant="ghost"
            onClick={() => exportMut.mutate()}
            loading={exportMut.isPending}
          >
            <Download className="h-3 w-3" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <DataTable<AdminPayment>
        columns={columns}
        data={data?.items ?? []}
        onRowClick={(p) => setDetail(p)}
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Detalle de pago</DialogTitle>
                <DialogDescription>
                  ID: {detail.id}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Row k="Socio" v={detail.user_name ?? '—'} />
                <Row k="Tipo" v={detail.type} />
                <Row k="Monto" v={MXN.format(detail.amount_mxn)} />
                <Row k="Estado" v={<StatusBadge status={detail.status} />} />
                <Row k="Método" v={detail.method ?? '—'} />
                <Row k="MP payment ID" v={detail.mp_payment_id ?? '—'} />
                <Row k="MP status detail" v={detail.mp_status_detail ?? '—'} />
                <Row
                  k="Fecha"
                  v={format(new Date(detail.created_at), 'PPpp')}
                />
              </dl>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDetail(null)}>
                  Cerrar
                </Button>
                {detail.status === 'APPROVED' && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setRefund(detail);
                      setDetail(null);
                    }}
                  >
                    Reembolsar
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* TODO: /admin/payments/:id/refund endpoint doesn't exist yet in backend */}
      <ConfirmDialog
        open={!!refund}
        onOpenChange={(o) => !o && setRefund(null)}
        title="Reembolsar pago"
        description="Se contactará a Mercado Pago para solicitar el reembolso. Esta acción es irreversible."
        confirmLabel="Reembolsar"
        destructive
        onConfirm={async () => {
          if (!refund) return;
          try {
            await adminApi.refundPayment(refund.id);
            toast.success('Reembolso solicitado');
          } catch {
            toast.error('Endpoint de reembolso aún no implementado.');
          }
          setRefund(null);
        }}
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white/[0.02] p-3">
      <dt className="text-[10px] uppercase tracking-wider text-white/40">{k}</dt>
      <dd className="mt-1 text-sm text-white">{v}</dd>
    </div>
  );
}
