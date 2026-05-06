'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronsLeftRight,
  IdCard,
  KeyRound,
  MoreVertical,
  Pause,
  Play,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin/status-badge';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { AssignPlanModal } from '@/components/admin/assign-plan-modal';
import { adminApi } from '@/lib/admin-api';
import { api } from '@/lib/api';
import {
  planDisplayName,
  membershipStatusLabel,
  paymentStatusLabel,
} from '@/lib/utils';
import { GAMIFICATION_UI_ENABLED } from '@/lib/feature-flags';

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:pointer-events-none';

export default function AdminMemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: m } = useQuery({
    queryKey: ['admin', 'member', id],
    queryFn: () => adminApi.getMember(id),
    enabled: !!id,
  });

  const [suspend, setSuspend] = React.useState(false);
  const [reactivate, setReactivate] = React.useState(false);
  const [resetPw, setResetPw] = React.useState(false);
  const [del, setDel] = React.useState(false);
  const [waOpen, setWaOpen] = React.useState(false);
  const [waBody, setWaBody] = React.useState('');
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [actionsOpen, setActionsOpen] = React.useState(false);
  const [markInscOpen, setMarkInscOpen] = React.useState(false);

  const membership = (m as any)?.membership ?? null;
  const inscriptionPaidAt: string | null =
    (m as any)?.inscription_paid_at ?? null;

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['admin', 'member', id] });

  const waMut = useMutation({
    mutationFn: () => adminApi.sendManualWhatsapp(id, waBody),
    onSuccess: () => {
      toast.success('Mensaje encolado');
      setWaOpen(false);
      setWaBody('');
    },
    onError: () => toast.error('No se pudo enviar'),
  });

  const markInscMut = useMutation({
    mutationFn: () => adminApi.markInscriptionPaid(id),
    onSuccess: (res) => {
      toast.success(
        res.already_marked
          ? 'Este socio ya estaba marcado como antiguo.'
          : 'Marcado como socio antiguo. No se le cobrará inscripción.',
      );
      setMarkInscOpen(false);
      invalidate();
    },
    onError: () => toast.error('No se pudo marcar al socio'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <MemberAvatar
          selfieUrl={(m as any)?.selfie_url ?? null}
          name={(m as any)?.full_name || m?.name || ''}
        />
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {m?.name ?? '…'}
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {m?.status && <StatusBadge status={m.status} />}
            <span>{m?.phone}</span>
            {m?.email && <span>· {m.email}</span>}
          </div>
        </div>
        <div className="relative md:hidden">
          <button
            type="button"
            onClick={() => setActionsOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Acciones"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {actionsOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setActionsOpen(false)}
                aria-hidden="true"
              />
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
              >
                {m?.status?.toUpperCase() === 'ACTIVE' ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsOpen(false);
                      setSuspend(true);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Pause className="h-4 w-4" />
                    Suspender
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActionsOpen(false);
                      setReactivate(true);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Play className="h-4 w-4" />
                    Reactivar
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    setResetPw(true);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <KeyRound className="h-4 w-4" />
                  Reset password
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    setWaOpen(true);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Send className="h-4 w-4" />
                  WhatsApp
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    setDel(true);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-rose-600 hover:bg-slate-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </button>
              </div>
            </>
          )}
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {m?.status?.toUpperCase() === 'ACTIVE' ? (
            <button
              type="button"
              onClick={() => setSuspend(true)}
              className={BTN_SECONDARY}
            >
              <Pause className="h-3.5 w-3.5" />
              Suspender
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setReactivate(true)}
              className={BTN_SECONDARY}
            >
              <Play className="h-3.5 w-3.5" />
              Reactivar
            </button>
          )}
          <button
            type="button"
            onClick={() => setResetPw(true)}
            className={BTN_SECONDARY}
          >
            <KeyRound className="h-3.5 w-3.5" />
            Reset password
          </button>
          <button
            type="button"
            onClick={() => setWaOpen(true)}
            className={BTN_SECONDARY}
          >
            <Send className="h-3.5 w-3.5" />
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setDel(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </button>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="-mx-4 flex flex-nowrap overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="membership">Membresía</TabsTrigger>
          <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
          <TabsTrigger value="routines">Rutinas</TabsTrigger>
          <TabsTrigger value="meal-plans">Plan alimenticio</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="space-y-4">
            <Section title="Información general">
              <DetailGrid
                items={[
                  ['ID', id],
                  ['Nombre', m?.full_name || m?.name || '—'],
                  ['Teléfono', m?.phone ?? '—'],
                  ['Email', (m?.email as string) ?? '—'],
                  [
                    'Fecha de nacimiento',
                    formatBirthDate((m as any)?.birth_date),
                  ],
                  ['Creado', formatDate(m?.created_at as string | undefined)],
                  [
                    'Total check-ins',
                    String((m as any)?.stats?.total_checkins ?? 0),
                  ],
                  [
                    'Último check-in',
                    formatDate((m as any)?.stats?.last_checkin_at),
                  ],
                  ...(GAMIFICATION_UI_ENABLED
                    ? ([['XP', String((m as any)?.stats?.xp ?? 0)]] as Array<
                        [string, string]
                      >)
                    : []),
                ]}
              />
            </Section>

            {/* ─── Inscripción única ──────────────────────────────
                Marca al socio como "ya cumplió la inscripción única
                de $100". Útil para socios antiguos que ya pagaban
                en efectivo afuera del sistema y queremos que cuando
                paguen online les aparezca solo el plan ($630), sin
                inscripción. */}
            <Section title="Inscripción única ($100)">
              {inscriptionPaidAt ? (
                <div className="flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-emerald-900">
                      Socio antiguo — inscripción cumplida
                    </div>
                    <div className="mt-0.5 text-xs text-emerald-800/80">
                      Marcado el {formatDate(inscriptionPaidAt)}. Cuando este
                      socio compre o renueve online, pagará solo el plan
                      mensual; nunca se le cobrarán los $100 de inscripción.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <IdCard className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-amber-900">
                      Pagaría inscripción al comprar online
                    </div>
                    <div className="mt-0.5 text-xs text-amber-800/80">
                      Si este socio compra Básico online, le aparecerán $730
                      ($630 plan + $100 inscripción). Si ya era socio del gym
                      antes (pagaba en efectivo, etc.), márcalo como antiguo
                      para que no se le cobre la inscripción.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMarkInscOpen(true)}
                    className={BTN_SECONDARY}
                  >
                    <IdCard className="h-3.5 w-3.5" />
                    Marcar como socio antiguo
                  </button>
                </div>
              )}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="membership">
          {membership ? (
            <Section title="Membresía actual">
              <DetailGrid
                items={[
                  ['Plan', planDisplayName(membership.plan)],
                  ['Estado', membershipStatusLabel(membership.status)],
                  ['Inicia', formatDate(membership.starts_at)],
                  ['Vence', formatDate(membership.expires_at)],
                  ['Ciclo', membership.billing_cycle === 'MONTHLY' ? 'Mensual' : membership.billing_cycle],
                  ['Precio', membership.price_mxn != null ? `$${Number(membership.price_mxn).toLocaleString('es-MX')} MXN` : '—'],
                ]}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAssignOpen(true)}
                  className={BTN_SECONDARY}
                >
                  Renovar / cambiar plan
                </button>
              </div>
            </Section>
          ) : (
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
              <div>
                <h3 className="font-display text-lg font-bold tracking-tight text-slate-900">
                  Sin membresía activa
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Este socio no tiene membresía asignada. Asígnale una desde
                  aquí — el flujo te deja elegir plan, fecha de inicio y
                  método de pago (efectivo / terminal / cortesía).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                className={BTN_PRIMARY}
              >
                Asignar membresía
              </button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="checkins">
          <CheckinsTab memberId={id} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab memberId={id} />
        </TabsContent>
        <TabsContent value="routines">
          <RoutinesTab memberId={id} />
        </TabsContent>
        <TabsContent value="meal-plans">
          <MealPlansTab memberId={id} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab memberId={id} />
        </TabsContent>
      </Tabs>

      {/* Confirms */}
      <ConfirmDialog
        open={suspend}
        onOpenChange={setSuspend}
        title="Suspender miembro"
        description="El acceso y cobros recurrentes quedarán en pausa."
        confirmLabel="Suspender"
        destructive
        onConfirm={async () => {
          await adminApi.suspendMember(id);
          toast.success('Miembro suspendido');
          invalidate();
        }}
      />
      <ConfirmDialog
        open={reactivate}
        onOpenChange={setReactivate}
        title="Reactivar miembro"
        confirmLabel="Reactivar"
        onConfirm={async () => {
          await adminApi.reactivateMember(id);
          toast.success('Miembro reactivado');
          invalidate();
        }}
      />
      <ConfirmDialog
        open={resetPw}
        onOpenChange={setResetPw}
        title="Resetear contraseña"
        description="Se enviará un código OTP por WhatsApp al miembro."
        confirmLabel="Resetear"
        onConfirm={async () => {
          await adminApi.resetMemberPassword(id);
          toast.success('Código enviado');
        }}
      />
      <ConfirmDialog
        open={markInscOpen}
        onOpenChange={setMarkInscOpen}
        title="Marcar como socio antiguo"
        description="A partir de aquí, este socio no pagará la inscripción única de $100 cuando compre o renueve. Úsalo solo si ya era socio del gym antes de habilitar el sistema online."
        confirmLabel="Marcar"
        onConfirm={async () => {
          await markInscMut.mutateAsync();
        }}
      />
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title={`Eliminar a ${m?.name ?? 'este miembro'}`}
        description="Se borran todos sus datos de la base (membresía, check-ins, pagos, etc). Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          try {
            await adminApi.deleteMember(id);
            toast.success('Miembro eliminado');
            qc.removeQueries({ queryKey: ['admin', 'member', id] });
            await qc.invalidateQueries({ queryKey: ['admin', 'members'] });
            await qc.invalidateQueries({ queryKey: ['admin', 'memberships-active'] });
            await qc.invalidateQueries({ queryKey: ['admin', 'kpis'] });
            router.replace('/admin/miembros');
          } catch (e: any) {
            toast.error(e?.response?.data?.error?.message || 'No se pudo eliminar');
          }
        }}
      />

      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="bg-white border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              Enviar WhatsApp manual
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Texto libre, sin plantilla. Se registrará en audit log.
            </DialogDescription>
          </DialogHeader>
          <textarea
            rows={4}
            value={waBody}
            onChange={(e) => setWaBody(e.target.value)}
            placeholder="Hola, te escribimos de CED·GYM…"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 focus:outline-none"
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setWaOpen(false)}
              className={BTN_SECONDARY}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => waMut.mutate()}
              disabled={waMut.isPending || waBody.trim().length < 4}
              className={BTN_PRIMARY}
            >
              {waMut.isPending ? 'Enviando…' : 'Enviar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {m && (
        <AssignPlanModal
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          member={{
            id: id,
            name: m.full_name || m.name || '—',
            phone: m.phone || '',
          }}
          onAssigned={() => invalidate()}
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">
        {title}
      </h3>
      {children}
    </div>
  );
}

function DetailGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg bg-slate-50 p-3 border border-slate-200">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {k}
          </dt>
          <dd className="mt-1 text-sm text-slate-900">{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      <ChevronsLeftRight className="h-4 w-4" />
      {label}
    </div>
  );
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Birth date: only the date part + age in years. Time is meaningless
// for a DOB (the column stores midnight UTC) and showing "12:00 AM"
// next to "5 may 2003" looks broken to admins.
function formatBirthDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const formatted = d.toLocaleDateString('es-MX', { dateStyle: 'long' });
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? `${formatted} (${age} años)` : formatted;
}

// Round avatar shown next to the member's name in the detail header.
// Falls back to coloured initials when the user hasn't uploaded a
// selfie, so the slot never feels empty in the admin view. When a
// selfie exists the avatar is clickable and opens a responsive
// lightbox at up to 80vh — useful for the receptionist to confirm
// identity without leaving the member detail page.
function MemberAvatar({
  selfieUrl,
  name,
}: {
  selfieUrl: string | null;
  name: string;
}) {
  const [open, setOpen] = React.useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

  if (!selfieUrl) {
    return (
      <div
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-base font-bold text-blue-700 ring-2 ring-blue-500/20 sm:h-16 sm:w-16 sm:text-lg"
      >
        {initials}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={name ? `Ver foto de ${name} en grande` : 'Ver foto del socio en grande'}
        className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-2 ring-blue-500/30 transition hover:ring-blue-500/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40 sm:h-16 sm:w-16"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selfieUrl}
          alt={name ? `Foto de ${name}` : 'Foto del socio'}
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          hideCloseButton
          className="max-w-[95vw] sm:max-w-md md:max-w-lg lg:max-w-xl border-0 bg-slate-950 p-0 sm:rounded-3xl overflow-hidden"
        >
          <DialogTitle className="sr-only">
            {name ? `Foto de ${name}` : 'Foto del socio'}
          </DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selfieUrl}
            alt={name ? `Foto de ${name}` : 'Foto del socio'}
            className="block h-auto max-h-[85vh] w-full object-contain"
          />
          {/* Top gradient + close button — float over the image so the
              photo gets the full frame. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />
          <DialogClose
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </DialogClose>
          {/* Bottom gradient + caption with the member's name. */}
          {name && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 px-5 pb-4 text-white">
                <div className="font-display text-base font-bold tracking-tight sm:text-lg">
                  {name}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const CHECKIN_METHOD_LABEL: Record<string, string> = {
  QR: 'QR',
  MANUAL: 'Manual',
  PASS_OF_DAY: 'Pase del día',
  STAFF: 'Staff',
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  MEMBERSHIP: 'Membresía',
  DIGITAL_PRODUCT: 'Producto',
  COURSE: 'Curso',
  POS: 'POS',
  GIFT_CARD: 'Gift card',
  MEAL_PLAN_ADDON: 'Plan extra (plan alimenticio)',
};

function CheckinsTab({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'member', memberId, 'checkins'],
    queryFn: () => adminApi.memberCheckins(memberId),
    enabled: !!memberId,
  });
  if (isLoading) return <EmptyState label="Cargando check-ins…" />;
  const items = data?.items ?? [];
  if (items.length === 0)
    return <EmptyState label="Este socio aún no tiene check-ins." />;
  return (
    <Section title={`Check-ins · últimos ${items.length}`}>
      <ul className="divide-y divide-slate-200">
        {items.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 py-2.5 text-sm"
          >
            <span className="text-slate-900">{formatDate(c.scanned_at)}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
              {CHECKIN_METHOD_LABEL[c.method] ?? c.method}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PaymentsTab({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'member', memberId, 'payments'],
    queryFn: () => adminApi.memberPayments(memberId),
    enabled: !!memberId,
  });
  if (isLoading) return <EmptyState label="Cargando pagos…" />;
  const items = data?.items ?? [];
  if (items.length === 0)
    return <EmptyState label="Este socio aún no tiene pagos." />;
  return (
    <Section title={`Pagos · últimos ${items.length}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-3">Fecha</th>
              <th className="pb-2 pr-3">Concepto</th>
              <th className="pb-2 pr-3">Método</th>
              <th className="pb-2 pr-3 text-right">Monto</th>
              <th className="pb-2 text-right">Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr
                key={p.id}
                className="border-t border-slate-200 align-middle text-slate-900"
              >
                <td className="py-2 pr-3 text-xs text-slate-600">
                  {formatDate(p.paid_at ?? p.created_at)}
                </td>
                <td className="py-2 pr-3">
                  <div className="text-sm text-slate-900">
                    {p.description ??
                      PAYMENT_TYPE_LABEL[p.type] ??
                      p.type}
                  </div>
                  {p.reference && (
                    <div className="text-[11px] text-slate-500">
                      {p.reference}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-slate-600">
                  {p.method ?? '—'}
                </td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                  {MXN.format(p.amount)}
                </td>
                <td className="py-2 text-right">
                  <span
                    className={
                      p.status === 'APPROVED'
                        ? 'inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700'
                        : p.status === 'PENDING'
                          ? 'inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700'
                          : 'inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700'
                    }
                  >
                    {paymentStatusLabel(p.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function RoutinesTab({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const [granting, setGranting] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'member', memberId, 'routines'],
    queryFn: () => adminApi.memberRoutines(memberId),
    enabled: !!memberId,
  });

  const products = useQuery({
    queryKey: ['admin', 'products', 'published'],
    queryFn: async () => {
      // Backend shape is { products: DigitalProduct[] }; published=true
      // restricts to live catalog so we don't show drafts.
      const r = await api.get<{ products: any[] }>(
        '/admin/products?published=true&limit=50',
      );
      return Array.isArray(r.data?.products) ? r.data.products : [];
    },
    enabled: granting,
    staleTime: 60_000,
  });

  const revoke = useMutation({
    mutationFn: (purchaseId: string) =>
      adminApi.revokeMemberRoutine(memberId, purchaseId),
    onSuccess: () => {
      toast.success('Acceso revocado');
      qc.invalidateQueries({
        queryKey: ['admin', 'member', memberId, 'routines'],
      });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message || 'No se pudo revocar'),
  });

  const grant = useMutation({
    mutationFn: (productId: string) =>
      adminApi.grantMemberRoutine(memberId, productId),
    onSuccess: () => {
      toast.success('Rutina asignada al socio');
      setGranting(false);
      qc.invalidateQueries({
        queryKey: ['admin', 'member', memberId, 'routines'],
      });
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.error?.message || 'No se pudo asignar la rutina',
      ),
  });

  const items = data?.items ?? [];
  const productList = products.data ?? [];

  return (
    <Section title={`Rutinas asignadas · ${items.length}`}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setGranting((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          {granting ? 'Cancelar' : '+ Asignar rutina'}
        </button>
      </div>

      {granting && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {products.isLoading && (
            <p className="text-sm text-slate-500">Cargando catálogo…</p>
          )}
          {!products.isLoading && productList.length === 0 && (
            <p className="text-sm text-slate-500">
              No hay rutinas publicadas en el catálogo.
            </p>
          )}
          {!products.isLoading && productList.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {productList.map((p: any) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {p.title}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {[p.type, p.sport].filter(Boolean).join(' · ') || '—'} ·{' '}
                      {MXN.format(p.price_mxn)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={grant.isPending}
                    onClick={() => grant.mutate(p.id)}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    Asignar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando rutinas…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Este socio no tiene rutinas asignadas.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {r.title}
                </div>
                <div className="text-[11px] text-slate-500">
                  {[r.type, r.sport].filter(Boolean).join(' · ') || '—'} ·{' '}
                  {formatDate(r.access_granted_at)} · {r.downloaded_times}{' '}
                  descargas
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-bold tabular-nums text-blue-600">
                  {r.price_paid_mxn === 0
                    ? 'Cortesía'
                    : MXN.format(r.price_paid_mxn)}
                </span>
                <button
                  type="button"
                  disabled={revoke.isPending}
                  onClick={() => {
                    if (
                      window.confirm(`¿Quitar el acceso a "${r.title}"?`)
                    ) {
                      revoke.mutate(r.id);
                    }
                  }}
                  className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                  aria-label="Revocar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const MEAL_GOAL_LABEL: Record<string, string> = {
  WEIGHT_LOSS: 'Pérdida de peso',
  MUSCLE_GAIN: 'Ganancia muscular',
  MAINTENANCE: 'Mantenimiento',
  PERFORMANCE: 'Rendimiento',
};

function MealPlansTab({ memberId }: { memberId: string }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'member', memberId, 'meal-plans'],
    queryFn: () => adminApi.memberMealPlans(memberId),
    enabled: !!memberId,
  });

  const grantAddon = useMutation({
    mutationFn: () => adminApi.grantMealPlanAddon(memberId),
    onSuccess: () => {
      toast.success(
        'Plan extra activado. El socio ya puede generar su plan alimenticio gratis.',
      );
      qc.invalidateQueries({
        queryKey: ['admin', 'member', memberId, 'meal-plans'],
      });
    },
    onError: (e: any) => {
      // The api client normalizes errors to { status, code, message };
      // the raw axios shape (e.response.data.error) is no longer reachable.
      if (e?.code === 'ALREADY_HAS_ADDON') {
        toast.info('El socio ya tiene un plan extra activo.');
      } else {
        toast.error(e?.message || 'No se pudo activar el plan extra');
      }
    },
  });

  const remove = useMutation({
    mutationFn: (planId: string) =>
      adminApi.deleteMemberMealPlan(memberId, planId),
    onSuccess: () => {
      toast.success('Plan eliminado');
      qc.invalidateQueries({
        queryKey: ['admin', 'member', memberId, 'meal-plans'],
      });
    },
    onError: (e: any) => toast.error(e?.message || 'No se pudo eliminar'),
  });

  const items = data?.items ?? [];
  const activeAddon = data?.active_addon ?? null;

  return (
    <Section title={`Planes alimenticios · ${items.length}`}>
      {activeAddon ? (
        <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-slate-700 ring-1 ring-emerald-200">
          <p className="font-semibold text-emerald-900">
            ✓ Plan extra activo {activeAddon.is_courtesy ? '(cortesía)' : ''}
          </p>
          <p className="mt-1">
            El socio ya puede entrar a su portal y generar su plan
            alimenticio con AI. Cuando lo genere, este plan extra se consume y
            tendrá que comprar otro (o pedirte cortesía) para uno nuevo.
            {activeAddon.activated_at && (
              <span className="block text-xs text-slate-500">
                Activado el{' '}
                {new Date(activeAddon.activated_at).toLocaleDateString(
                  'es-MX',
                  { day: '2-digit', month: 'short', year: 'numeric' },
                )}
              </span>
            )}
          </p>
        </div>
      ) : (
        <div className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-slate-700 ring-1 ring-blue-100">
          <p>
            <strong>Cómo funciona:</strong> los planes alimenticios los
            genera el socio desde su portal con AI. Si quieres regalárselo
            (sin cobrarle el plan extra de $630), usa el botón de abajo y queda
            activado.
          </p>
          <button
            type="button"
            onClick={() => grantAddon.mutate()}
            disabled={grantAddon.isPending}
            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {grantAddon.isPending
              ? 'Activando…'
              : 'Activar plan alimenticio (cortesía)'}
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando planes…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          Este socio aún no ha generado ningún plan alimenticio.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200">
          {items.map((p) => (
            <li key={p.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {p.name}
                    </div>
                    {p.is_active && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Activo
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {MEAL_GOAL_LABEL[p.goal] ?? p.goal} ·{' '}
                    {p.calories_target} kcal · {p.protein_g}P/{p.carbs_g}C/
                    {p.fats_g}G · {p.meals_count} comidas ·{' '}
                    {formatDate(p.created_at)}
                  </div>
                  {p.restrictions?.length > 0 && (
                    <div className="mt-1 text-[11px] text-slate-600">
                      Restricciones: {p.restrictions.join(', ')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar el plan "${p.name}"?`)) {
                      remove.mutate(p.id);
                    }
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AuditTab({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'member', memberId, 'audit'],
    queryFn: () => adminApi.listAuditLog({ target: memberId, limit: 100 }),
    enabled: !!memberId,
  });
  if (isLoading) return <EmptyState label="Cargando auditoría…" />;
  const items = data?.items ?? [];
  if (items.length === 0)
    return <EmptyState label="No hay registros de auditoría para este socio." />;
  return (
    <Section title={`Auditoría · ${items.length} eventos`}>
      <ul className="divide-y divide-slate-200">
        {items.map((a) => (
          <li key={a.id} className="py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-slate-700">
                {a.action}
              </span>
              <span className="text-[11px] text-slate-500">
                {formatDate(a.created_at)}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-slate-600">
              {a.actor_name ?? 'sistema'}
              {a.actor_role ? ` · ${a.actor_role}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
