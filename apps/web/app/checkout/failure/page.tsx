import Link from 'next/link';
import { XCircle } from 'lucide-react';

export default function CheckoutFailurePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 bg-zinc-900/70 border border-red-500/30 rounded-2xl p-8">
        <XCircle className="w-16 h-16 text-red-400 mx-auto" />
        <h1 className="text-3xl font-bold">Pago no completado</h1>
        <p className="text-zinc-400">
          Tu pago fue rechazado o cancelado. Intenta nuevamente con otro método.
        </p>
        <Link
          href="/portal/membership"
          className="inline-block px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
        >
          Intentar de nuevo
        </Link>
      </div>
    </div>
  );
}
