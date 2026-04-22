'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  chatApi,
  classesApi,
  coursesApi,
  portalApi,
  productsApi,
} from './api';
import { getSocket } from './socket';
import type { ChatMessage } from './schemas';
import { lsGetJSON, lsSetJSON } from './utils';

/* =========================================================================
 * Dashboard + streak + badges
 * =========================================================================*/

export function useDashboard() {
  return useQuery({
    queryKey: ['portal', 'dashboard'],
    queryFn: () => portalApi.dashboard(),
    staleTime: 30_000,
  });
}

export function useStreak() {
  const { data, ...rest } = useDashboard();
  return { streak: data?.streak, ...rest };
}

export function useBadges() {
  return useQuery({
    queryKey: ['portal', 'badges'],
    queryFn: () => portalApi.badges(),
    staleTime: 60_000,
  });
}

export function useMembership() {
  return useQuery({
    queryKey: ['portal', 'membership'],
    queryFn: () => portalApi.membership(),
  });
}

export function usePaymentHistory() {
  return useQuery({
    queryKey: ['portal', 'payments'],
    queryFn: () => portalApi.paymentHistory(),
  });
}

export function useMeasurements() {
  return useQuery({
    queryKey: ['portal', 'measurements'],
    queryFn: () => portalApi.measurements(),
  });
}


/* =========================================================================
 * QR token — auto-refreshing every 55s, cached offline-safe
 * =========================================================================*/

export const QR_LS_KEY = 'cedgym_last_qr';

export function useQrToken() {
  const q = useQuery({
    queryKey: ['qr-token'],
    queryFn: () => portalApi.qrToken(),
    refetchInterval: 55_000,
    refetchIntervalInBackground: true,
    retry: 2,
  });

  // Cache the latest-good token for offline use (90s TTL).
  useEffect(() => {
    if (q.data?.token) {
      lsSetJSON(QR_LS_KEY, q.data, 90_000);
    }
  }, [q.data]);

  // Fallback when offline/failing.
  const cached = q.data ? null : lsGetJSON<typeof q.data>(QR_LS_KEY);

  return {
    ...q,
    data: q.data ?? cached ?? undefined,
    isFromCache: !q.data && !!cached,
  };
}

/* =========================================================================
 * Classes
 * =========================================================================*/

export function useClasses(from?: string, to?: string) {
  return useQuery({
    queryKey: ['classes', { from, to }],
    queryFn: () => classesApi.list({ from, to }),
  });
}

export function useMyBookings() {
  return useQuery({
    queryKey: ['classes', 'me'],
    queryFn: () => classesApi.myBookings(),
  });
}

export function useBookClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (classId: string) => classesApi.book(classId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (classId: string) => classesApi.cancel(classId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

/* =========================================================================
 * Products / Purchases
 * =========================================================================*/

export function useMyPurchases() {
  return useQuery({
    queryKey: ['products', 'me'],
    queryFn: () => productsApi.myPurchases(),
  });
}

export function usePurchase(id: string) {
  return useQuery({
    queryKey: ['products', 'purchase', id],
    queryFn: () => productsApi.purchase(id),
    enabled: !!id,
  });
}

export function useMyCourses() {
  return useQuery({
    queryKey: ['courses', 'me'],
    queryFn: () => coursesApi.myCourses(),
  });
}

/* =========================================================================
 * Chat
 * =========================================================================*/

export function useConversations() {
  return useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: () => chatApi.conversations(),
    refetchInterval: 30_000,
  });
}

export function useChat(convId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['chat', 'messages', convId],
    queryFn: () => (convId ? chatApi.messages(convId) : Promise.resolve([])),
    enabled: !!convId,
  });

  // Live WS push
  useEffect(() => {
    if (!convId) return;
    const s = getSocket();
    const evt = `chat:${convId}:message`;
    const handler = (m: ChatMessage) => {
      qc.setQueryData<ChatMessage[]>(
        ['chat', 'messages', convId],
        (prev) => (prev ? [...prev, m] : [m]),
      );
    };
    s.emit('chat:join', { conversationId: convId });
    s.on(evt, handler);
    return () => {
      s.off(evt, handler);
      s.emit('chat:leave', { conversationId: convId });
    };
  }, [convId, qc]);

  const send = useMutation({
    mutationFn: (body: string) => chatApi.send(convId!, body),
    onSuccess: (m) => {
      qc.setQueryData<ChatMessage[]>(
        ['chat', 'messages', convId],
        (prev) => (prev ? [...prev, m] : [m]),
      );
    },
  });

  return { ...q, send };
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const ref = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    const s = getSocket();
    ref.current = s;
    const onC = () => setConnected(true);
    const onD = () => setConnected(false);
    s.on('connect', onC);
    s.on('disconnect', onD);
    setConnected(s.connected);
    return () => {
      s.off('connect', onC);
      s.off('disconnect', onD);
    };
  }, []);

  return { socket: ref.current, connected };
}

/* =========================================================================
 * Online/offline indicator (for PWA / QR)
 * =========================================================================*/

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
