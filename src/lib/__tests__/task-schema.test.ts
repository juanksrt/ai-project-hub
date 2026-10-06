import { describe, expect, it } from 'vitest';

import {
  TASK_DESCRIPTION_MAX,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  createTaskSchema,
  toTaskFieldErrors,
} from '@/lib/task-schema';

const VALID_PAYLOAD = {
  title: 'Configurar pipeline RAG',
  description: 'Indexar la documentacion tecnica del proyecto.',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  projectId: 'cmh0000000000000000000000',
};

describe('createTaskSchema', () => {
  it('acepta un payload completo y valido', () => {
    const result = createTaskSchema.safeParse(VALID_PAYLOAD);

    expect(result.success).toBe(true);
    expect(result.data).toEqual(VALID_PAYLOAD);
  });

  it('acepta payload sin descripcion porque la columna es nullable', () => {
    const { description: _description, ...withoutDescription } = VALID_PAYLOAD;
    const result = createTaskSchema.safeParse(withoutDescription);

    expect(result.success).toBe(true);
    expect(result.data?.description).toBeUndefined();
  });

  it('normaliza la descripcion vacia a undefined en vez de guardar ""', () => {
    const result = createTaskSchema.safeParse({ ...VALID_PAYLOAD, description: '   ' });

    expect(result.success).toBe(true);
    expect(result.data?.description).toBeUndefined();
  });

  it('recorta los espacios sobrantes del titulo', () => {
    const result = createTaskSchema.safeParse({ ...VALID_PAYLOAD, title: '  Limpiar  ' });

    expect(result.success).toBe(true);
    expect(result.data?.title).toBe('Limpiar');
  });

  it('rechaza un titulo vacio o solo espacios', () => {
    const result = createTaskSchema.safeParse({ ...VALID_PAYLOAD, title: '   ' });

    expect(result.success).toBe(false);
  });

  it('rechaza un titulo mas largo que el limite permitido', () => {
    const longTitle = 'a'.repeat(TASK_TITLE_MAX + 1);
    const result = createTaskSchema.safeParse({ ...VALID_PAYLOAD, title: longTitle });

    expect(result.success).toBe(false);
  });

  it('rechaza una descripcion mas larga que el limite permitido', () => {
    const longDescription = 'a'.repeat(TASK_DESCRIPTION_MAX + 1);
    const result = createTaskSchema.safeParse({
      ...VALID_PAYLOAD,
      description: longDescription,
    });

    expect(result.success).toBe(false);
  });

  it('rechaza estados fuera del enum de Prisma', () => {
    const result = createTaskSchema.safeParse({ ...VALID_PAYLOAD, status: 'IN_REVISION' });

    expect(result.success).toBe(false);
  });

  it('rechaza prioridades fuera del enum de Prisma', () => {
    const result = createTaskSchema.safeParse({ ...VALID_PAYLOAD, priority: 'URGENT' });

    expect(result.success).toBe(false);
  });

  it('rechaza un payload sin proyecto', () => {
    const { projectId: _projectId, ...withoutProject } = VALID_PAYLOAD;
    const result = createTaskSchema.safeParse(withoutProject);

    expect(result.success).toBe(false);
  });

  it('rechaza un payload sin titulo', () => {
    const { title: _title, ...withoutTitle } = VALID_PAYLOAD;
    const result = createTaskSchema.safeParse(withoutTitle);

    expect(result.success).toBe(false);
  });

  it('cubre exactamente los estados y prioridades del esquema de Prisma', () => {
    expect(TASK_PRIORITIES).toEqual(['LOW', 'MEDIUM', 'HIGH']);
    expect(TASK_STATUSES).toEqual(['PENDING', 'IN_PROGRESS', 'COMPLETED']);
  });
});

describe('toTaskFieldErrors', () => {
  it('agrupa los mensajes por nombre de campo', () => {
    const result = createTaskSchema.safeParse({ ...VALID_PAYLOAD, status: 'OTRO' });

    expect(result.success).toBe(false);

    const fieldErrors = toTaskFieldErrors(
      result.success ? [] : result.error.issues,
    );

    expect(fieldErrors.status).toHaveLength(1);
    expect(typeof fieldErrors.status?.[0]).toBe('string');
  });

  it('acumula varios mensajes para el mismo campo', () => {
    const fieldErrors = toTaskFieldErrors([
      { path: ['title'], message: 'requerido' },
      { path: ['title'], message: 'demasiado largo' },
    ]);

    expect(fieldErrors.title).toEqual(['requerido', 'demasiado largo']);
  });

  it('no pierde los errores sin campo bajo la clave _root', () => {
    const fieldErrors = toTaskFieldErrors([{ path: [], message: 'error general' }]);

    expect(fieldErrors._root).toEqual(['error general']);
  });

  it('devuelve un objeto vacio cuando no hay issues', () => {
    expect(toTaskFieldErrors([])).toEqual({});
  });
});
