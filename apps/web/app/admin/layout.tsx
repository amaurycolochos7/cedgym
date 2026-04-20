'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/admin/sidebar';
import { Topbar } from '@/components/admin/topbar';
import { useAuth } from '@/lib/auth';
import { useIdleLogout } from '@/lib/use-idle-logout';
import { toast } from 'sonner';

// Module-level constants: stable identity so the useIdleLogout effect
// dependencies don't re-subscribe on every render.
const IDLE_ROLES = ['ADMIN', 'SUPERADMIN'] as const;

const TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/miembros': 'Miembros',
  '/admin/staff': 'Mi equipo',
  '/admin/memberships': 'Membresías',
  '/admin/courses': 'Cursos',
  '/admin/classes': 'Clases',
  '/admin/payments': 'Pagos',
  '/admin/products': 'Marketplace',
  '/admin/inventory': 'Inventario',
  '/admin/whatsapp': 'WhatsApp',
  '/admin/promocodes': 'Promocodes',
  '/admin/referrals': 'Referidos',
  '/admin/reports': 'Reportes',
  '/admin/settings': 'Ajustes',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Auto-logout tras 30 min de inactividad, solo ADMIN y SUPERADMIN.
  // Warning 2 min antes del corte.
  useIdleLogout({
    applyToRoles: IDLE_ROLES as unknown as string[],
    idleMinutes: 30,
    warnBeforeMinutes: 2,
  });

  // Secondary client-side gate on top of middleware. Middleware already blocks
  // unauthorized navigations; this handles the case where cookie-role is
  // stale or the API flipped our role under us.
  React.useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (user.role && user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      toast.error('Acceso denegado', {
        description: 'Tu cuenta no tiene permisos de administración.',
      });
      router.replace('/portal/dashboard');
    }
  }, [user, loading, router]);

  const title = React.useMemo(() => {
    const match = Object.keys(TITLES).find(
      (k) => pathname === k || pathname.startsWith(`${k}/`),
    );
    return match ? TITLES[match] : 'Admin';
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-neutral-950 text-white">
      <Sidebar variant="admin" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar onMenu={() => setOpen(true)} title={title} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
