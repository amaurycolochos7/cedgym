'use client';

// Onboarding del socio recién registrado.
//
// Flujo:
//   /register  → crea cuenta (POST /auth/register)
//   /verify    → confirma OTP por WhatsApp
//   /onboarding → este wizard (forzado a completar antes de poder usar
//                 el portal — la redirección la aplica el portal mismo
//                 cuando ve perfiles vacíos)
//   /portal    → home con su rutina ya generada
//
// Reusamos `<FitnessProfileWizard>` que ya está cocido. Hidrata datos
// existentes desde /auth/me (el wizard mismo se queda con drafts en
// localStorage, así que si el socio cierra y vuelve, retoma donde quedó).

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FitnessProfileWizard } from '@/components/portal/fitness-profile-wizard';

export default function OnboardingPage() {
  // /auth/me trae lo que ya haya — para self-register acabado de
  // verificar OTP esto será null en routine_profile/nutrition_profile,
  // pero si el socio viene a medias de una sesión anterior (cerró el
  // navegador) sí trae lo que hubiera quedado guardado server-side.
  const { data: me, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const initial = (() => {
    const u = me?.user as
      | {
          fitness_profile?: Record<string, unknown>;
          routine_profile?: Record<string, unknown>;
          nutrition_profile?: Record<string, unknown>;
        }
      | undefined;
    if (!u) return null;
    const merged: Record<string, unknown> = {
      ...(u.fitness_profile ?? {}),
      ...(u.routine_profile ?? {}),
      ...(u.nutrition_profile ?? {}),
    };
    return Object.keys(merged).length ? merged : null;
  })();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-blue-700">
          Último paso
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Cuéntanos sobre ti
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Con esta información el sistema te arma una rutina y un plan
          alimenticio personalizados. Toma 3-4 minutos. Si cierras la
          ventana, retomas donde te quedaste.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
        </div>
      ) : (
        <FitnessProfileWizard initial={initial} />
      )}
    </div>
  );
}
