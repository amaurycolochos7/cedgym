'use client';

// 3-step onboarding for new walk-in members. The receptionist already
// charged the membership; this is where the socio sets their password
// and uploads the selfie they need to enter the gym.
//
// Read `?t=<token>` from window.location to avoid useSearchParams() —
// keeps the page out of the SSR Suspense boundary requirement in
// Next 14 (same trick we use in /portal/membership).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Lock,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { api, normalizeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { planDisplayName } from '@/lib/utils';
import { SelfieCapture } from '@/components/portal/selfie-capture';

type WelcomeInfo = {
  user: {
    id: string;
    name: string;
    full_name?: string | null;
    phone: string;
    has_password: boolean;
    has_selfie: boolean;
  };
  membership: {
    plan: string;
    billing_cycle: string;
    status: string;
    expires_at: string;
  } | null;
};

type Step = 'loading' | 'invalid' | 'password' | 'selfie' | 'done';

export default function WelcomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { hydrateFromAuthResponse } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('loading');

  // Read token from URL once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('t');
    if (!t) {
      setStep('invalid');
      return;
    }
    setToken(t);
  }, []);

  // Validate token + load user info.
  const info = useQuery<WelcomeInfo>({
    queryKey: ['welcome-info', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const r = await api.get<WelcomeInfo>(`/auth/welcome/info?t=${encodeURIComponent(token!)}`);
      return r.data;
    },
  });

  // When info loads, advance to the right step depending on what's missing.
  useEffect(() => {
    if (!info.data || step === 'done') return;
    if (!info.data.user.has_password) setStep('password');
    else if (!info.data.user.has_selfie) setStep('selfie');
    else setStep('done');
  }, [info.data, step]);

  useEffect(() => {
    if (info.isError) setStep('invalid');
  }, [info.isError]);

  // ── Step: invalid token / loading ──────────────────────────
  if (step === 'loading' || info.isLoading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-600">Validando tu enlace…</p>
        </div>
      </Shell>
    );
  }

  if (step === 'invalid') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <AlertCircle className="h-7 w-7" />
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Link inválido o expirado
          </h1>
          <p className="max-w-md text-sm text-slate-600">
            Este enlace de bienvenida no es válido. Pídele al recepcionista
            del gym que te reenvíe uno nuevo por WhatsApp.
          </p>
        </div>
      </Shell>
    );
  }

  const planName = info.data?.membership
    ? planDisplayName(info.data.membership.plan)
    : null;
  const firstName = (info.data?.user.full_name ?? info.data?.user.name ?? '')
    .split(' ')[0];

  return (
    <Shell>
      <Header firstName={firstName} planName={planName} step={step} />

      {step === 'password' && (
        <StepPassword
          token={token!}
          onDone={(authResp) => {
            hydrateFromAuthResponse(authResp);
            qc.invalidateQueries({ queryKey: ['welcome-info'] });
            toast.success('¡Contraseña creada!');
            setStep('selfie');
          }}
        />
      )}

      {step === 'selfie' && (
        <StepSelfie
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['auth', 'me'] });
            qc.invalidateQueries({ queryKey: ['welcome-info'] });
            setStep('done');
          }}
        />
      )}

      {step === 'done' && (
        <StepDone
          onContinue={() => {
            router.push('/portal/dashboard');
          }}
        />
      )}
    </Shell>
  );
}

/* ────────── Layout ────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-blue-50 via-white to-sky-50 px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          CED·GYM · Fábrica de Monstruos
        </p>
      </div>
    </div>
  );
}

function Header({
  firstName,
  planName,
  step,
}: {
  firstName?: string;
  planName?: string | null;
  step: Step;
}) {
  if (step === 'done') return null;
  return (
    <div className="mb-6">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-blue-700">
        Paso {step === 'password' ? 1 : 2} de 2
      </div>
      <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-slate-900">
        ¡Hola{firstName ? `, ${firstName}` : ''}! 💪
      </h1>
      {planName && (
        <p className="mt-2 text-sm text-slate-600">
          Tu plan <span className="font-semibold text-slate-900">{planName}</span>{' '}
          ya está activo. Vamos a configurar tu acceso al gym en 2 pasos.
        </p>
      )}
    </div>
  );
}

/* ────────── Step 1: Password ────────── */

function StepPassword({
  token,
  onDone,
}: {
  token: string;
  onDone: (authResp: any) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid =
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password) &&
    password === confirm;

  const redeem = useMutation({
    mutationFn: async () => {
      const r = await api.post('/auth/welcome/redeem', { token, password });
      return r.data;
    },
    onSuccess: (data) => onDone(data),
    onError: (e: any) => {
      const norm = normalizeError(e);
      setErr(norm.message || 'No pudimos crear tu contraseña.');
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (!valid) return;
        redeem.mutate();
      }}
      className="space-y-4"
    >
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
          <Lock className="h-5 w-5 text-blue-600" /> Crea tu contraseña
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Mínimo 8 caracteres, debe incluir letras y números.
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Contraseña
        </label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-10 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={show ? 'Ocultar' : 'Mostrar'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Confirma tu contraseña
        </label>
        <input
          type={show ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
          placeholder="••••••••"
        />
        {confirm && password !== confirm && (
          <p className="mt-1.5 text-xs text-rose-600">Las contraseñas no coinciden.</p>
        )}
      </div>

      {err && (
        <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={!valid || redeem.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-display text-sm font-bold uppercase tracking-wider text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-50"
      >
        {redeem.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            Continuar <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}

/* ────────── Step 2: Selfie ────────── */

function StepSelfie({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
          <Camera className="h-5 w-5 text-blue-600" /> Toma tu selfie
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          La necesitamos para que el recepcionista pueda identificarte
          al entrar al gym. Sin selfie no podrás usar tu QR de acceso.
        </p>
      </div>

      <SelfieCapture onSuccess={onDone} />
    </div>
  );
}

/* ────────── Step 3: Done ────────── */

function StepDone({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="h-8 w-8" />
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
        ¡Todo listo!
      </h1>
      <p className="max-w-sm text-sm text-slate-600">
        Tu cuenta está configurada. Ahora puedes ver tu QR de entrada,
        tus rutinas y tu plan de comidas en el portal.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-display text-sm font-bold uppercase tracking-wider text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
      >
        Entrar a mi portal <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
