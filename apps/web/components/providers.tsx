'use client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker
      .register('/sw.js')
      .catch((e) => console.warn('SW registration failed:', e));
  }, []);

  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: 'rgba(20,20,20,0.95)',
              border: '1px solid rgba(255,107,26,0.2)',
              color: '#fff',
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
