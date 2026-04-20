'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { api } from '@/lib/api';

export default function PortalChatPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const { data: convs } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: async () => (await api.get('/chat/conversations')).data,
  });

  const { data: msgs } = useQuery({
    queryKey: ['chat', 'messages', activeId],
    queryFn: async () =>
      (await api.get(`/chat/conversations/${activeId}/messages`)).data,
    enabled: !!activeId,
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: async () =>
      (await api.post(`/chat/conversations/${activeId}/messages`, { body: draft })).data,
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['chat', 'messages', activeId] });
    },
  });

  const items = convs?.items ?? [];
  const messages = msgs?.items ?? [];

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-10rem)]">
      <aside className="bg-zinc-900/70 border border-zinc-800 rounded-xl overflow-y-auto">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="font-semibold">Conversaciones</h2>
        </div>
        {items.length === 0 ? (
          <div className="p-4 text-sm text-zinc-500">
            Sin conversaciones activas.
          </div>
        ) : (
          items.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={
                activeId === c.id
                  ? 'w-full text-left p-4 border-b border-zinc-800 bg-blue-500/10'
                  : 'w-full text-left p-4 border-b border-zinc-800 hover:bg-zinc-800/60'
              }
            >
              <div className="font-medium text-sm">{c.title ?? 'Conversación'}</div>
              <div className="text-xs text-zinc-500 mt-1 truncate">
                {c.last_message?.body ?? 'Sin mensajes'}
              </div>
            </button>
          ))
        )}
      </aside>

      <section className="bg-zinc-900/70 border border-zinc-800 rounded-xl flex flex-col">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <MessageSquare className="w-10 h-10 mx-auto mb-2" />
              Selecciona una conversación
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m: any) => (
                <div
                  key={m.id}
                  className={m.is_own ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      m.is_own
                        ? 'max-w-[70%] bg-blue-600 text-white px-3 py-2 rounded-2xl rounded-br-sm'
                        : 'max-w-[70%] bg-zinc-800 px-3 py-2 rounded-2xl rounded-bl-sm'
                    }
                  >
                    <div className="text-sm">{m.body}</div>
                    <div className="text-[10px] opacity-60 mt-1">
                      {new Date(m.created_at).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim()) send.mutate();
              }}
              className="p-3 border-t border-zinc-800 flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe un mensaje…"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={!draft.trim() || send.isPending}
                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
