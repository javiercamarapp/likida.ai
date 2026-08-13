import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { etiquetaConcepto } from '@/lib/likida/cuadre/engine';
import { GastoSemanalChart, CONCEPTO_LABEL, marcasEje, techoEje } from './gasto-semanal-chart';

// ═══════════════════════════════════════════════════════════════════════════
// TRES HALLAZGOS DEL PASE 5 QUE VIVEN EN ESTA GRÁFICA.
//
// [MEDIO] "Diésel" en el Resumen, "Combustible" en el PDF, en Combustible &
//   Casetas y en Políticas. Tres nombres para el mismo número, a un clic de
//   distancia. Y la cubeta `diesel` agrupa SIN `ocr_extra`, así que llamarla
//   "Diésel" afirma de un agregado algo que solo se puede decir por renglón:
//   el estímulo de IEPS es solo diésel (LIF 20-A fr. IV) y ahí puede haber
//   Magna.
//
// [MEDIO] "Gasto por categoría" desbordaba su columna en Mensual y en
//   Histórico. Con 500 px de pista y 27 px por cluster: 13 clusters piden 495
//   (no cabe ya a 1366) y 52 piden 2,016 (no cabe en ningún monitor). El
//   recorte del ancestro es `overflow-hidden`, no `auto`: lo que se sale NO se
//   recupera con scroll, desaparece.
//
// [BAJO] El eje de pesos mezclaba centavos y enteros: con `max = 37,412.55`
//   salía $37,412.55 / $28,059.41 / $18,706.28 / $9,353.14 / $0.
// ═══════════════════════════════════════════════════════════════════════════

const SERIES = [
  { nombre: 'diesel', valores: [1000, 2000] },
  { nombre: 'caseta', valores: [300, 400] },
  { nombre: 'otro', valores: [10, 20] },
];

describe('la leyenda dice lo MISMO que el resto del producto', () => {
  it('EL BUG: cada clave se etiqueta como la etiqueta del motor, que es la que usan el PDF y las otras pantallas', () => {
    // `etiquetaConcepto(c)` sin `ocr_extra` es exactamente el caso de esta
    // gráfica: agrega por concepto, sin el producto impreso en el ticket.
    for (const clave of Object.keys(CONCEPTO_LABEL)) {
      expect(CONCEPTO_LABEL[clave], `"${clave}" se lee distinto aquí que en el PDF`).toBe(etiquetaConcepto(clave));
    }
  });

  it('en concreto: la cubeta de combustible NO se llama "Diésel"', () => {
    // Es el renglón que costó el hallazgo, y el que tiene consecuencia fiscal.
    expect(CONCEPTO_LABEL.diesel).toBe('Combustible');
    expect(renderToStaticMarkup(<GastoSemanalChart categorias={['2026-S31', '2026-S32']} series={SERIES} />))
      .not.toContain('Diésel');
  });

  it('sigue cubriendo los 9 conceptos que el tipo permite', () => {
    const tipos = readFileSync('src/types/likida.ts', 'utf8');
    const i = tipos.indexOf('export type ConceptoGasto');
    const decl = tipos.slice(i, tipos.indexOf(';', i));
    const conceptos = [...decl.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(conceptos.length).toBeGreaterThan(3);
    for (const c of conceptos) expect(CONCEPTO_LABEL[c], `falta etiqueta para "${c}"`).toBeTruthy();
  });
});

describe('lo que no cabe se recorre, no se pierde', () => {
  const historico = Array.from({ length: 52 }, (_, i) => `2026-S${i + 1}`);
  const series52 = [{ nombre: 'diesel', valores: historico.map(() => 100) }];

  it('EL BUG: la pista de clusters vive en un contenedor con scroll horizontal', () => {
    const html = renderToStaticMarkup(<GastoSemanalChart categorias={historico} series={series52} />);
    expect(html, 'sin scroll, el ancestro recorta con `hidden` y el sobrante desaparece').toContain('overflow-x-auto');
  });

  it('y cada cluster conserva su ancho legible en vez de comprimirse a filo', () => {
    const html = renderToStaticMarkup(<GastoSemanalChart categorias={historico} series={series52} />);
    const m = html.match(/min-width:(\d+)px/);
    expect(m, 'la pista no reclama un ancho mínimo').not.toBeNull();
    // 52 clusters × (28 de rótulo + 12 de gap) = 2,080 px de pista.
    expect(Number(m![1])).toBeGreaterThanOrEqual(52 * 28);
  });

  it('las 52 semanas siguen en el DOM: ninguna se cae del render', () => {
    const html = renderToStaticMarkup(<GastoSemanalChart categorias={historico} series={series52} />);
    for (const c of ['2026-S1', '2026-S26', '2026-S52']) expect(html).toContain(c);
  });

  it('el tooltip no se ancla FUERA de la pista, que ahora recorta', () => {
    // `overflow-x: auto` fuerza `auto` también en el eje Y (CSS overflow §3),
    // así que un tooltip con `bottom-full` quedaría cortado por arriba.
    const html = renderToStaticMarkup(<GastoSemanalChart categorias={['2026-S32']} series={SERIES} />);
    expect(html).not.toContain('bottom-full');
  });
});

describe('el eje de pesos se lee como una escala, no como una lista de máximos', () => {
  it('EL BUG: con max = 37,412.55 las marcas son múltiplos redondos', () => {
    const marcas = marcasEje(37_412.55);
    expect(marcas).toEqual([40_000, 30_000, 20_000, 10_000, 0]);
  });

  it('ninguna marca arrastra centavos, así que el `.replace(".00")` acierta en todas', () => {
    for (const max of [37_412.55, 9.37, 1_234_567.89, 812.4, 55]) {
      for (const v of marcasEje(max)) {
        expect(Number.isInteger(v * 100), `${v} (max ${max})`).toBe(true);
        expect(v.toFixed(2).endsWith('.00'), `la marca ${v} de max ${max} trae centavos`).toBe(true);
      }
    }
  });

  it('el techo NUNCA queda por debajo del dato: la barra más alta cabe', () => {
    for (const max of [37_412.55, 1, 9.37, 250_000, 99_999]) {
      expect(techoEje(max), `techo de ${max}`).toBeGreaterThanOrEqual(max);
    }
  });

  it('las barras se escalan contra el TECHO, no contra el máximo crudo', () => {
    // Si el eje sube a 40,000 y la barra sigue midiéndose contra 37,412.55, la
    // barra más alta toca el borde superior mientras la marca dice otra cifra.
    const html = renderToStaticMarkup(
      <GastoSemanalChart categorias={['2026-S32']} series={[{ nombre: 'diesel', valores: [37_412.55] }]} />,
    );
    expect(html).not.toContain('height:100%;background:var(--g3)');
    expect(html).toContain('$40,000');
  });

  it('un max de cero no revienta (flota nueva, todavía sin gasto)', () => {
    expect(marcasEje(0)).toEqual([0]);
  });
});
