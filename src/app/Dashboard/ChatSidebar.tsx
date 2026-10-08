'use client';

import { Bot, Send } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import type { ChatRequestInput } from '@/lib/chat-schema';
import { readRagMeta, type RagResponseMeta, type RagSource } from '@/lib/rag-contract';
import { Skeleton } from '@/components/ui/Skeleton';

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
 * - estado de carga (busqueda vectorial) con un esqueleto, y de escritura
 *   (primer chunk),
 * - estado de error con boton de reintento,
 * - las fuentes citadas en las cabeceras `X-RAG-Sources`.
 *
 * En movil ocupa un bloque de ~70vh bajo el contenido; en escritorio pasa a
 * ser una columna fija de 640px gracias a `lg:h-[640px]`.
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
          // Envia las cookies de sesion: /api/chat devuelve 401 sin ellas.
          credentials: 'include',
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

          // Solo se parsea JSON si el servidor lo devolvio como tal: un
          // proxy o un 502 con HTML romperia response.json().
          const isJson = (response.headers.get('content-type') ?? '')
            .toLowerCase()
            .includes('application/json');
          const body = isJson
            ? ((await response.json().catch(() => null)) as { error?: string } | null)
            : null;

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

  const statusLabel = isLoading ? (hasStreamed ? 'Escribiendo' : 'Buscando') : 'Listo';

  return (
    <aside
      aria-label="Asistente RAG"
      className="flex h-[70vh] min-h-[420px] flex-col rounded-2xl border border-line bg-surface p-5 shadow-card lg:h-[640px]"
    >
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="gradient-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-card"
          >
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">Asistente RAG</h2>
            <p className="truncate text-xs text-muted">Gemini sobre PostgreSQL + pgvector</p>
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
            isLoading
              ? 'bg-accent-soft text-accent ring-accent/20'
              : 'bg-raised text-muted ring-line-strong/40'
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${isLoading ? 'animate-pulse bg-accent' : 'bg-ok'}`}
          />
          {statusLabel}
        </span>
      </div>

      {/* Ventana de Chat */}
      <div
        className="my-4 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"
        aria-live="polite"
      >
        {visibleMessages.map((msg, index) => {
          const isUser = msg.role === 'user';

          return (
            <div key={`${msg.role}-${index}`} className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
              {!isUser && (
                <span
                  aria-hidden="true"
                  className="gradient-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-card"
                >
                  <Bot className="h-3.5 w-3.5" />
                </span>
              )}

              <div
                className={
                  isUser
                    ? 'max-w-[85%] rounded-2xl rounded-tr-md bg-accent px-3.5 py-2.5 text-white shadow-card'
                    : 'max-w-[90%] rounded-2xl rounded-tl-md border border-line bg-raised px-3.5 py-2.5'
                }
              >
                <p
                  className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
                    isUser ? 'text-white/70' : 'text-accent'
                  }`}
                >
                  {isUser ? 'Tú' : 'Asistente'}
                </p>
                <p className="whitespace-pre-wrap text-xs leading-relaxed">{msg.content}</p>

                {msg.mode === 'context' && (
                  <p className="mt-2 border-t border-line pt-2 text-warn">
                    Modo contexto: no hay clave de IA configurada en el servidor, así que muestro el
                    material indexado en lugar de una respuesta redactada.
                  </p>
                )}

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
                    <span className="text-[11px] text-muted">Fuentes:</span>
                    {msg.sources.map((source) => (
                      <span
                        key={`${source.type}-${source.id}`}
                        title={
                          typeof source.score === 'number'
                            ? `Similitud: ${Math.round(source.score * 100)}%`
                            : source.type
                        }
                        className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent ring-1 ring-inset ring-accent/20"
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
            </div>
          );
        })}

        {/* Busqueda vectorial: esqueleto mientras no llega el primer chunk */}
        {isLoading && !hasStreamed && (
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className="gradient-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-card"
            >
              <Bot className="h-3.5 w-3.5" />
            </span>
            <div className="w-full space-y-2 rounded-2xl rounded-tl-md border border-line bg-raised px-3.5 py-2.5">
              <Skeleton className="h-3 w-11/12 rounded-md" />
              <Skeleton className="h-3 w-4/5 rounded-md" />
              <Skeleton className="h-3 w-2/3 rounded-md" />
              <p className="pt-1 text-[11px] text-muted">
                Buscando fuentes similares en PostgreSQL…
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error y reintento */}
      {error && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 p-3">
          <p className="text-xs text-danger">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isLoading}
            className="shrink-0 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Input del Chat */}
      <div className="border-t border-line pt-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Pregúntale al asistente…"
            aria-label="Pregunta para el asistente RAG"
            className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isLoading || input.trim() === ''}
            aria-label="Enviar pregunta"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2.5 text-xs font-medium text-white shadow-card transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{isLoading ? 'Pensando…' : 'Enviar'}</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
