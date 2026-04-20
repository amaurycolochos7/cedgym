import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Sin conexión · CED·GYM' };

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <WifiOff className="w-16 h-16 text-orange-400 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">Sin conexión</h1>
        <p className="text-zinc-400 mb-6">
          No hay internet, pero tu QR guardado sigue funcionando para entrar al gym.
        </p>
        <Link
          href="/portal/qr"
          className="inline-flex px-5 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-medium"
        >
          Ver mi QR
        </Link>
      </div>
    </div>
  );
}
