import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KpiPeriodo } from './kpi-periodo';
import type { ComparativoPeriodo, SeriesKpiCards } from '@/lib/likida/analytics';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 2), ALTO — EL CERO QUE SE LEE COMO MEDICIÓN.
//
// `analytics.ts:58-61` modela `costoPorViaje` como `number | null` y deja
// escrito POR QUÉ, con estas palabras:
//
//     `null` sin viajes en el periodo — dividir entre cero daría Infinity, y
//     "$0/viaje" se leería como que salió gratis, no como que no hay con qué
//     medir.
//
// El único consumidor lo aplanaba a cero (`kpi-periodo.tsx:67`,
// `valor={valorActual ?? 0}`) y pintaba exactamente la cadena que ese
// comentario prohíbe: "Costo por viaje — últimos 7 días · $0.00", al lado de
// "Gasto total $18,400". El contralor lee que movió carga sin que le costara.
//
// Es la primera regla del CLAUDE.md ("nunca inventar una cifra… ni ceros que
// parezcan medición") y el producto ya la resuelve en otro lado:
// `cifra-grande.tsx:57-60` pinta '—' sin dato, por este mismo motivo.
//
// Tres auditores independientes de esta ronda cayeron en la misma línea
// (frontend, arquitectura, y una mutación de la corrida de pruebas).
// ═══════════════════════════════════════════════════════════════════════════

const periodo = (o: Partial<ComparativoPeriodo> = {}): ComparativoPeriodo => ({
  desde: '2026-08-02', hasta: '2026-08-08',
  gastoTotal: 18_400, totalViajes: 0, costoPorViaje: null,
  liquidado: 0, viajesLiquidados: 0,
  ...o,
});

const series = (actual: ComparativoPeriodo, anterior?: ComparativoPeriodo): SeriesKpiCards => ({
  semanal: anterior ? [actual, anterior] : [actual],
  mensual: anterior ? [actual, anterior] : [actual],
  historico: [actual],
});

// NOTA (merge del 13-ago, ronda 18): el bloque unitario que probaba
// `KpiDegradado` directamente se cayó con el componente — la dirección v3
// de `master` borró `KpiDegradado` de `resumen-visual.tsx` y `KpiPeriodo`
// ahora pinta con `StatCard`. La prueba DE PUNTA A PUNTA de abajo es la que
// ancla el bug, y es la que importa: no depende de qué componente pinte.

describe('KpiPeriodo — la tarjeta del Resumen del dueño', () => {
  it('EL BUG, de punta a punta: "Costo por viaje" con 0 viajes en el periodo no dice $0.00', () => {
    const html = renderToStaticMarkup(
      <KpiPeriodo
        icono={null} nombre="Costo por viaje" campo="costoPorViaje"
        formato="mxn" subeEsBueno={false}
        series={series(periodo({ totalViajes: 0, costoPorViaje: null }))}
      />,
    );
    expect(html).not.toContain('$0.00');
    expect(html).toContain('—');
  });

  it('CONTROL: con viajes en el periodo la tarjeta imprime el costo real', () => {
    const html = renderToStaticMarkup(
      <KpiPeriodo
        icono={null} nombre="Costo por viaje" campo="costoPorViaje"
        formato="mxn" subeEsBueno={false}
        series={series(periodo({ totalViajes: 4, costoPorViaje: 4_600 }))}
      />,
    );
    expect(html).toContain('4,600');
  });

  it('CONTROL: los otros tres campos, que nunca son null, siguen igual', () => {
    const html = renderToStaticMarkup(
      <KpiPeriodo
        icono={null} nombre="Gasto total" campo="gastoTotal"
        formato="mxn" subeEsBueno={false}
        series={series(periodo({ gastoTotal: 18_400 }))}
      />,
    );
    expect(html).toContain('18,400');
  });
});
