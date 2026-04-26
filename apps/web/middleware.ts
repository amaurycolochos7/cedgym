import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'cedgym_session';
const ROLE_COOKIE = 'cedgym_role';

const AUTH_ONLY_PREFIXES = ['/dashboard', '/checkout', '/portal'];

/** Roles allowed to access /admin/*. */
const ADMIN_ROLES = new Set(['ADMIN', 'SUPERADMIN']);

/** Roles allowed to access /staff/*. */
const STAFF_ROLES = new Set(['RECEPTIONIST', 'ADMIN', 'SUPERADMIN']);

/** /portal/* is the athlete-only experience. Anyone else (admin,
 *  receptionist) gets bounced to their own landing. */
function landingForRole(role: string): string {
  if (role === 'SUPERADMIN' || role === 'ADMIN') return '/admin/dashboard';
  if (role === 'RECEPTIONIST') return '/staff/scan';
  return '/portal/dashboard';
}

/**
 * Route gate.
 *
 * - /admin/*   → requires session + role in ADMIN_ROLES
 * - /staff/*   → requires session + role in STAFF_ROLES
 * - /portal/*  → requires session AND role === 'ATHLETE'
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
  const isPortal = pathname === '/portal' || pathname.startsWith('/portal/');
  const isAuthOnly = AUTH_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isLogin = pathname === '/login';

  if (!isAdmin && !isStaff && !isAuthOnly && !isLogin) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.get(SESSION_COOKIE)?.value === '1';

  // Already logged in → /login should bounce to the role's landing instead
  // of showing the form again. Skip when ?expired=1 or ?idle=1 so the
  // session-expired/idle messaging the API layer sets still renders.
  if (isLogin) {
    if (!hasSession) return NextResponse.next();
    const expired = req.nextUrl.searchParams.get('expired') === '1';
    const idle = req.nextUrl.searchParams.get('idle') === '1';
    if (expired || idle) return NextResponse.next();
    const role = req.cookies.get(ROLE_COOKIE)?.value ?? '';
    const redirectParam = req.nextUrl.searchParams.get('redirect');
    const dest = req.nextUrl.clone();
    dest.pathname = redirectParam || landingForRole(role);
    dest.search = '';
    return NextResponse.redirect(dest);
  }

  if (!hasSession) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const role = req.cookies.get(ROLE_COOKIE)?.value ?? '';

  if (isAdmin || isStaff) {
    const allowed = isAdmin ? ADMIN_ROLES.has(role) : STAFF_ROLES.has(role);

    if (!allowed) {
      const denyUrl = req.nextUrl.clone();
      denyUrl.pathname = landingForRole(role);
      denyUrl.search = '';
      denyUrl.searchParams.set('denied', '1');
      return NextResponse.redirect(denyUrl);
    }
  }

  // Portal is athlete-only. Redirect non-athletes (admin/super/
  // receptionist) to their proper landing so they never see the
  // member-style UI by mistake.
  if (isPortal && role && role !== 'ATHLETE') {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = landingForRole(role);
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/dashboard/:path*',
    '/checkout/:path*',
    '/portal/:path*',
    '/admin/:path*',
    '/staff/:path*',
  ],
};
