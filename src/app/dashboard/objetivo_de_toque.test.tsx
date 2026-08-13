import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KpiPeriodo } from './kpi-periodo';
import { MotorFiscalPeriodo } from './motor-fiscal-periodo';
import type { SeriesKpiCards } from '@/lib/likida/analytics';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — LAS FLECHAS DE PERIODO MEDÍAN 16 × 16 px Y
// IBAN A 2 px UNA DE OTRA.
//
// WCAG 2.5.8 (AA) pide 24 × 24 CSS px de objetivo de toque. En el Resumen hay
// SEIS pares de estas flechas (3 tarjetas de KPI + el motor fiscal), cada una
// de 16 px; y en `motor-fiscal-periodo` iban con `gap-0`, o sea el "‹" y el
// "›" compartiendo borde: el dedo que apunta a "periodo más corto" abre el
// más largo, y el contralor ve la cifra cambiar al revés de lo que pidió.
//
// Lo que crece es el ÁREA, no el dibujo: el chevron sigue en 12–13 px.
// ═══════════════════════════════════════════════════════════════════════════

const SERIES: SeriesKpiCards = {
  semanal: [
    { desde: '2026-08-06', hasta: '2026-08-12', gastoTotal: 18_400, totalViajes: 4, costoPorViaje: 4_600, liquidado: 1, viajesLiquidados: 1 },
    { desde: '2026-07-30', hasta: '2026-08-05', gastoTotal: 12_000, totalViajes: 3, costoPorViaje: 4_000, liquidado: 1, viajesLiquidados: 1 },
  ],
  mensual: [{ desde: '2026-07-14', hasta: '2026-08-12', gastoTotal: 1, totalViajes: 1, costoPorViaje: 1, liquidado: 1, viajesLiquidados: 1 }],
  historico: [{ desde: '2020-01-01', hasta: '2026-08-12', gastoTotal: 1, totalViajes: 1, costoPorViaje: 1, liquidado: 1, viajesLiquidados: 1 }],
};

/** Las clases de cada `<button>` del markup. */
function clasesDeBotones(html: string): string[] {
  return [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((m) => m[1]);
}

/** El `gap-*` del contenedor que envuelve al par de flechas. */
function gapDelPar(html: string): string {
  const i = html.lastIndexOf('<div', html.indexOf('<button'));
  const m = html.slice(i, html.indexOf('<button')).match(/gap-([\w.]+)/);
  return m ? m[1] : '';
}

describe('las flechas de periodo cumplen el objetivo de toque de 24 px', () => {
  it('EL BUG (tarjetas de KPI): ningún botón mide 16 px', () => {
    const html = renderToStaticMarkup(
      <KpiPeriodo icono={null} nombre="Gasto total" campo="gastoTotal" formato="mxn" subeEsBueno={false} series={SERIES} />,
    );
    const clases = clasesDeBotones(html);
    expect(clases.length, 'no se pintaron las dos flechas').toBe(2);
    for (const c of clases) {
      expect(c, 'w-4 h-4 son 16px: por debajo del mínimo de WCAG 2.5.8').not.toMatch(/\bw-4\b|\bh-4\b/);
      expect(c).toMatch(/\bw-6\b/);
      expect(c).toMatch(/\bh-6\b/);
    }
  });

  it('EL BUG (motor fiscal): mismo tamaño, y ya no comparten borde', () => {
    const html = renderToStaticMarkup(
      <MotorFiscalPeriodo series={{
        semanal: { montoPerdido: 1, montoEnRiesgo: 2, montoRecuperable: 3 },
        mensual: { montoPerdido: 1, montoEnRiesgo: 2, montoRecuperable: 3 },
        historico: { montoPerdido: 1, montoEnRiesgo: 2, montoRecuperable: 3 },
      }} />,
    );
    for (const c of clasesDeBotones(html)) {
      expect(c).toMatch(/\bw-6\b/);
      expect(c).toMatch(/\bh-6\b/);
    }
    expect(gapDelPar(html), 'las dos flechas iban pegadas (gap-0)').not.toBe('0');
    expect(gapDelPar(html)).toBeTruthy();
  });

  it('CONTROL: el ícono sigue chico — crece el área, no el dibujo', () => {
    const html = renderToStaticMarkup(
      <KpiPeriodo icono={null} nombre="Gasto total" campo="gastoTotal" formato="mxn" subeEsBueno={false} series={SERIES} />,
    );
    expect(html).toContain('width="13"');
  });

  it('CONTROL: las flechas siguen anunciándose a un lector de pantalla', () => {
    const html = renderToStaticMarkup(
      <KpiPeriodo icono={null} nombre="Gasto total" campo="gastoTotal" formato="mxn" subeEsBueno={false} series={SERIES} />,
    );
    expect(html).toContain('aria-label="Periodo más corto"');
    expect(html).toContain('aria-label="Periodo más largo"');
  });
});
