import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Punto de entrada de la PWA (start_url del manifest).
 *
 * Lee la cookie `cedgym_role` que se setea al login (ver lib/api.ts
 * tokenStore.setRole) y redirige al landing apropiado:
 *
 *   SUPERADMIN / ADMIN  → /admin/dashboard
 *   RECEPTIONIST         → /staff/scan
 *   ATHLETE              → /portal/dashboard
 *   sin sesión           → /login
 *
 * Es un Server Component — la redirección pasa antes de que el browser
 * cargue cualquier UI, así que el socio nunca ve un flash del portal
 * incorrecto. Si la cookie session se perdió pero el role todavía
 * está, /portal/* gateado por middleware lo mandará al login con el
 * redirect correcto.
 */
export const dynamic = 'force-dynamic';

export default async function StartPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('cedgym_session')?.value;
  const role = cookieStore.get('cedgym_role')?.value || '';

  if (session !== '1') {
    // Sin sesión activa — al login. Después del login, postLoginPathForRole
    // mete al usuario en su landing correspondiente.
    redirect('/login');
  }

  if (role === 'SUPERADMIN' || role === 'ADMIN') {
    redirect('/admin/dashboard');
  }
  if (role === 'RECEPTIONIST') {
    redirect('/staff/scan');
  }
  // ATHLETE o role desconocido (cookie corrupta) → portal por default.
  // El middleware del portal valida ATHLETE y rebota a su landing si
  // no coincide.
  redirect('/portal/dashboard');
}
