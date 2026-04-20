'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronsLeftRight,
  FileText,
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
import { Button } from '@/components/ui/button';
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

  const openCarnet = async () => {
    try {
      const { url } = await adminApi.memberCarnetPdf(id);
      window.open(url, '_blank');
    } catch {
      toast.error('No se pudo generar el PDF');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md p-2 text-white/60 hover:bg-white/5 hover:text-white"
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{m?.name ?? '…'}</h1>
          <div className="flex items-center gap-2 text-xs text-white/50">
            {m?.status && <StatusBadge status={m.status} />}
            <span>{m?.phone}</span>
            {m?.email && <span>· {m.email}</span>}
          </div>
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {m?.status === 'active' ? (
            <Button variant="ghost" onClick={() => setSuspend(true)}>
              <Pause className="h-3 w-3" />
              Suspender
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setReactivate(true)}>
              <Play className="h-3 w-3" />
              Reactivar
            </Button>
          )}
          <Button variant="ghost" onClick={() => setResetPw(true)}>
            <KeyRound className="h-3 w-3" />
            Reset password
          </Button>
          <Button variant="ghost" onClick={() => setWaOpen(true)}>
            <Send className="h-3 w-3" />
            WhatsApp
          </Button>
          <Button variant="ghost" onClick={openQr}>
            <QrCode className="h-3 w-3" />
            QR
          </Button>
          <Button variant="ghost" onClick={openCarnet}>
            <FileText className="h-3 w-3" />
            Carnet PDF
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDel(true)}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3 w-3" />
            Eliminar
          </Button>
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
                ['Plan', m?.plan_name ?? '—'],
                ['Estado', m?.status ?? '—'],
                ['Vence', m?.expires_at ?? '—'],
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
            router.replace('/admin/miembros');
          } catch (e: any) {
            toast.error(e?.response?.data?.error?.message || 'No se pudo eliminar');
          }
        }}
      />

      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar WhatsApp manual</DialogTitle>
            <DialogDescription>
              Texto libre, sin plantilla. Se registrará en audit log.
            </DialogDescription>
          </DialogHeader>
          <textarea
            rows={4}
            value={waBody}
            onChange={(e) => setWaBody(e.target.value)}
            placeholder="Hola, te escribimos de CED·GYM…"
            className="w-full rounded-lg border border-white/10 bg-input/60 p-3 text-sm text-white"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWaOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => waMut.mutate()}
              loading={waMut.isPending}
              disabled={waBody.trim().length < 4}
            >
              Enviar
            </Button>
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white">
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
        <div key={k} className="rounded-lg bg-white/[0.02] p-3">
          <dt className="text-[11px] uppercase tracking-wider text-white/40">
            {k}
          </dt>
          <dd className="mt-1 text-sm text-white">{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">
      <ChevronsLeftRight className="h-4 w-4" />
      {label}
    </div>
  );
}
