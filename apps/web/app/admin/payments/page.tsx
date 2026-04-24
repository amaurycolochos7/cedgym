'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Sparkles, Tag } from 'lucide-react';
import { format } from 'date-fns';
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

const TYPE_LABELS: Record<AdminPayment['type'], string> = {
  MEMBERSHIP: 'Membresía',
  COURSE: 'Curso',
  DIGITAL_PRODUCT: 'Producto digital',
  SUPPLEMENT: 'Suplemento',
  MEAL_PLAN_ADDON: 'Plan alimenticio',
  OTHER: 'Otro',
};

// Pretty-print the `method` field (can be a card brand, a flow tag, or
// null). Anything we don't recognize falls back to the raw value so
// it's still debuggable in prod.
function methodLabel(method?: string | null): string {
  if (!method) return '—';
  const m = method.toLowerCase();
  if (m === 'visa') return 'Visa';
  if (m === 'master' || m === 'mastercard') return 'Mastercard';
  if (m === 'amex') return 'American Express';
  if (m === 'card' || m === 'card_brick') return 'Tarjeta';
  if (m === 'cash') return 'Efectivo';
  if (m === 'transfer') return 'Transferencia';
  if (m === 'terminal' || m === 'card_terminal') return 'Terminal';
  if (m === 'complimentary' || m === 'courtesy_promo') return 'Cortesía';
  if (m === 'oxxo') return 'OXXO';
  return method;
}

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';
const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60 disabled:pointer-events-none';

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
      {
        header: 'Socio',
        accessorKey: 'user_name',
        cell: ({ row }) => row.original.user_name ?? '—',
      },
      {
        header: 'Tipo',
        accessorKey: 'type',
        cell: ({ row }) => TYPE_LABELS[row.original.type] ?? row.original.type,
      },
      {
        header: 'Monto',
        accessorKey: 'amount_mxn',
        cell: ({ row }) => {
          const p = row.original;
          const hasDiscount =
            typeof p.discount_mxn === 'number' &&
            p.discount_mxn > 0 &&
            typeof p.base_amount_mxn === 'number';
          const isFree = p.amount_mxn === 0;
          return (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={
                    isFree
                      ? 'font-semibold text-emerald-700 tabular-nums'
                      : 'font-medium text-slate-900 tabular-nums'
                  }
                >
                  {isFree ? 'Gratis' : MXN.format(p.amount_mxn)}
                </span>
                {hasDiscount && (
                  <span className="text-xs text-slate-400 line-through tabular-nums">
                    {MXN.format(p.base_amount_mxn!)}
                  </span>
                )}
              </div>
              {hasDiscount && p.promo_code && (
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                  <Tag className="h-2.5 w-2.5" />
                  {p.promo_code} · −{MXN.format(p.discount_mxn!)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        header: 'Método',
        accessorKey: 'method',
        cell: ({ row }) => methodLabel(row.original.method),
      },
      {
        header: 'Estado',
        accessorKey: 'status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [],
  );

  const seedDemo = useMutation({
    mutationFn: () => adminApi.seedDemoPayments(),
    onSuccess: (r) => toast.success(`Demo: ${r.created} pagos creados`),
    onError: () => toast.error('No se pudieron crear los pagos demo'),
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">
          Ingresos semanales
        </h3>
        <ChartLine
          data={series ?? []}
          xKey="bucket"
          yKey="amount_mxn"
          formatter={(v) => MXN.format(v)}
        />
      </div>

      <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
        <select
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className={`${INPUT_CLS} sm:max-w-[180px]`}
        >
          <option value="">Todos los tipos</option>
          <option value="MEMBERSHIP">Membresía</option>
          <option value="MEAL_PLAN_ADDON">Plan alimenticio</option>
          <option value="COURSE">Curso</option>
          <option value="DIGITAL_PRODUCT">Producto digital</option>
          <option value="SUPPLEMENT">Suplemento</option>
          <option value="OTHER">Otro</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className={`${INPUT_CLS} sm:max-w-[160px]`}
        >
          <option value="">Todos los estados</option>
          <option value="APPROVED">Aprobado</option>
          <option value="PENDING">Pendiente</option>
          <option value="REJECTED">Rechazado</option>
          <option value="CANCELED">Cancelado</option>
          <option value="REFUNDED">Reembolsado</option>
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          className={`${INPUT_CLS} sm:max-w-[160px]`}
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          className={`${INPUT_CLS} sm:max-w-[160px]`}
        />

        <div className="col-span-2 flex flex-wrap gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={() => seedDemo.mutate()}
            disabled={seedDemo.isPending}
            className={`${BTN_SECONDARY} w-full sm:w-auto`}
            title="Crea 4 pagos demo: completo, con descuento, 100% OFF, add-on"
          >
            <Sparkles className="h-4 w-4" />
            {seedDemo.isPending ? 'Creando…' : 'Cargar pagos demo'}
          </button>
          <button
            type="button"
            onClick={() => exportMut.mutate()}
            disabled={exportMut.isPending}
            className={`${BTN_SECONDARY} w-full sm:w-auto`}
          >
            <Download className="h-4 w-4" />
            {exportMut.isPending ? 'Generando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      <DataTable<AdminPayment>
        columns={columns}
        data={data?.items ?? []}
        onRowClick={(p) => setDetail(p)}
      />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="bg-white border-slate-200 text-slate-900">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900">
                  Detalle de pago
                </DialogTitle>
                <DialogDescription className="text-slate-600">
                  ID: {detail.id}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Row k="Socio" v={detail.user_name ?? '—'} />
                <Row
                  k="Tipo"
                  v={TYPE_LABELS[detail.type] ?? detail.type}
                />
                <Row
                  k="Monto cobrado"
                  v={
                    detail.amount_mxn === 0
                      ? 'Gratis (100% OFF)'
                      : MXN.format(detail.amount_mxn)
                  }
                />
                <Row k="Estado" v={<StatusBadge status={detail.status} />} />
                <Row k="Método" v={methodLabel(detail.method)} />
                {typeof detail.base_amount_mxn === 'number' && (
                  <Row
                    k="Precio base"
                    v={MXN.format(detail.base_amount_mxn)}
                  />
                )}
                {detail.promo_code && (
                  <Row
                    k="Código promo"
                    v={
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        <Tag className="h-3 w-3" />
                        {detail.promo_code}
                        {typeof detail.discount_mxn === 'number' &&
                          detail.discount_mxn > 0 && (
                            <span className="ml-1 text-emerald-800">
                              −{MXN.format(detail.discount_mxn)}
                            </span>
                          )}
                      </span>
                    }
                  />
                )}
                <Row k="MP payment ID" v={detail.mp_payment_id ?? '—'} />
                <Row k="MP status detail" v={detail.mp_status_detail ?? '—'} />
                <Row
                  k="Fecha"
                  v={format(new Date(detail.created_at), 'PPpp')}
                />
              </dl>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className={BTN_SECONDARY}
                >
                  Cerrar
                </button>
                {detail.status === 'APPROVED' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRefund(detail);
                      setDetail(null);
                    }}
                    className={BTN_DANGER}
                  >
                    Reembolsar
                  </button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {k}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">{v}</dd>
    </div>
  );
}
