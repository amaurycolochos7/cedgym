'use client';

import { Badge, type BadgeProps } from '@/components/ui/badge';

type Status = string;

const MAP: Record<string, { variant: BadgeProps['variant']; label: string }> = {
  // Members / memberships
  active: { variant: 'success', label: 'Activo' },
  frozen: { variant: 'warning', label: 'Congelado' },
  expired: { variant: 'danger', label: 'Vencido' },
  cancelled: { variant: 'muted', label: 'Cancelado' },
  // Payments
  APPROVED: { variant: 'success', label: 'Aprobado' },
  PENDING: { variant: 'warning', label: 'Pendiente' },
  REJECTED: { variant: 'danger', label: 'Rechazado' },
  CANCELLED: { variant: 'muted', label: 'Cancelado' },
  REFUNDED: { variant: 'info', label: 'Reembolsado' },
  // Jobs
  RUNNING: { variant: 'info', label: 'En curso' },
  DONE: { variant: 'success', label: 'OK' },
  FAILED: { variant: 'danger', label: 'Falló' },
  // WA session
  CONNECTED: { variant: 'success', label: 'Conectado' },
  DISCONNECTED: { variant: 'danger', label: 'Desconectado' },
  STARTING: { variant: 'warning', label: 'Iniciando…' },
  // Class
  scheduled: { variant: 'info', label: 'Programada' },
  completed: { variant: 'success', label: 'Completada' },
  // Referral
  CONFIRMED: { variant: 'success', label: 'Confirmado' },
  PAID: { variant: 'brand', label: 'Pagado' },
};

export function StatusBadge({ status }: { status: Status }) {
  const entry = MAP[status] ?? { variant: 'default', label: status };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
