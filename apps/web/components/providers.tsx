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
          theme="light"
          position="top-right"
          offset={16}
          closeButton
          visibleToasts={3}
          toastOptions={{
            duration: 3500,
            classNames: {
              toast:
                'group !bg-white !border !border-slate-200 !shadow-lg !rounded-xl !p-4 !text-slate-900 !font-sans',
              title: '!text-slate-900 !font-semibold !text-sm',
              description: '!text-slate-600 !text-sm',
              actionButton:
                '!bg-blue-600 !text-white hover:!bg-blue-700 !rounded-lg !px-3 !py-1.5 !text-xs !font-semibold',
              cancelButton:
                '!bg-slate-100 !text-slate-700 hover:!bg-slate-200 !rounded-lg !px-3 !py-1.5 !text-xs !font-semibold',
              closeButton:
                '!bg-white !border !border-slate-200 !text-slate-500 hover:!text-slate-900 hover:!bg-slate-50',
              success:
                '!bg-white !border-l-4 !border-l-emerald-500',
              error:
                '!bg-white !border-l-4 !border-l-red-500',
              warning:
                '!bg-white !border-l-4 !border-l-amber-500',
              info:
                '!bg-white !border-l-4 !border-l-blue-500',
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
