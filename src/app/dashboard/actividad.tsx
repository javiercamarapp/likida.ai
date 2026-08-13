import { BarChartSimple, AreaChartSimple } from '../admin/charts';
import { TZ_MX } from '@/lib/formato';

export type ModoPeriodo = 'semanal' | 'mensual' | 'historico';

/**
 * Qué día es HOY para una flota mexicana, como `YYYY-MM-DD`.
 *
 * AUDITORÍA 17 (pase 5), MEDIO — antes era `new Date()` + `setHours(0,0,0,0)`
 * (medianoche en la zona del PROCESO) y luego `toISOString()` (que vuelve a
 * UTC). En Vercel el proceso corre en UTC, así que entre las 18:00 y las 24:00
 * hora de México el "hoy" del gráfico ya era el día SIGUIENTE: la barra de hoy
 * quedaba corrida un día respecto de las cifras de arriba, que sí se agregan
 * con `TZ_MX` (`analytics.ts`). Es el mismo bug que `analytics_por_dia.test.ts`
 * documenta y que aquí no se había aplicado.
 */
export function hoyMx(ahora: Date = new Date()): string {
  // 'en-CA' da `YYYY-MM-DD`; el `timeZone` es lo que hace la conversión —
  // misma fórmula exacta que `analytics.ts` usa en sus nueve consultas.
  return ahora.toLocaleDateString('en-CA', { timeZone: TZ_MX });
}

/** El día `n` días antes de `iso`, en aritmética de calendario pura (UTC), sin
 *  volver a tocar la zona del proceso: `iso` ya es una fecha de México. */
function menosDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Últimos `dias` días como buckets — comparación de STRINGS, no de objetos
 * `Date`. `fechaInicio` es columna `date` (sin hora/zona horaria, ver
 * `analytics.ts`), así que convertirla a `Date` y de vuelta a ISO para
 * comparar es un rodeo que en el peor caso corre el bucket un día (el
 * mismo tipo de bug que ya se pagó con `created_at`, un timestamptz, en
 * `getLiquidacionesPorDia`). El único `Date` de esta función es el de HOY,
 * para generar los últimos N días — nunca se parsea `fechaInicio`.
 *
 * `hoy` se puede inyectar: así la prueba fija el día y no depende del reloj
 * (ni de la zona) de la máquina que la corre.
 */
export function bucketsPorDia(
  viajes: Array<{ fechaInicio: string | null }>, dias: number, hoy: string = hoyMx(),
): Array<{ dia: string; valor: number }> {
  const conteos = new Map<string, number>();
  for (const v of viajes) {
    if (!v.fechaInicio) continue;
    conteos.set(v.fechaInicio, (conteos.get(v.fechaInicio) ?? 0) + 1);
  }
  return Array.from({ length: dias }, (_, i) => {
    const iso = menosDias(hoy, dias - 1 - i);
    return { dia: iso, valor: conteos.get(iso) ?? 0 };
  });
}

/**
 * Reemplaza a `ActividadSemanal` — un solo recuadro con tres vistas en vez
 * de tres widgets sueltos (el Calendario de al lado se quitó, dirección del
 * 8-ago-2026: este recuadro ocupa ese espacio). Semana/Mes leen del MISMO
 * `viajes` que ya carga `page.tsx` (capado a 100 filas recientes — de sobra
 * para 7/30 días). Histórico NO reusa ese arreglo: un tope de 100 se
 * leería como "todo el histórico" en una flota que ya pasó esa cifra, así
 * que viaja aparte (`porMes`, `getViajesPorMes` — agregado real sin tope)
 * y se pinta como área/línea, el lenguaje visual de una serie larga
 * (estilo gráfica de acciones) en vez de barras.
 *
 * `modo` llega CONTROLADO desde `panel-periodo.tsx` (8-ago-2026, más
 * tarde) — el selector Semanal/Mensual/Histórico se unificó para mover
 * también Viajes/Gasto por categoría/Liquidado/Top rutas, así que este
 * componente ya no trae su propio pill ni su propio estado.
 */
export function Actividad({
  viajes, porMes, modo,
}: {
  /** `null` = la consulta se cayó. NO es lo mismo que `[]` (ver abajo). */
  viajes: Array<{ fechaInicio: string | null }> | null;
  /** `null` = la consulta se cayó. */
  porMes: Array<{ dia: string; valor: number }> | null;
  modo: ModoPeriodo;
}) {
  // AUDITORÍA 17 (pase 5), ALTO — "Aún no hay viajes registrados" es una
  // AFIRMACIÓN sobre el negocio del cliente y solo se puede hacer con la
  // consulta en la mano. El llamador (`page.tsx`) aplanaba el null a `[]` con
  // `?? []` y esta sección declaraba vacía una flota de 340 viajes, sin que la
  // banda de "faltan datos" se disparara (`estado.ts` no vigila esta consulta).
  const fuente = modo === 'historico' ? porMes : viajes;
  if (fuente === null) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        No se pudo cargar la actividad. La consulta falló — no es que no haya viajes.
      </p>
    );
  }

  const datosBarras = modo === 'semanal' ? bucketsPorDia(viajes ?? [], 7) : bucketsPorDia(viajes ?? [], 30);
  const sinDatos = modo === 'historico' ? porMes!.every((d) => d.valor === 0) : datosBarras.every((d) => d.valor === 0);

  if (sinDatos) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        {modo === 'historico' ? 'Aún no hay viajes registrados.' : 'Sin viajes iniciados en este periodo.'}
      </p>
    );
  }
  return modo === 'historico'
    ? <AreaChartSimple datos={porMes!} etiquetaValor={(v) => `${v} viaje${v === 1 ? '' : 's'}`} />
    : <BarChartSimple datos={datosBarras} etiquetaValor={(v) => `${v} viaje${v === 1 ? '' : 's'}`} alto={192} />;
}
