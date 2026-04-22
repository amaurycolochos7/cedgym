'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  RotateCcw,
} from 'lucide-react';
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

/** Light-themed OTP input (inlined — we do not touch the shared dark primitive). */
function LightOtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
}: {
  length?: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  React.useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const emit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const setDigitAt = (idx: number, digit: string) => {
    const chars = value.split('');
    while (chars.length < length) chars.push('');
    chars[idx] = digit;
    emit(chars.join(''));
  };

  const focusIdx = (idx: number) => {
    const clamped = Math.max(0, Math.min(length - 1, idx));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  };

  return (
    <div
      className="flex items-center justify-center gap-2 sm:gap-3"
      role="group"
      aria-label="Código de verificación"
    >
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete="one-time-code"
          disabled={disabled}
          value={value[idx] ?? ''}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, '');
            if (!raw) {
              setDigitAt(idx, '');
              return;
            }
            if (raw.length === 1) {
              setDigitAt(idx, raw);
              focusIdx(idx + 1);
              return;
            }
            const chars = value.split('');
            while (chars.length < length) chars.push('');
            for (let i = 0; i < raw.length && idx + i < length; i += 1) {
              chars[idx + i] = raw[i];
            }
            emit(chars.join(''));
            focusIdx(Math.min(idx + raw.length, length - 1));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              if (value[idx]) {
                setDigitAt(idx, '');
              } else if (idx > 0) {
                focusIdx(idx - 1);
                setDigitAt(idx - 1, '');
              }
              e.preventDefault();
              return;
            }
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              focusIdx(idx - 1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              focusIdx(idx + 1);
            }
          }}
          onPaste={(e) => {
            const paste = e.clipboardData.getData('text').replace(/\D/g, '');
            if (!paste) return;
            e.preventDefault();
            const chars = value.split('');
            while (chars.length < length) chars.push('');
            for (let i = 0; i < paste.length && idx + i < length; i += 1) {
              chars[idx + i] = paste[i];
            }
            emit(chars.join(''));
            focusIdx(Math.min(idx + paste.length, length - 1));
          }}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Dígito ${idx + 1}`}
          className="h-14 w-11 rounded-xl border border-slate-300 bg-white text-center text-2xl font-bold text-slate-900 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-50 sm:h-16 sm:w-14 sm:text-3xl"
        />
      ))}
    </div>
  );
}

export default function VerifyPage() {
  const router = useRouter();
  const params = useSearchParams();
  // Phone en E.164 (viene del /register paso 1 que ahora sí lo manda completo).
  const rawPhone = params.get('phone') ?? '';
  const e164Phone = rawPhone.startsWith('+')
    ? rawPhone
    : `+${rawPhone.replace(/\D/g, '')}`;
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
      phone: e164Phone,
      code: value,
    });
  };

  const maskedPhone = useMemo(() => maskPhone(rawPhone), [rawPhone]);
  const expired = secondsLeft <= 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-blue-700">
          Paso 2 de 2
        </span>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <MessageCircle size={22} />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Verifica tu WhatsApp
        </h1>
        <p className="text-sm text-slate-600">
          Te enviamos un código de 6 dígitos a{' '}
          <span className="font-semibold text-slate-900">{maskedPhone}</span>.
        </p>
      </div>

      {apiError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
        >
          {apiError}
        </div>
      )}

      <LightOtpInput
        value={code}
        onChange={setCode}
        onComplete={onComplete}
        autoFocus
        disabled={verify.isPending || expired}
      />

      <div className="flex flex-col items-center gap-2 text-center">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${
            expired
              ? 'border-rose-200 bg-rose-50 text-rose-600'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          <Clock size={12} />
          {expired
            ? 'Código expirado'
            : `Expira en ${formatMMSS(secondsLeft)}`}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onComplete(code)}
        disabled={verify.isPending || code.length !== 6 || expired}
        className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:opacity-50"
      >
        {verify.isPending && <Loader2 size={16} className="animate-spin" />}
        Verificar
      </button>

      <button
        type="button"
        onClick={() =>
          resend.mutate({
            phone: e164Phone,
            purpose: 'REGISTER',
          })
        }
        disabled={resendCooldown > 0 || resend.isPending}
        className="group inline-flex items-center justify-center gap-2 text-sm text-slate-600 transition hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        <RotateCcw
          size={14}
          className="transition-transform group-hover:-rotate-45"
        />
        {resendCooldown > 0
          ? `Reenviar en ${resendCooldown}s`
          : 'Reenviar código'}
      </button>

      <div className="text-center text-sm text-slate-600">
        ¿Número equivocado?{' '}
        <Link
          href="/register"
          className="font-semibold text-blue-600 transition hover:text-blue-700"
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <span className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <CheckCircle2 size={26} />
        </span>
        <h2
          id="welcome-title"
          className="font-display text-2xl font-bold text-slate-900"
        >
          ¡Bienvenido a CED·GYM!
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Tu cuenta ya está lista. Continúa con tu compra de{' '}
          <em className="font-bold not-italic text-blue-600">
            {redirect.productLabel ?? 'tu producto'}
          </em>
          .
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700"
        >
          Continuar al checkout
        </button>
      </div>
    </div>
  );
}
