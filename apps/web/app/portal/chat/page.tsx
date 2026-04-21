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
      <aside className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl overflow-y-auto">
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Conversaciones</h2>
        </div>
        {items.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">
            Sin conversaciones activas.
          </div>
        ) : (
          items.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={
                activeId === c.id
                  ? 'w-full text-left p-4 border-b border-slate-200 bg-blue-50'
                  : 'w-full text-left p-4 border-b border-slate-200 hover:bg-slate-50'
              }
            >
              <div className={`font-medium text-sm ${activeId === c.id ? 'text-blue-900' : 'text-slate-900'}`}>{c.title ?? 'Conversación'}</div>
              <div className="text-xs text-slate-500 mt-1 truncate">
                {c.last_message?.body ?? 'Sin mensajes'}
              </div>
            </button>
          ))
        )}
      </aside>

      <section className="bg-white shadow-sm ring-1 ring-slate-200 rounded-xl flex flex-col">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <MessageSquare className="w-10 h-10 mx-auto mb-2" />
              <p className="text-slate-500">Selecciona una conversación</p>
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
                        ? 'max-w-[70%] bg-blue-600 text-white px-3 py-2 rounded-2xl rounded-br-sm shadow-sm'
                        : 'max-w-[70%] bg-slate-100 text-slate-900 px-3 py-2 rounded-2xl rounded-bl-sm'
                    }
                  >
                    <div className="text-sm">{m.body}</div>
                    <div className={`text-[10px] mt-1 ${m.is_own ? 'text-white/70' : 'text-slate-500'}`}>
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
              className="p-3 border-t border-slate-200 flex gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe un mensaje…"
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
              />
              <button
                type="submit"
                disabled={!draft.trim() || send.isPending}
                className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition shadow-sm"
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
