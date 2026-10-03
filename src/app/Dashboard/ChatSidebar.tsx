'use client';

import React, { useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatSidebar() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Hola, soy el asistente de AI Project Hub. Puedo consultar los manuales y código del proyecto sin alucinar. ¿En qué puedo ayudarte?',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (): Promise<void> => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      const data: { role: string; content: string; error?: string } = await response.json();

      const aiContent = data.error
        ? `Error: ${data.error}`
        : data.content ?? 'No recibí una respuesta válida.';

      setMessages((prev) => [...prev, { role: 'assistant', content: aiContent }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Hubo un problema al contactar con el asistente.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col h-[600px]">
      <div className="flex items-center space-x-2 pb-4 border-b border-slate-800">
        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
        <h2 className="font-semibold text-sm">Asistente RAG del Proyecto</h2>
      </div>

      {/* Ventana de Chat */}
      <div className="flex-1 my-4 space-y-3 overflow-y-auto text-xs text-slate-300 pr-1">
        {messages.map((msg, index) => (
          <div
            key={index}
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
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="bg-slate-800/60 p-3 rounded-lg">
            <p className="font-semibold text-indigo-400 mb-1">IA Bot:</p>
            Pensando...
          </div>
        )}
      </div>

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
            placeholder="Pregunta a la IA sobre la doc..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-medium transition"
          >
            {isLoading ? 'Pensando...' : 'Enviar'}
          </button>
        </div>
      </div>
    </aside>
  );
}
