'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronsLeftRight,
  KeyRound,
  Pause,
  Play,
  QrCode,
  Send,
  Trash2,
} from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/admin/status-badge';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { adminApi } from '@/lib/admin-api';
import { planDisplayName, membershipStatusLabel } from '@/lib/utils';

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

  const openQr = async () => {
    try {
      const { url } = await adminApi.memberQrPng(id);
      window.open(url, '_blank');
    } catch {
      toast.error('No se pudo abrir el QR');
    }
  };

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
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {m?.status === 'active' ? (
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
          <button type="button" onClick={openQr} className={BTN_SECONDARY}>
            <QrCode className="h-3.5 w-3.5" />
            Ver QR
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
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="membership">Membresía</TabsTrigger>
          <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
          <TabsTrigger value="routines">Rutinas</TabsTrigger>
          <TabsTrigger value="classes">Clases</TabsTrigger>
          <TabsTrigger value="measurements">Mediciones</TabsTrigger>
          <TabsTrigger value="chat">Comunicaciones</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Section title="Información general">
            <DetailGrid
              items={[
                ['ID', id],
                ['Nombre', m?.name ?? '—'],
                ['Teléfono', m?.phone ?? '—'],
                ['Email', (m?.email as string) ?? '—'],
                ['Creado', m?.created_at ?? '—'],
              ]}
            />
          </Section>
        </TabsContent>

        <TabsContent value="membership">
          <Section title="Membresía actual">
            <DetailGrid
              items={[
                ['Plan', planDisplayName((m as any)?.membership?.plan ?? m?.plan_code)],
                ['Estado', membershipStatusLabel((m as any)?.membership?.status)],
                ['Vence', (m as any)?.membership?.expires_at ?? m?.expires_at ?? '—'],
              ]}
            />
          </Section>
        </TabsContent>

        <TabsContent value="checkins">
          <Placeholder label="Histórico de check-ins (consume /admin/members/:id/checkins)" />
        </TabsContent>
        <TabsContent value="payments">
          <Placeholder label="Pagos asociados (consume /admin/members/:id/payments)" />
        </TabsContent>
        <TabsContent value="routines">
          <Placeholder label="Rutinas compradas" />
        </TabsContent>
        <TabsContent value="classes">
          <Placeholder label="Clases y asistencia" />
        </TabsContent>
        <TabsContent value="measurements">
          <Placeholder label="Mediciones corporales" />
        </TabsContent>
        <TabsContent value="chat">
          <Placeholder label="Historial de WhatsApp / chat" />
        </TabsContent>
        <TabsContent value="audit">
          <Placeholder label="Audit log (cambios administrativos)" />
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

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
      <ChevronsLeftRight className="h-4 w-4" />
      {label}
    </div>
  );
}
