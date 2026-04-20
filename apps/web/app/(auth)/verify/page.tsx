'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, MessageCircle, RotateCcw } from 'lucide-react';
import { OtpInput } from '@/components/ui/otp-input';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form';
import { authApi, normalizeError } from '@/lib/api';
import { formatMMSS, lsDelete, lsGetJSON } from '@/lib/utils';
import {
  POST_REGISTER_REDIRECT_KEY,
  useAuth,
  type PostRegisterRedirect,
} from '@/lib/auth';
import type { ApiError } from '@/lib/schemas';

const OTP_TOTAL_SECONDS = 10 * 60;
const RESEND_COOLDOWN = 60;

function maskPhone(raw: string | null): string {
  if (!raw) return '+52 ••• •••• ••••';
  const digits = raw.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return `+52 ${digits}`;
  return `+52 ${digits.slice(0, 2)} •••• ${digits.slice(6)}`;
}

export default function VerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  const rawPhone = params.get('phone') ?? '';
  const phoneDigits = rawPhone.replace(/\D/g, '').slice(-10);
  const { hydrateFromAuthResponse } = useAuth();

  const [code, setCode] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(OTP_TOTAL_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [welcomeCheckout, setWelcomeCheckout] =
    useState<PostRegisterRedirect | null>(null);

  // Countdown for OTP validity
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [secondsLeft]);

  // Cooldown for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setInterval(
      () => setResendCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [resendCooldown]);

  const verify = useMutation({
    mutationFn: authApi.verifyOtp,
    onSuccess: (resp) => {
      hydrateFromAuthResponse(resp);
      const stored = lsGetJSON<PostRegisterRedirect>(
        POST_REGISTER_REDIRECT_KEY,
      );
      if (stored?.path?.startsWith('/checkout/')) {
        setWelcomeCheckout(stored);
        return; // modal handles navigation
      }
      lsDelete(POST_REGISTER_REDIRECT_KEY);
      // Post-OTP the account is active — land directly on the portal
      // dashboard. Profile/emergency contact are now optional and live at
      // /portal/perfil (promoted via a dismissible banner).
      const fallback = stored?.path ?? '/portal/dashboard';
      router.push(fallback);
    },
    onError: (err) => {
      const norm = normalizeError(err) as ApiError;
      setApiError(norm.message);
    },
  });

  const resend = useMutation({
    mutationFn: authApi.resendOtp,
    onSuccess: () => {
      toast.success('Código reenviado. Revisa tu WhatsApp.');
      setResendCooldown(RESEND_COOLDOWN);
      setSecondsLeft(OTP_TOTAL_SECONDS);
    },
    onError: (err) => {
      toast.error((normalizeError(err) as ApiError).message);
    },
  });

  const onComplete = (value: string) => {
    setApiError(null);
    verify.mutate({
      phone: `+52${phoneDigits}`,
      code: value,
    });
  };

  const maskedPhone = useMemo(() => maskPhone(rawPhone), [rawPhone]);
  const expired = secondsLeft <= 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-block rounded-full border border-brand-orange/30 bg-brand-orange/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-brand-orange">
          Paso 2 de 2
        </span>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-orange/15 text-brand-orange">
          <MessageCircle size={22} />
        </span>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          Verifica tu WhatsApp
        </h1>
        <p className="text-sm text-white/60">
          Te enviamos un código de 6 dígitos a{' '}
          <span className="font-semibold text-white">{maskedPhone}</span>.
        </p>
      </div>

      <FormError>{apiError}</FormError>

      <DevOtpHint phone={`+52${phoneDigits}`} purpose="REGISTER" />

      <OtpInput
        value={code}
        onChange={setCode}
        onComplete={onComplete}
        autoFocus
        disabled={verify.isPending || expired}
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
            expired
              ? 'border-red-400/40 bg-red-400/10 text-red-300'
              : 'border-white/10 bg-white/5 text-white/70'
          }`}
        >
          <Clock size={12} />
          {expired ? 'Código expirado' : `Expira en ${formatMMSS(secondsLeft)}`}
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={() => onComplete(code)}
        loading={verify.isPending}
        disabled={code.length !== 6 || expired}
      >
        Verificar
      </Button>

      <button
        type="button"
        onClick={() =>
          resend.mutate({
            phone: `+52${phoneDigits}`,
            purpose: 'REGISTER',
          })
        }
        disabled={resendCooldown > 0 || resend.isPending}
        className="group inline-flex items-center justify-center gap-2 text-sm text-white/70 transition-colors hover:text-brand-orange disabled:cursor-not-allowed disabled:text-white/40"
      >
        <RotateCcw
          size={14}
          className="transition-transform group-hover:-rotate-45"
        />
        {resendCooldown > 0
          ? `Reenviar en ${resendCooldown}s`
          : 'Reenviar código'}
      </button>

      <div className="text-center text-sm text-white/60">
        ¿Número equivocado?{' '}
        <Link
          href="/register"
          className="font-semibold text-brand-orange hover:underline"
        >
          Corregir
        </Link>
      </div>

      {welcomeCheckout && (
        <WelcomeCheckoutModal
          redirect={welcomeCheckout}
          onContinue={() => {
            lsDelete(POST_REGISTER_REDIRECT_KEY);
            const sep = welcomeCheckout.path.includes('?') ? '&' : '?';
            router.push(`${welcomeCheckout.path}${sep}welcome=1`);
          }}
        />
      )}
    </div>
  );
}

// Dev-only hint: in local development the WhatsApp bot may not be paired
// to a real account. The API logs every generated OTP to stdout with the
// prefix `[OTP DEV]`. This component tells the dev where to look so the
// UI doesn't feel broken while WhatsApp is offline.
//
// Visibility rule: shown when NEXT_PUBLIC_ENV === 'development' OR when
// the page is served from localhost. Both guards are needed because the
// env var isn't always set in local dev.
function DevOtpHint({
  phone,
  purpose,
}: {
  phone: string;
  purpose: 'REGISTER' | 'PASSWORD_RESET';
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isDevEnv = process.env.NEXT_PUBLIC_ENV === 'development';
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    setVisible(isDevEnv || isLocal);
  }, []);
  if (!visible) return null;
  return (
    <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-xs text-blue-100">
      <p className="font-semibold text-blue-200">Modo dev</p>
      <p className="mt-1 leading-relaxed">
        El código real está en los logs del servidor API (stdout). Busca
        una línea como{' '}
        <code className="rounded bg-black/40 px-1 py-0.5">[OTP DEV]</code>{' '}
        con <code className="px-1">phone={phone}</code>{' '}
        <code className="px-1">purpose={purpose}</code> y copia los 6
        dígitos aquí.
      </p>
    </div>
  );
}

function WelcomeCheckoutModal({
  redirect,
  onContinue,
}: {
  redirect: PostRegisterRedirect;
  onContinue: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in"
    >
      <div className="glass-card w-full max-w-md rounded-3xl p-8 text-center">
        <span className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-orange/20 text-brand-orange">
          <CheckCircle2 size={26} />
        </span>
        <h2 id="welcome-title" className="text-2xl font-black">
          ¡Bienvenido a CED·GYM!
        </h2>
        <p className="mt-2 text-sm text-white/70">
          Tu cuenta ya está lista. Continúa con tu compra de{' '}
          <em className="font-bold not-italic text-brand-orange">
            {redirect.productLabel ?? 'tu producto'}
          </em>
          .
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-6 w-full"
          onClick={onContinue}
        >
          Continuar al checkout
        </Button>
      </div>
    </div>
  );
}
