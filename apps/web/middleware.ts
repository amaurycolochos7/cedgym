import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'cedgym_session';
const ROLE_COOKIE = 'cedgym_role';

const AUTH_ONLY_PREFIXES = ['/dashboard', '/checkout', '/portal'];

/** Roles allowed to access /admin/*. */
const ADMIN_ROLES = new Set(['ADMIN', 'SUPERADMIN']);

/** Roles allowed to access /staff/*. */
const STAFF_ROLES = new Set([
  'RECEPTIONIST',
  'TRAINER',
  'ADMIN',
  'SUPERADMIN',
]);

/** Roles allowed to access /trainer/*. */
const TRAINER_ROLES = new Set(['TRAINER', 'ADMIN', 'SUPERADMIN']);

/**
 * Route gate.
 *
 * - /admin/*   → requires session + role in ADMIN_ROLES
 * - /staff/*   → requires session + role in STAFF_ROLES
 * - /trainer/* → requires session + role in TRAINER_ROLES
 * - other protected prefixes → just require session
 *
 * Because Next.js edge middleware cannot call the API to resolve the user,
 * we mirror the role into a non-HttpOnly cookie (`cedgym_role`) at login
 * time (see lib/api.ts:tokenStore.setRole). This is an explicit tradeoff —
 * the cookie is client-writable, but the API still enforces role checks
 * server-side, so the worst a tampered cookie can do is expose empty UI
 * that 401s every data call.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isStaff = pathname === '/staff' || pathname.startsWith('/staff/');
  const isTrainer =
    pathname === '/trainer' || pathname.startsWith('/trainer/');
  const isAuthOnly = AUTH_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!isAdmin && !isStaff && !isTrainer && !isAuthOnly)
    return NextResponse.next();

  const hasSession = req.cookies.get(SESSION_COOKIE)?.value === '1';
  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdmin || isStaff || isTrainer) {
    const role = req.cookies.get(ROLE_COOKIE)?.value ?? '';
    const allowed = isAdmin
      ? ADMIN_ROLES.has(role)
      : isTrainer
        ? TRAINER_ROLES.has(role)
        : STAFF_ROLES.has(role);

    if (!allowed) {
      const denyUrl = req.nextUrl.clone();
      denyUrl.pathname = '/portal/dashboard';
      denyUrl.search = '';
      denyUrl.searchParams.set('denied', '1');
      return NextResponse.redirect(denyUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/checkout/:path*',
    '/portal/:path*',
    '/admin/:path*',
    '/staff/:path*',
    '/trainer/:path*',
  ],
};
