'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Menu } from 'lucide-react';
import { TrainerSidebar } from '@/components/trainer/sidebar';
import { useAuth } from '@/lib/auth';

const ALLOWED = new Set(['TRAINER', 'ADMIN', 'SUPERADMIN']);

export default function TrainerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Secondary client-side gate on top of middleware. Same pattern as admin
  // layout — middleware already blocks unauthorized routes, this is a
  // defence-in-depth check if the role cookie went stale.
  React.useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (user.role && !ALLOWED.has(user.role)) {
      toast.error('Acceso denegado', {
        description: 'Tu cuenta no tiene permisos de entrenador.',
      });
      router.replace('/portal/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen bg-neutral-950 text-white">
      <TrainerSidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/5 bg-neutral-950/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-white/70 hover:bg-white/5 hover:text-white"
            aria-label="Abrir menú"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold tracking-wider text-white/90">
            Portal Trainer
          </span>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
