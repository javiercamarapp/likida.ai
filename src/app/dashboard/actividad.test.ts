import { describe, it, expect } from 'vitest';
import { bucketsPorDia, hoyMx } from './actividad';

// ═══════════════════════════════════════════════════════════════════════════
// `bucketsPorDia` es la única lógica nueva y no probada de `actividad.tsx`
// (BarChartSimple/AreaChartSimple ya se prueban donde viven). Lo que hay que
// comprobar: cuenta por STRING, no por `Date` — `fechaInicio` es columna
// `date` (sin hora), y convertirla a `Date` y de vuelta a ISO corre el riesgo
// del mismo bug que ya se pagó con `created_at` en `getLiquidacionesPorDia`
// (un timestamptz que fechaba el día siguiente).
// ═══════════════════════════════════════════════════════════════════════════

// AUDITORÍA 17 (pase 5), MEDIO — EL DÍA ES EL DE MÉXICO, NO EL DEL PROCESO.
//
// Estas dos ayudantes usaban medianoche LOCAL (`setHours(0,0,0,0)`), que es
// medianoche de la máquina que corre la prueba, no de la flota. En Vercel el
// proceso corre en UTC: entre las 18:00 y las 24:00 hora de México el "hoy"
// local ya es el día siguiente, y la barra de hoy quedaba corrida un día
// respecto de las cifras de arriba (que sí se agregan con `TZ_MX`, ver
// `analytics.ts`). Esta misma prueba lo destapó al correr a las 00:20 UTC:
// esperaba 2026-08-13 cuando en México todavía era 12.
const hoyIso = () => hoyMx();
const haceNDiasIso = (n: number) =>
  new Date(Date.parse(`${hoyMx()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

describe('bucketsPorDia', () => {
  it('devuelve exactamente `dias` buckets, terminando en hoy', () => {
    const buckets = bucketsPorDia([], 7);
    expect(buckets).toHaveLength(7);
    expect(buckets[6].dia).toBe(hoyIso());
    expect(buckets[0].dia).toBe(haceNDiasIso(6));
  });

  it('cuenta un viaje de hoy en el último bucket', () => {
    const buckets = bucketsPorDia([{ fechaInicio: hoyIso() }], 7);
    expect(buckets[6].valor).toBe(1);
    expect(buckets.slice(0, 6).every((b) => b.valor === 0)).toBe(true);
  });

  it('varios viajes el mismo día se suman en el mismo bucket', () => {
    const dia = haceNDiasIso(2);
    const buckets = bucketsPorDia(
      [{ fechaInicio: dia }, { fechaInicio: dia }, { fechaInicio: dia }],
      7,
    );
    const bucket = buckets.find((b) => b.dia === dia);
    expect(bucket?.valor).toBe(3);
  });

  it('un viaje fuera de la ventana no se cuenta', () => {
    const fueraDeRango = haceNDiasIso(30);
    const buckets = bucketsPorDia([{ fechaInicio: fueraDeRango }], 7);
    expect(buckets.every((b) => b.valor === 0)).toBe(true);
  });

  it('fechaInicio null se ignora, no revienta', () => {
    const buckets = bucketsPorDia([{ fechaInicio: null }, { fechaInicio: hoyIso() }], 7);
    expect(buckets[6].valor).toBe(1);
  });

  it('ventana de 30 días también cierra en hoy', () => {
    const buckets = bucketsPorDia([], 30);
    expect(buckets).toHaveLength(30);
    expect(buckets[29].dia).toBe(hoyIso());
    expect(buckets[0].dia).toBe(haceNDiasIso(29));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — "ACTIVIDAD" BUCKETEABA CON LA ZONA HORARIA
// DEL PROCESO.
//
// El escenario con valores: son las 20:00 del 12-ago en Monterrey. En Vercel
// (UTC) eso son las 02:00 del 13-ago. `new Date()` + `setHours(0,0,0,0)` +
// `toISOString()` daba '2026-08-13', así que la última barra del gráfico de
// 7 días era MAÑANA y el viaje que el operador acababa de iniciar caía en un
// bucket que el contralor no ve. Las cifras de arriba, en cambio, se agregan
// con `TZ_MX` (`analytics.ts`): dos "hoy" distintos en la misma pantalla.
//
// El instante se inyecta en vez de tocar `process.env.TZ`: así la prueba mide
// la conversión y no depende de en qué zona corra el CI.
// ═══════════════════════════════════════════════════════════════════════════
describe('hoyMx — el día de la flota, no el del servidor', () => {
  it('EL BUG: 02:00 UTC del 13 es todavía el 12 en México', () => {
    expect(hoyMx(new Date('2026-08-13T02:00:00Z'))).toBe('2026-08-12');
  });

  it('a las 06:00 UTC ya cambió el día en México (medianoche de allá, CST)', () => {
    expect(hoyMx(new Date('2026-08-13T06:00:00Z'))).toBe('2026-08-13');
  });

  it('el bucket de hoy es el de México, y la ventana termina ahí', () => {
    const buckets = bucketsPorDia(
      [{ fechaInicio: '2026-08-12' }], 7, hoyMx(new Date('2026-08-13T02:00:00Z')),
    );
    expect(buckets[6].dia).toBe('2026-08-12');
    expect(buckets[6].valor, 'el viaje de hoy cayó fuera de la ventana').toBe(1);
    expect(buckets[0].dia).toBe('2026-08-06');
  });
});
