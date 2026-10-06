import { describe, expect, it } from 'vitest';

import { Badge, PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Los componentes del sistema de diseno no llevan hooks ni efectos, asi que se
 * invocan como funciones: se comprueba el arbol devuelto sin necesidad de un
 * entorno DOM (el mismo truco que `app.test.tsx` con las paginas).
 */
describe('Badge', () => {
  it('pinta el texto con las clases del tono pedido', () => {
    const arbol = Badge({ tone: 'ok', children: 'Listo' });

    expect(arbol.type).toBe('span');
    expect(arbol.props.children).toBe('Listo');
    expect(arbol.props.className).toContain('bg-ok/10');
  });

  it('usa tono neutro por defecto', () => {
    const arbol = Badge({ children: 'x' });

    expect(arbol.props.className).toContain('bg-raised');
  });
});

describe('StatusBadge', () => {
  it('traduce y colorea los estados del esquema', () => {
    const completada = StatusBadge({ value: 'COMPLETED' });
    const enCurso = StatusBadge({ value: 'IN_PROGRESS' });
    const archivado = StatusBadge({ value: 'ARCHIVED' });

    expect(completada.props.children).toBe('Completada');
    expect(completada.props.tone).toBe('ok');

    expect(enCurso.props.children).toBe('En curso');
    expect(enCurso.props.tone).toBe('warn');

    expect(archivado.props.children).toBe('Archivado');
    expect(archivado.props.tone).toBe('neutral');
  });

  it('no rompe con un estado desconocido', () => {
    const arbol = StatusBadge({ value: 'FUTURO' });

    expect(arbol.props.children).toBe('FUTURO');
    expect(arbol.props.tone).toBe('neutral');
  });
});

describe('PriorityBadge', () => {
  it('traduce y colorea las prioridades', () => {
    expect(PriorityBadge({ value: 'LOW' }).props.children).toBe('Baja');
    expect(PriorityBadge({ value: 'MEDIUM' }).props.children).toBe('Media');
    expect(PriorityBadge({ value: 'HIGH' }).props.children).toBe('Alta');

    expect(PriorityBadge({ value: 'HIGH' }).props.tone).toBe('danger');
  });
});

describe('Skeleton', () => {
  it('se oculta a los lectores de pantalla y acepta clases de tamano', () => {
    const arbol = Skeleton({ className: 'h-4 w-40' });

    expect(arbol.type).toBe('span');
    // React normaliza `aria-hidden={true}` a la cadena "true" al crear el
    // elemento; se compara como texto para que el test no dependa de eso.
    expect(String(arbol.props['aria-hidden'])).toBe('true');
    expect(arbol.props.className).toContain('skeleton');
    expect(arbol.props.className).toContain('h-4 w-40');
  });
});
