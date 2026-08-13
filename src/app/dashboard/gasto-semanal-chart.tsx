import { mxn } from '@/lib/formato';

/** Un color distinto por serie, mismo ramp naranja que el resto del
 *  Resumen (`DEGRADADO_MARCA`) — no un color por categoría inventado: son
 *  las mismas tres paradas de `--g3`/`--g4`/`--marca` que ya usa el
 *  degradado, para que esta gráfica se sienta de la misma familia visual. */
const COLOR_SERIE = ['var(--g3)', 'var(--g4)', 'var(--marca)'];

/**
 * Cómo se llama cada cubeta de gasto en la leyenda y el tooltip.
 *
 * AUDITORÍA 17 (pase 5), MEDIO — decía `diesel: 'Diésel'`, `caseta: 'Casetas'`
 * y `otro: 'Otros'`, y esas mismas cubetas se llaman 'Combustible', 'Caseta' y
 * 'Otro' en Combustible & Casetas, en Políticas y en el PDF. Tres nombres, un
 * número: el contralor veía "Diésel · $412,800" en el Resumen y "Combustible ·
 * $412,800" a un clic de distancia.
 *
 * Peor en la dirección fiscal: `etiquetaConcepto` se salta el mapa para
 * combustible precisamente porque el estímulo de IEPS es SOLO diésel (LIF 20-A
 * fr. IV), y esta gráfica agrupa por `concepto` SIN `ocr_extra` — así que
 * rotular "Diésel" esta cubeta afirma de un agregado algo que solo se puede
 * decir renglón por renglón: puede traer Magna. "Combustible" es cierto
 * siempre, que es exactamente lo que `etiquetaConcepto(c)` sin producto
 * devuelve.
 *
 * Se queda como mapa literal y NO se llama a `etiquetaConcepto` en el
 * componente: este archivo cuelga de `panel-periodo.tsx`, que es `'use
 * client'`, y esa función vive en `cuadre/engine.ts` (86 KB + `NORMAS`) — un
 * import así se lleva el motor entero al bundle del navegador por una
 * etiqueta. Lo que impide que se vuelvan a separar es
 * `etiquetas_grafica.test.ts`, que compara este mapa contra la salida REAL de
 * `etiquetaConcepto` en tiempo de prueba.
 */
export const CONCEPTO_LABEL: Record<string, string> = {
  diesel: 'Combustible', caseta: 'Caseta', viaticos: 'Viáticos',
  factura: 'Factura', alimentacion: 'Alimentación', hospedaje: 'Hospedaje',
  transporte: 'Transporte', flete: 'Flete', otro: 'Otro',
};

/** Ancho mínimo legible de un cluster (una semana/mes): el rótulo "2026-S32"
 *  a `text-[11px]` mide ≈27 px. Por debajo de esto las barras se comprimen a
 *  filo y el rótulo se encima con el vecino. */
const ANCHO_MIN_CLUSTER = 28;
/** El `gap-3` de la pista, en px — entra en el cálculo del ancho mínimo. */
const GAP_CLUSTER = 12;

/**
 * Marcas de eje Y en un múltiplo LEGIBLE.
 *
 * AUDITORÍA 17 (pase 5), BAJO — repartía `max` en cuartos exactos, así que con
 * `max = 37,412.55` el eje salía `$37,412.55 / $28,059.41 / $18,706.28 /
 * $9,353.14 / $0`: cuatro decimales distintos, y solo el cero perdía los
 * centavos porque el `.replace('.00','')` únicamente acierta cuando la cifra
 * ya era redonda. Un eje no es la lista de los máximos: es una escala.
 *
 * El paso se redondea hacia arriba al siguiente 1/2/2.5/5 × 10ⁿ (la escala
 * "nice numbers" de siempre), y el techo resultante manda también sobre la
 * altura de las barras — si el eje subiera y las barras no, la barra más alta
 * tocaría el borde superior mientras la marca de arriba dice otra cifra.
 *
 * El 2.5 se descarta cuando daría un paso con centavos (2.5 pesos): el eje se
 * imprime con `mxn(v).replace('.00','')`, así que un paso de $2.50 devuelve la
 * mezcla que este arreglo vino a quitar — $2.50 al lado de $5. Con pasos
 * enteros, o todas las marcas pierden los centavos o ninguna.
 */
export function marcasEje(max: number, divisiones = 4): number[] {
  if (!(max > 0)) return [0];
  const crudo = max / divisiones;
  const exp = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10]
    .map((m) => m * exp)
    .filter((p) => p < 1 || Number.isInteger(p))
    .find((p) => p >= crudo - 1e-9) ?? exp * 10;
  return Array.from({ length: divisiones + 1 }, (_, i) => Number((paso * i).toFixed(2))).reverse();
}

/** El techo del eje — la marca más alta. Las barras se escalan contra esto y
 *  no contra el máximo crudo de los datos, para que la escala no mienta. */
export function techoEje(max: number): number {
  return marcasEje(max)[0];
}

/**
 * Barras agrupadas (NO apiladas) por semana × categoría, con tooltip al
 * :hover — capturas de referencia de Javier (8-ago-2026). Divs con
 * `height` en %, no SVG: un `<svg>` con `preserveAspectRatio="none"`
 * distorsiona las esquinas redondeadas al estirarse a un ancho real (mismo
 * problema ya documentado en `BarChartSimple`, `admin/charts.tsx`) — los
 * divs no tienen ese punto de falla.
 */
export function GastoSemanalChart({ categorias, series }: { categorias: string[]; series: Array<{ nombre: string; valores: number[] }> }) {
  const max = Math.max(...series.flatMap((s) => s.valores), 1);
  const ejeY = marcasEje(max);
  const techo = ejeY[0] || 1;
  const ALTO = 200;

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-3">
        {series.map((s, i) => (
          <div key={s.nombre} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLOR_SERIE[i % COLOR_SERIE.length] }} />
            {CONCEPTO_LABEL[s.nombre] ?? s.nombre}
          </div>
        ))}
      </div>
      <div className="flex gap-2" style={{ height: ALTO }}>
        <div className="flex flex-col justify-between text-right shrink-0 pb-5" style={{ width: 44 }}>
          {ejeY.map((v, i) => (
            <span key={i} className="text-[10px] leading-none" style={{ color: 'var(--faint)' }}>{mxn(v).replace('.00', '')}</span>
          ))}
        </div>
        {/* AUDITORÍA 17 (pase 5), MEDIO — LA PISTA SE DESBORDABA Y EL SOBRANTE
            DESAPARECÍA. La fila de clusters no tenía ni `min-w-0` ni scroll, y
            el ancestro que recorta (`page.tsx`, `glass-panel overflow-hidden`)
            recorta con `hidden`, no con `auto`: en Mensual (13 clusters, mínimo
            495 px) ya no cabía a 1366, y en Histórico (52 clusters, 2,016 px)
            no cabe en ningún monitor — más de la mitad del año se perdía sin
            que nada lo indicara. Con el scroll AQUÍ, el eje Y se queda fijo y
            lo que no cabe se recorre. */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="relative h-full flex items-end gap-3 border-l border-b"
            style={{ borderColor: 'var(--line)', minWidth: categorias.length * (ANCHO_MIN_CLUSTER + GAP_CLUSTER) }}>
            {/* Gridlines horizontales — hairline de 1px, mismo criterio que AreaChartSimple. */}
            {ejeY.slice(1).map((_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t" style={{ borderColor: 'var(--line)', bottom: `${((i + 1) / (ejeY.length - 1)) * 100}%`, opacity: 0.6 }} />
            ))}
            {categorias.map((cat, ci) => (
              <div key={cat} className="relative flex-1 h-full flex flex-col justify-end items-center group cursor-default z-10">
                <div className="flex items-end gap-[3px] w-full justify-center" style={{ height: '100%' }}>
                  {series.map((s, si) => (
                    <div key={s.nombre} className="w-full max-w-[14px] rounded-t-[3px]" style={{
                      height: `${Math.max(s.valores[ci] > 0 ? 2 : 0, (s.valores[ci] / techo) * 100)}%`,
                      background: COLOR_SERIE[si % COLOR_SERIE.length],
                      transition: `height 480ms cubic-bezier(.22,1,.36,1) ${ci * 60}ms`,
                    }} />
                  ))}
                </div>
                <span className="text-[11px] mt-2" style={{ color: 'var(--muted)' }}>{cat}</span>
                {/* Tooltip oscuro, mismo lenguaje que AreaChartSimple — aparece
                    al :hover del cluster completo, no de cada barra suelta.
                    Va anclado ARRIBA DENTRO de la pista (`top-0`) y no
                    `bottom-full`: el contenedor de scroll de arriba recorta por
                    su caja (un `overflow-x: auto` fuerza `auto` también en Y),
                    así que un tooltip que sale por encima quedaría cortado. */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20"
                  style={{ background: 'var(--ink)' }}>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--surface)' }}>{cat}</div>
                  {series.map((s, si) => (
                    <div key={s.nombre} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--surface)' }}>
                      <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: COLOR_SERIE[si % COLOR_SERIE.length] }} />
                      <span className="opacity-80">{CONCEPTO_LABEL[s.nombre] ?? s.nombre}</span>
                      <span className="font-semibold ml-auto">{mxn(s.valores[ci])}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
