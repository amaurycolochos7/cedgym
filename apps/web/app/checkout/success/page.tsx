import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 bg-zinc-900/70 border border-emerald-500/30 rounded-2xl p-8">
        <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
        <h1 className="text-3xl font-bold">¡Pago exitoso!</h1>
        <p className="text-zinc-400">
          Tu pago fue aprobado. Te enviamos confirmación por WhatsApp y tu membresía/compra está activa.
        </p>
        <div className="flex gap-2 justify-center">
          <Link
            href="/portal/dashboard"
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
          >
            Ir al dashboard
          </Link>
          <Link
            href="/portal/qr"
            className="px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800"
          >
            Ver mi QR
          </Link>
        </div>
      </div>
    </div>
  );
}
