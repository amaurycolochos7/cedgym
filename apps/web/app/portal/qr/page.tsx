'use client';

import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const CACHE_KEY = 'cedgym_qr_cache';

export default function PortalQRPage() {
  const { user } = useAuth();
  const [cached, setCached] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ['checkins', 'me', 'qr-token'],
    queryFn: async () => (await api.get('/checkins/me/qr-token')).data,
    refetchInterval: 55_000,
    staleTime: 50_000,
  });

  useEffect(() => {
    if (data?.token) {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ token: data.token, at: Date.now() })
      );
      setCached(data.token);
    }
  }, [data]);

  useEffect(() => {
    if (!data && !isLoading) {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        try {
          const { token, at } = JSON.parse(raw);
          if (Date.now() - at < 90_000) setCached(token);
        } catch { /* ignore */ }
      }
    }
  }, [data, isLoading]);

  const token = data?.token ?? cached;
  const offline = !data && !!cached;

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center gap-8 py-10">
      <div className="text-center">
        <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
          {user?.name ?? 'Atleta'}
        </div>
        <h1 className="text-4xl font-bold">Tu acceso CED·GYM</h1>
        <p className="text-zinc-400 mt-2">
          Muéstralo en recepción para entrar al gym.
        </p>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-2xl shadow-orange-500/20">
        {token ? (
          <QRCode value={token} size={280} level="M" />
        ) : isLoading ? (
          <div className="w-[280px] h-[280px] bg-zinc-100 animate-pulse rounded-xl" />
        ) : (
          <div className="w-[280px] h-[280px] flex items-center justify-center text-zinc-400 text-center text-sm px-4">
            No fue posible cargar tu QR. Verifica tu conexión y tu membresía.
          </div>
        )}
      </div>

      <div className="text-center text-sm">
        {offline ? (
          <span className="text-amber-400">
            ⚠️ Modo offline — usando QR en caché
          </span>
        ) : (
          <span className="text-zinc-500">
            Se actualiza automáticamente cada 60 segundos
          </span>
        )}
      </div>

      {error && !cached && (
        <div className="text-red-400 text-sm">
          Error: {(error as any)?.message ?? 'No se pudo obtener el QR.'}
        </div>
      )}
    </div>
  );
}
