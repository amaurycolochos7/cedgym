'use client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from 'sonner';
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

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
          position="top-center"
          offset={16}
          gap={8}
          visibleToasts={3}
          icons={{
            success: <CheckCircle2 className="h-5 w-5 text-emerald-500" strokeWidth={2.25} />,
            error: <XCircle className="h-5 w-5 text-rose-500" strokeWidth={2.25} />,
            warning: <AlertTriangle className="h-5 w-5 text-amber-500" strokeWidth={2.25} />,
            info: <Info className="h-5 w-5 text-blue-600" strokeWidth={2.25} />,
            loading: <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />,
          }}
          toastOptions={{
            duration: 3000,
            unstyled: false,
            classNames: {
              toast:
                'group !bg-white !border !border-slate-200 !shadow-md !shadow-slate-900/[0.06] !rounded-2xl !px-4 !py-3 !gap-3 !text-slate-900 !font-sans !min-h-0 !items-center',
              title: '!text-slate-900 !font-semibold !text-sm !leading-tight',
              description: '!text-slate-500 !text-[13px] !mt-0.5 !leading-snug',
              icon: '!flex !items-center !justify-center !h-5 !w-5 !shrink-0 !m-0',
              success: '!border-emerald-100',
              error: '!border-rose-100',
              warning: '!border-amber-100',
              info: '!border-blue-100',
              actionButton:
                '!bg-blue-600 !text-white hover:!bg-blue-700 !rounded-lg !px-3 !py-1.5 !text-xs !font-semibold !transition',
              cancelButton:
                '!bg-slate-100 !text-slate-700 hover:!bg-slate-200 !rounded-lg !px-3 !py-1.5 !text-xs !font-semibold !transition',
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
