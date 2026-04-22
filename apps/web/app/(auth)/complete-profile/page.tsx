'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Completing the profile is no longer a forced post-register step.
 * The full profile + emergency contact form lives in /portal/perfil
 * and is promoted via the dismissible banner on the portal layout.
 *
 * This page stays as a safe redirect so any pre-existing link (old
 * emails, bookmarks, the former verify-page fallback) still lands
 * the user on the right screen.
 */
export default function CompleteProfileRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/portal/perfil');
  }, [router]);
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-slate-600">
      <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
      <p>Redirigiendo a tu perfil…</p>
    </div>
  );
}
