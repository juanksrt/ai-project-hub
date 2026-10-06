'use client';

import React, { useCallback, useState } from 'react';

import type { ChatRequestInput } from '@/lib/chat-schema';
import { readRagMeta, type RagResponseMeta, type RagSource } from '@/lib/rag-contract';

/** Mensaje renderizado en la ventana de chat. */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Fuentes citadas en la respuesta (solo asistente). */
  sources?: RagSource[];
  /** `context` cuando no hay credencial de IA y no hubo LLM. */
  mode?: RagResponseMeta['mode'];
}

interface ChatSidebarProps {
  /** Restringe la busqueda de similitud a un proyecto concreto. */
  projectId?: string;
}

/** Saludo inicial del asistente. */
const GREETING: ChatMessage = {
  role: 'assistant',
  content:
    'Hola, soy el asistente de AI Project Hub. Consulto los proyectos y tareas indexados en PostgreSQL sin alucinar. ¿En qué puedo ayudarte?',
};

/**
 * Actualiza el ultimo mensaje del historial con el texto ya recibido.
 *
 * @param messages - Historial actual.
 * @param content - Texto acumulado del stream.
 * @returns Nuevo historial (el estado nunca se muta en el sitio).
 */
function updateLastMessage(messages: ChatMessage[], content: string): ChatMessage[] {
  const next = [...messages];
  const lastIndex = next.length - 1;
  const last = next[lastIndex];

  if (last && last.role === 'assistant') {
    next[lastIndex] = { ...last, content };
  }

  return next;
}

/**
 * Elimina los mensajes del asistente que quedaron vacios tras un fallo, para
 * que el error no deje una burbuja en blanco.
 *
 * @param messages - Historial actual.
 * @returns Historial sin las burbujas vacias del asistente.
 */
function removeEmptyAssistantMessages(messages: ChatMessage[]): ChatMessage[] {
  const next = [...messages];

  while (next.length > 0) {
    const last = next[next.length - 1];

    if (last && last.role === 'assistant' && last.content.trim() === '') {
      next.pop();
    } else {
      break;
    }
  }

  return next;
}

/**
 * Chat RAG del Dashboard.
 *
 * Envia la pregunta a `POST /api/chat`, lee la respuesta en streaming
 * (`response.body.getReader()`) para pintarla en tiempo real y muestra:
 * - estado de carga (busqueda vectorial) y de escritura (primer chunk),
 * - estado de error con boton de reintento,
 * - las fuentes citadas en las cabeceras `X-RAG-Sources`.
 *
 * @param props - `projectId` opcional para acotar la busqueda al proyecto.
 */
export default function ChatSidebar({ projectId }: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasStreamed, setHasStreamed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendToAssistant = useCallback(
    async (history: ChatMessage[]): Promise<void> => {
      setIsLoading(true);
      setHasStreamed(false);
      setError(null);
      setMessages(history);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
            projectId,
          } satisfies ChatRequestInput),
        });

        if (!response.ok) {
          // El chat exige sesion: se traduce a un mensaje accionable.
          if (response.status === 401) {
            throw new Error('Inicia sesión para usar el asistente RAG.');
          }

          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `El asistente ha fallado (HTTP ${response.status}).`);
        }

        const meta = readRagMeta(response.headers);

        if (!response.body) {
          throw new Error('El asistente no devolvió contenido.');
        }

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '', sources: meta.sources, mode: meta.mode },
        ]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          accumulated += decoder.decode(value, { stream: true });
          setHasStreamed(true);
          setMessages((prev) => updateLastMessage(prev, accumulated));
        }

        accumulated += decoder.decode();

        if (accumulated.trim() === '') {
          throw new Error('El asistente no generó texto. Revisa la clave de IA en el servidor.');
        }

        setMessages((prev) => updateLastMessage(prev, accumulated));
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'No se pudo contactar con el asistente.';

        setError(message);
        setMessages((prev) => removeEmptyAssistantMessages(prev));
      } finally {
        setIsLoading(false);
      }
    },
    [projectId],
  );

  /** Envia la ultima pregunta del usuario con el historial anterior. */
  const handleRetry = useCallback((): void => {
    if (isLoading) return;

    const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
    if (lastUserIndex < 0) return;

    void sendToAssistant(messages.slice(0, lastUserIndex + 1));
  }, [isLoading, messages, sendToAssistant]);

  /** Envia lo que hay en el input como nueva pregunta. */
  const handleSend = useCallback((): void => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    void sendToAssistant([...messages, { role: 'user', content: trimmed }]);
  }, [input, isLoading, messages, sendToAssistant]);

  const visibleMessages = messages.filter(
    (message) => message.role === 'user' || message.content.trim() !== '',
  );

  return (
    <aside className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col h-[600px]">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
          <h2 className="font-semibold text-sm">Asistente RAG del Proyecto</h2>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          {isLoading ? (hasStreamed ? 'Escribiendo' : 'Buscando') : 'Listo'}
        </span>
      </div>

      {/* Ventana de Chat */}
      <div
        className="flex-1 my-4 space-y-3 overflow-y-auto text-xs text-slate-300 pr-1"
        aria-live="polite"
      >
        {visibleMessages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={
              msg.role === 'user'
                ? 'bg-indigo-950/60 border border-indigo-900/50 p-3 rounded-lg ml-4'
                : 'bg-slate-800/60 p-3 rounded-lg'
            }
          >
            <p
              className={`font-semibold mb-1 ${
                msg.role === 'user' ? 'text-slate-300' : 'text-indigo-400'
              }`}
            >
              {msg.role === 'user' ? 'Tú:' : 'IA Bot:'}
            </p>
            <p className="whitespace-pre-wrap">{msg.content}</p>

            {msg.mode === 'context' && (
              <p className="mt-2 text-amber-400/90 border-t border-slate-700 pt-2">
                Modo contexto: no hay clave de IA configurada en el servidor, así que muestro el
                material indexado en lugar de una respuesta redactada.
              </p>
            )}

            {msg.sources && msg.sources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-700 pt-2">
                <span className="text-slate-500">Fuentes:</span>
                {msg.sources.map((source) => (
                  <span
                    key={`${source.type}-${source.id}`}
                    title={
                      typeof source.score === 'number'
                        ? `Similitud: ${Math.round(source.score * 100)}%`
                        : source.type
                    }
                    className="px-2 py-0.5 rounded-full bg-indigo-950/70 border border-indigo-900 text-indigo-300"
                  >
                    {source.title}
                    {typeof source.score === 'number'
                      ? ` · ${Math.round(source.score * 100)}%`
                      : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && !hasStreamed && (
          <div className="bg-slate-800/60 p-3 rounded-lg">
            <p className="font-semibold text-indigo-400 mb-1">IA Bot:</p>
            Buscando fuentes similares en PostgreSQL...
          </div>
        )}
      </div>

      {/* Error y reintento */}
      {error && (
        <div className="mb-3 flex items-start justify-between gap-3 p-3 rounded-lg bg-red-950/60 border border-red-900">
          <p className="text-xs text-red-300">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isLoading}
            className="shrink-0 bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Input del Chat */}
      <div className="pt-2 border-t border-slate-800">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            disabled={isLoading}
            placeholder="Pregunta a la IA sobre la doc..."
            aria-label="Pregunta para el asistente RAG"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || input.trim() === ''}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
          >
            {isLoading ? 'Pensando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </aside>
  );
}
