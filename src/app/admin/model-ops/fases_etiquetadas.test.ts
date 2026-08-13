import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — `/admin/model-ops` ROTULABA 3 DE LAS 6 FASES.
//
// `FASE_LABEL` cubría `ocr`, `cuadre` y `whatsapp`; `FaseCosto`
// (`lib/likida/costos.ts`) tiene seis. La dona de "Costo por fase" lee
// `r.porFase`, que trae lo que de VERDAD se gastó, así que un gasto de
// `escalacion` caía al `?? f.fase` y se etiquetaba `escalacion` —minúscula y
// crudo— junto a "Agente de Cuadre". Las otras tres copias del mapa
// (`admin/page.tsx`, `admin/analitica`, `admin/costos-facturacion`) sí cubren
// las seis: la misma fase se leía distinto en dos pantallas de la misma
// consola.
//
// La prueba lee el TIPO de la fuente, no una lista copiada aquí: si mañana
// aparece una séptima fase, esto se pone rojo en vez de esperar a que alguien
// vea una clave cruda en una dona. (El `Record<FaseCosto,…>` ya lo caza en
// `tsc` para esta copia; esto cubre además que las cuatro copias coincidan.)
// ═══════════════════════════════════════════════════════════════════════════

const COSTOS = readFileSync('src/lib/likida/costos.ts', 'utf8');

/** Los valores del union `FaseCosto`. */
function fases(): string[] {
  const i = COSTOS.indexOf('export type FaseCosto');
  expect(i, 'ya no existe el tipo FaseCosto').toBeGreaterThan(-1);
  const decl = COSTOS.slice(i, COSTOS.indexOf(';', i));
  const out = [...decl.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  expect(out.length, 'no se pudo leer FaseCosto').toBeGreaterThan(3);
  return out;
}

/** El mapa `FASE_LABEL` de un fuente, sea `Record<string,…>` o `Record<FaseCosto,…>`. */
function mapa(ruta: string): Record<string, string> {
  const src = readFileSync(ruta, 'utf8');
  const i = src.indexOf('const FASE_LABEL');
  expect(i, `${ruta} ya no declara FASE_LABEL`).toBeGreaterThan(-1);
  const bloque = src.slice(i, src.indexOf('};', i));
  const out: Record<string, string> = {};
  for (const m of bloque.matchAll(/(\w+):\s*'([^']*)'/g)) out[m[1]] = m[2];
  return out;
}

const COPIAS = [
  'src/app/admin/model-ops/page.tsx',
  'src/app/admin/page.tsx',
  'src/app/admin/analitica/page.tsx',
  'src/app/admin/costos-facturacion/page.tsx',
];

describe('las seis fases del pipeline tienen nombre en las cuatro pantallas', () => {
  it.each(COPIAS)('EL BUG: %s cubre las 6 de FaseCosto', (ruta) => {
    const m = mapa(ruta);
    for (const f of fases()) {
      expect(m[f], `falta etiqueta para la fase "${f}" — sale cruda en la gráfica`).toBeTruthy();
    }
  });

  it('y las cuatro dicen exactamente lo mismo de cada fase', () => {
    const [referencia, ...resto] = COPIAS.map(mapa);
    for (const [i, otra] of resto.entries()) {
      for (const f of fases()) {
        expect(otra[f], `"${f}" se lee distinto en ${COPIAS[i + 1]}`).toBe(referencia[f]);
      }
    }
  });

  it('el mapa de model-ops está atado al TIPO, no a `string`', () => {
    // Con `Record<FaseCosto, string>` una fase nueva rompe la compilación en
    // vez de aparecer en minúscula dentro de una dona.
    const src = readFileSync('src/app/admin/model-ops/page.tsx', 'utf8');
    expect(src).toMatch(/const FASE_LABEL: Record<FaseCosto, string>/);
  });
});
