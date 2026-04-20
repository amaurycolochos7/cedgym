'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

interface CheckoutPageProps {
  params: { id: string };
}

export default function CheckoutPage({ params }: CheckoutPageProps) {
  const search = useSearchParams();
  const welcome = search.get('welcome') === '1';

  return (
    <div className="min-h-screen bg-brand-dark text-white">
      <header className="border-b border-white/5 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Logo size="sm" />
          <Link
            href="/dashboard"
            className="text-xs font-semibold uppercase tracking-widest text-white/70 hover:text-brand-orange"
          >
            Ir al dashboard →
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
        {welcome && (
          <div className="flex items-center gap-3 rounded-2xl border border-brand-orange/30 bg-brand-orange/10 px-4 py-3 text-sm text-brand-orange">
            <CheckCircle2 size={18} />
            ¡Bienvenido! Tu cuenta está lista, continuemos con tu compra.
          </div>
        )}

        <div className="glass-card flex flex-col items-center gap-4 rounded-3xl p-10 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-orange" />
          <h1 className="text-2xl font-black sm:text-3xl">
            Cargando checkout del producto{' '}
            <span className="text-brand-orange">{params.id}</span>…
          </h1>
          <p className="text-sm text-white/60">
            Esta pantalla es un placeholder. La integración con Mercado Pago y
            el motor de pedidos llega en la siguiente fase.
          </p>
        </div>
      </main>
    </div>
  );
}
