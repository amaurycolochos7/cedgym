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
// También es el destino del flujo walk-in (/welcome). Llegan con
// birth_date + gender ya capturados por recepción, los pre-llenamos
// en el wizard.
//
// Reusamos `<FitnessProfileWizard>` que ya está cocido. Hidrata datos
// existentes desde /auth/me (el wizard mismo se queda con drafts en
// localStorage, así que si el socio cierra y vuelve, retoma donde quedó).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FitnessProfileWizard } from '@/components/portal/fitness-profile-wizard';

export default function OnboardingPage() {
  const router = useRouter();

  // /auth/me trae lo que ya haya — para self-register acabado de
  // verificar OTP esto será null en routine_profile/nutrition_profile,
  // pero si el socio viene a medias de una sesión anterior (cerró el
  // navegador) sí trae lo que hubiera quedado guardado server-side.
  const { data: me, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  // Si el socio ya completó el wizard antes (reactivación, vuelve por
  // un link viejo, etc.) lo soltamos directo al portal — no tiene
  // caso volver a llenar nada.
  useEffect(() => {
    if (me?.user?.profile_completed) {
      router.replace('/portal/dashboard');
    }
  }, [me, router]);

  const initial = (() => {
    const u = me?.user as
      | {
          full_name?: string | null;
          name?: string | null;
          birth_date?: string | null;
          gender?: string | null;
          fitness_profile?: Record<string, unknown>;
          routine_profile?: Record<string, unknown>;
          nutrition_profile?: Record<string, unknown>;
        }
      | undefined;
    if (!u) return null;

    // Pre-fill desde datos que ya capturó recepción en el alta walk-in
    // o que el socio metió al registrarse (full_name del /register).
    // El socio aterriza viendo nombre, edad y género ya marcados —
    // solo confirma/corrige y avanza.
    const seed: Record<string, unknown> = {};
    if (u.full_name && u.full_name.trim()) {
      seed.full_name = u.full_name.trim();
    } else if (u.name && u.name.trim()) {
      seed.full_name = u.name.trim();
    }
    if (u.birth_date) {
      // Normalizamos a YYYY-MM-DD para el <input type="date">.
      const dob = new Date(u.birth_date);
      if (!Number.isNaN(dob.getTime())) {
        seed.birth_date = dob.toISOString().slice(0, 10);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const beforeBirthday =
          today.getMonth() < dob.getMonth() ||
          (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
        if (beforeBirthday) age -= 1;
        if (age >= 6 && age <= 99) seed.age = age;
      }
    }
    if (u.gender) {
      // El user model usa MALE/FEMALE/OTHER/PREFER_NOT_SAY; el wizard
      // solo entiende MALE/FEMALE/OTHER. Colapsamos PREFER_NOT_SAY a OTHER.
      const g = u.gender === 'PREFER_NOT_SAY' ? 'OTHER' : u.gender;
      seed.gender = g;
    }

    // Lo que ya esté en perfil vivo gana sobre el seed (orden importa).
    const merged: Record<string, unknown> = {
      ...seed,
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
