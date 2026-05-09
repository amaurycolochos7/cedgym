'use client';

// Guard que bloquea el acceso al portal si el socio no ha terminado
// el wizard de perfil (campo profile_completed=false en BD). Lo manda
// a /onboarding hasta que termine.
//
// Aplica DENTRO de /portal/* — el middleware ya filtra por rol, así
// que aquí asumimos que el usuario es ATHLETE. Si en el futuro
// admins/staff acceden a /portal, agregar el filtro de rol acá.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function OnboardingGuard() {
  const router = useRouter();
  const { user } = useAuth();

  const { data } = useQuery<{ user: { profile_completed?: boolean } }>({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!user) return;
    const me = data?.user;
    if (!me) return;
    if (me.profile_completed) return;
    // El socio terminó OTP pero no ha completado el wizard. Lo
    // mandamos a /onboarding sin opción a quedarse en /portal.
    router.replace('/onboarding');
  }, [data, user, router]);

  return null;
}
