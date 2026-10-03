import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { messages, projectId } = await req.json();
    const lastMessage = messages[messages.length - 1]?.content;

    if (!lastMessage) {
      return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
    }

    // 1. Obtener chunks de documentación relevantes del proyecto (Búsqueda Vectorial / Contexto RAG)
    const documentChunks = await prisma.documentChunk.findMany({
      where: projectId ? { document: { projectId } } : {},
      take: 3,
      include: {
        document: true,
      },
    });

    const contextText = documentChunks
      .map((chunk) => `[Fuente: ${chunk.document.title}]\n${chunk.content}`)
      .join('\n\n');

    // 2. Formatear prompt con anclaje de contexto (Guardrail of Truth)
    const systemPrompt = `Eres el Asistente RAG oficial del proyecto en AI Project Hub.
Responde las preguntas utilizando EXCLUSIVAMENTE la siguiente documentación del proyecto.
Si la respuesta no se encuentra en el contexto, indícalo explícitamente.

Contexto del proyecto:
${contextText || 'No hay documentos subidos en este proyecto aún.'}`;

    // 3. Respuesta estructurada lista para Vercel AI SDK o llamada directa a Gemini/OpenAI
    return NextResponse.json({
      role: 'assistant',
      content: contextText
        ? `Basándome en los documentos indexados de tu proyecto:\n\n${contextText}`
        : 'Aún no has subido archivos PDF o Markdown a este proyecto para que el Asistente RAG los analice.',
      sources: documentChunks.map((c) => c.document.title),
    });
  } catch (error) {
    console.error('Error en RAG Chat API:', error);
    // TEMPORAL: diagnostico del 500 en produccion. Retirar tras identificar la causa.
    const err = error as { name?: string; message?: string; code?: string; meta?: unknown };
    return NextResponse.json(
      {
        error: 'Error interno en la API RAG',
        _diagnostico: {
          name: err?.name,
          message: err?.message,
          code: err?.code,
          meta: err?.meta,
          _entorno: {
            tieneDatabaseUrl: typeof process.env.DATABASE_URL,
            longitudDatabaseUrl: process.env.DATABASE_URL?.length ?? 0,
            prefijo: process.env.DATABASE_URL?.slice(0, 12),
            vercelEnv: process.env.VERCEL_ENV,
            esProduccion: process.env.NODE_ENV,
            clavesQueEmpiezanPorData: Object.keys(process.env).filter((k) =>
              k.toUpperCase().includes('DATABASE'),
            ),
          },
        },
      },
      { status: 500 },
    );
  }
}
