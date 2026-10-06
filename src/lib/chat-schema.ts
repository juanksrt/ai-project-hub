/**
 * Esquema de validacion (Zod) para `POST /api/chat`.
 *
 * Es el contrato unico de la peticion de chat: lo consumen la ruta API en el
 * servidor y el Chat del Dashboard en el cliente. El cliente solo recibe un
 * `error` generico (a diferencia de las tareas, no hay un formulario con campos
 * que marcar), por lo que no hace falta mapear errores por campo.
 *
 * Los roles son un espejo de `ChatRole` en `src/lib/rag-contract.ts`.
 */
import { z } from 'zod';

/** Roles admitidos en el historial de la conversacion. */
export const CHAT_MESSAGE_ROLES = ['user', 'assistant'] as const;

/** Numero maximo de mensajes que acepta una peticion. */
export const CHAT_MAX_MESSAGES = 20;

/** Longitud maxima de cada mensaje del historial. */
export const CHAT_MESSAGE_MAX = 4000;

/** Un mensaje del historial de conversacion. */
export const chatMessageSchema = z.object({
  role: z.enum(CHAT_MESSAGE_ROLES, { error: 'Rol de mensaje no valido' }),
  content: z
    .string()
    .trim()
    .min(1, 'El mensaje no puede estar vacio')
    .max(CHAT_MESSAGE_MAX, `El mensaje no puede superar ${CHAT_MESSAGE_MAX} caracteres`),
});

/**
 * Contrato de entrada del chat.
 *
 * - `messages`: obligatorio, de 1 a 20 mensajes; la ultima posicion es la
 *   pregunta que se usa para la busqueda vectorial.
 * - `projectId`: opcional; si llega, la busqueda de similitud se restringe a
 *   ese proyecto.
 */
export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1, 'Se necesita al menos un mensaje')
    .max(CHAT_MAX_MESSAGES, `Se aceptan como maximo ${CHAT_MAX_MESSAGES} mensajes`),
  projectId: z.string().trim().min(1, 'projectId invalido').optional(),
});

/** Payload ya validado y normalizado que recibe la ruta API. */
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

/** Mensaje ya validado del historial. */
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
