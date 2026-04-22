'use client';

/*
 * Trainer chat — we deliberately re-use the portal chat UI. Backend treats
 * the trainer the same as any other user in the conversations table, so the
 * endpoints behave identically (messages hydrate with `is_own` based on the
 * JWT subject). If the UX needs to diverge later, fork this file.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { api } from '@/lib/api';

export default function TrainerChatPage() {
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
      (
        await api.post(`/chat/conversations/${activeId}/messages`, {
          body: draft,
        })
      ).data,
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['chat', 'messages', activeId] });
    },
  });

  const items = convs?.items ?? [];
  const messages = msgs?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Chat</h1>
        <p className="text-sm text-slate-600">
          Comunícate con tus atletas y el equipo del gym.
        </p>
      </div>
      <div className="grid h-[calc(100vh-14rem)] gap-4 md:grid-cols-[280px_1fr]">
        <aside className="overflow-y-auto rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-semibold text-slate-900">Conversaciones</h2>
          </div>
          {items.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">
              Sin conversaciones activas.
            </div>
          ) : (
            items.map(
              (c: {
                id: string;
                title?: string;
                last_message?: { body?: string };
              }) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={
                    activeId === c.id
                      ? 'w-full border-b border-slate-200 bg-blue-50 p-4 text-left'
                      : 'w-full border-b border-slate-200 p-4 text-left hover:bg-slate-50'
                  }
                >
                  <div className="text-sm font-medium text-slate-900">
                    {c.title ?? 'Conversación'}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {c.last_message?.body ?? 'Sin mensajes'}
                  </div>
                </button>
              ),
            )
          )}
        </aside>

        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white">
          {!activeId ? (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-2 h-10 w-10" />
                Selecciona una conversación
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {messages.map(
                  (m: {
                    id: string;
                    is_own?: boolean;
                    body: string;
                    created_at: string;
                  }) => (
                    <div
                      key={m.id}
                      className={
                        m.is_own ? 'flex justify-end' : 'flex justify-start'
                      }
                    >
                      <div
                        className={
                          m.is_own
                            ? 'max-w-[70%] rounded-2xl rounded-br-md bg-blue-600 px-3 py-2 text-white'
                            : 'max-w-[70%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-slate-900'
                        }
                      >
                        <div className="text-sm">{m.body}</div>
                        <div
                          className={
                            m.is_own
                              ? 'mt-1 text-[10px] text-white/70'
                              : 'mt-1 text-[10px] text-slate-500'
                          }
                        >
                          {new Date(m.created_at).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) send.mutate();
                }}
                className="flex gap-2 border-t border-slate-200 p-3"
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escribe un mensaje…"
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || send.isPending}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 p-2.5 text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
