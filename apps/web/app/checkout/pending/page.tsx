import Link from 'next/link';
import { Clock } from 'lucide-react';

export default function CheckoutPendingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 bg-zinc-900/70 border border-amber-500/30 rounded-2xl p-8">
        <Clock className="w-16 h-16 text-amber-400 mx-auto" />
        <h1 className="text-3xl font-bold">Pago en proceso</h1>
        <p className="text-zinc-400">
          Tu pago está siendo procesado. Te notificaremos por WhatsApp cuando se confirme
          (usualmente toma unos minutos para pagos OXXO).
        </p>
        <Link
          href="/portal/dashboard"
          className="inline-block px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
        >
          Ir al dashboard
        </Link>
      </div>
    </div>
  );
}
