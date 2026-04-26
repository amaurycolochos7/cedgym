'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Crown, Sparkles, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/* =========================================================================
 * Types — match GET /memberships/plans response
 * =========================================================================*/

type PlanId = 'STARTER' | 'PRO' | 'ELITE';
type Cycle = 'monthly';
type PaymentMethod = 'CASH' | 'TRANSFER' | 'TERMINAL' | 'COMPLIMENTARY';

interface PublicPlan {
  id: PlanId;
  name: string;
  tagline?: string;
  monthly_price_mxn: number;
  duration_days_monthly?: number;
  features: string[];
  popular?: boolean;
}

interface PlansResponse {
  plans: PublicPlan[];
  currency: string;
}

interface AssignResponse {
  membership: Record<string, unknown>;
  payment: Record<string, unknown>;
  welcome: { title: string; benefits: string[] };
}

interface AssignPlanModalProps {
  open: boolean;
  onClose: () => void;
  member: { id: string; name: string; phone: string };
  onAssigned?: (membership: Record<string, unknown>) => void;
}

/* =========================================================================
 * Style tokens (local — match portal/perfil page)
 * =========================================================================*/

const INPUT_CLS =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none';
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const PLAN_ICON: Record<PlanId, React.ComponentType<{ className?: string }>> = {
  STARTER: Sparkles,
  PRO: Star,
  ELITE: Crown,
};

const CYCLE_LABEL: Record<Cycle, string> = {
  monthly: 'Mensual',
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  TERMINAL: 'Terminal / TPV',
  COMPLIMENTARY: 'Cortesía',
};

const METHOD_ORDER: PaymentMethod[] = [
  'CASH',
  'TRANSFER',
  'TERMINAL',
  'COMPLIMENTARY',
];

/* =========================================================================
 * Helpers
 * =========================================================================*/

function priceFor(plan: PublicPlan, _cycle: Cycle): number {
  return plan.monthly_price_mxn;
}

/** Format a Date as `yyyy-MM-ddTHH:mm` for <input type="datetime-local">. */
function toDateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

/* =========================================================================
 * Component
 * =========================================================================*/

export function AssignPlanModal({
  open,
  onClose,
  member,
  onAssigned,
}: AssignPlanModalProps) {
  const qc = useQueryClient();

  const [plan, setPlan] = React.useState<PlanId>('PRO');
  const [cycle, setCycle] = React.useState<Cycle>('monthly');
  const [method, setMethod] = React.useState<PaymentMethod>('CASH');
  const [startsAt, setStartsAt] = React.useState<string>(() =>
    toDateTimeLocalValue(new Date()),
  );
  const [note, setNote] = React.useState('');

  // Reset local state whenever we re-open for a different member.
  React.useEffect(() => {
    if (open) {
      setPlan('PRO');
      setCycle('monthly');
      setMethod('CASH');
      setStartsAt(toDateTimeLocalValue(new Date()));
      setNote('');
    }
  }, [open, member.id]);

  const { data, isLoading: plansLoading } = useQuery({
    queryKey: ['memberships', 'plans'],
    queryFn: () =>
      api.get<PlansResponse>('/memberships/plans').then((r) => r.data),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const plans = data?.plans ?? [];
  const selectedPlan = plans.find((p) => p.id === plan);
  const price = selectedPlan ? priceFor(selectedPlan, cycle) : 0;
  const displayPrice = method === 'COMPLIMENTARY' ? 0 : price;

  const assign = useMutation({
    mutationFn: async () => {
      // Convert datetime-local (local time, no TZ) to ISO with timezone.
      // If the field is empty we omit the key entirely so the backend
      // uses the default (now).
      const body: Record<string, unknown> = {
        user_id: member.id,
        plan,
        cycle,
        method,
        // Entrar al modal desde "Renovar / cambiar plan" ES el
        // consentimiento explícito para reemplazar la membresía
        // actual si existe. Sin esto, el backend rechaza con
        // MEMBERSHIP_ACTIVE y la UI quedaba bloqueada.
        replace_active: true,
      };
      if (startsAt) {
        const parsed = new Date(startsAt);
        if (!Number.isNaN(parsed.getTime())) {
          body.starts_at = parsed.toISOString();
        }
      }
      const trimmed = note.trim();
      if (trimmed) body.note = trimmed;

      const r = await api.post<AssignResponse>(
        '/admin/memberships/assign',
        body,
      );
      return r.data;
    },
    onSuccess: (res) => {
      toast.success('Plan asignado. Enviaremos bienvenida por WhatsApp.');
      onAssigned?.(res.membership);
      qc.invalidateQueries({ queryKey: ['admin', 'miembros'] });
      qc.invalidateQueries({ queryKey: ['admin', 'members'] });
      qc.invalidateQueries({ queryKey: ['admin', 'memberships-active'] });
      qc.invalidateQueries({ queryKey: ['admin', 'member', member.id] });
      qc.invalidateQueries({ queryKey: ['memberships'] });
      onClose();
    },
    onError: (err: {
      status?: number;
      code?: string;
      message?: string;
    }) => {
      if (err?.status === 409 || err?.code === 'MEMBERSHIP_ACTIVE') {
        toast.error(
          `${member.name} ya tiene una membresía activa. Usa "Editar membresía" para modificarla.`,
        );
        return;
      }
      if (err?.status === 403 || err?.code === 'FORBIDDEN') {
        toast.error('No tienes permiso para asignar este plan.');
        return;
      }
      toast.error(err?.message ?? 'No se pudo asignar el plan.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-white border-slate-200 text-slate-900 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-slate-900">
            Asignar plan a {member.name}
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Registra un pago manual (efectivo, transferencia, terminal o
            cortesía). El socio recibirá bienvenida por WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {/* ─── Plan selector ────────────────────────────────── */}
        <section>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Plan
          </h4>
          {plansLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-50"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {plans.map((p) => {
                const Icon = PLAN_ICON[p.id] ?? Sparkles;
                const active = plan === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlan(p.id)}
                    className={cn(
                      'relative flex flex-col items-start rounded-2xl border bg-white p-4 text-left transition focus:outline-none',
                      active
                        ? 'border-blue-500 ring-4 ring-blue-100 shadow-md'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    {p.popular && (
                      <span className="absolute right-2 top-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        Popular
                      </span>
                    )}
                    <Icon
                      className={cn(
                        'mb-2 h-5 w-5',
                        active ? 'text-blue-600' : 'text-slate-400',
                      )}
                    />
                    <div className="text-sm font-bold text-slate-900">
                      {p.name}
                    </div>
                    {p.tagline && (
                      <div className="text-[11px] text-slate-500">
                        {p.tagline}
                      </div>
                    )}
                    <div className="mt-2 text-lg font-bold text-slate-900">
                      {MXN.format(p.monthly_price_mxn)}
                      <span className="text-[11px] font-medium text-slate-500">
                        {' '}
                        / mes
                      </span>
                    </div>
                    {p.features?.length ? (
                      <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                        {p.features.slice(0, 3).map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-blue-600" />
                            <span className="line-clamp-2">{f}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ─── Total ────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Membresía mensual
              </div>
              <div className="text-sm font-medium text-slate-700">
                Renovación cada 30 días
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Total a cobrar
              </div>
              <div className="text-xl font-bold text-blue-700">
                {MXN.format(displayPrice)}
              </div>
              {method === 'COMPLIMENTARY' && price > 0 && (
                <div className="text-[10px] text-slate-500 line-through">
                  {MXN.format(price)}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─── Payment method ──────────────────────────────── */}
        <section>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Método de pago
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METHOD_ORDER.map((m) => {
              const active = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-xs font-semibold transition',
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {METHOD_LABEL[m]}
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Start date + note ──────────────────────────── */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Fecha de inicio
            </span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={INPUT_CLS}
            />
            <span className="mt-1 block text-[10px] text-slate-500">
              Default: ahora mismo. La vigencia se calcula desde esta fecha.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Nota (opcional)
            </span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Ej. Beca por desempeño / Transferencia Banorte #1234"
              className={`${INPUT_CLS} resize-none`}
              maxLength={500}
            />
            <span className="mt-1 block text-[10px] text-slate-500">
              {note.length} / 500
            </span>
          </label>
        </section>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className={BTN_GHOST}
            disabled={assign.isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => assign.mutate()}
            disabled={assign.isPending || plansLoading || !selectedPlan}
            className={BTN_PRIMARY}
          >
            {assign.isPending ? 'Asignando…' : 'Asignar plan'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignPlanModal;
