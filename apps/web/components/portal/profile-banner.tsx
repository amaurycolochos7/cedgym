'use client';

import Link from 'next/link';
import { AlertCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

export function ProfileCompletionBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem('cedgym_profile_banner_dismissed') === '1');
  }, []);

  if (dismissed || !user || user.profile_completed) return null;

  return (
    <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 text-sm">
      <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
      <span className="flex-1 text-orange-100 leading-snug">
        Completa tu perfil para acceder a más beneficios.
      </span>
      <Link
        href="/portal/perfil"
        className="shrink-0 text-orange-300 hover:text-orange-200 font-medium whitespace-nowrap"
      >
        Completar →
      </Link>
      <button
        onClick={() => {
          localStorage.setItem('cedgym_profile_banner_dismissed', '1');
          setDismissed(true);
        }}
        className="shrink-0 text-orange-300/60 hover:text-orange-200"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
