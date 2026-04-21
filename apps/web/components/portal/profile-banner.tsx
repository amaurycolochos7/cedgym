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
    <div className="bg-blue-50 border-b border-blue-200 px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 text-sm">
      <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
      <span className="flex-1 text-blue-900 leading-snug">
        Completa tu perfil para acceder a más beneficios.
      </span>
      <Link
        href="/portal/perfil"
        className="shrink-0 text-blue-700 hover:text-blue-800 font-semibold whitespace-nowrap"
      >
        Completar →
      </Link>
      <button
        onClick={() => {
          localStorage.setItem('cedgym_profile_banner_dismissed', '1');
          setDismissed(true);
        }}
        className="shrink-0 text-blue-500 hover:text-blue-700"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
