// ═══════════════════════════════════════════════════════════════════════════
// LA SECCIÓN "ACREDITABLE / RECUPERABLE", EN RENGLONES LISTOS PARA IMPRIMIR.
//
// Es la sección que vende, y por eso es la que más se puede sobrepromever. Vive
// aquí y no dentro del dibujado del PDF por la misma razón que
// `filasDeducibilidad`: lo que el contralor lee tiene que poder probarse sin
// abrir un PDF.
//
// LA REGLA DE ESTA SECCIÓN: una cifra en el papel con un artículo citado al
// lado es una AFIRMACIÓN. Si el motor no puede sostenerla entera, el renglón
// tiene que decir qué parte no sostiene — en el mismo papel, no en un YAML.
// ═══════════════════════════════════════════════════════════════════════════

import type { Gasto, Liquidacion } from '@/types/likida';
// `litros` va con alias: este archivo tiene una VARIABLE con ese nombre (el
// número de litros) y el import la haría sombra dentro de la función.
import { mxn, fechaMx, litros as fmtLitros } from '@/lib/formato';


/** `bueno` = cifra que el motor sostiene entera. `condicionado` = depende de
 *  algo que el motor NO verifica, y el pie dice de qué. */
export type TonoAcreditable = 'bueno' | 'condicionado';

export interface FilaAcreditable {
  label: string;
  /** Ya formateado: pesos o litros. Quien dibuja no decide la unidad. */
  valor: string;
  tono: TonoAcreditable;
  /** Notas al pie de ESTE renglón. Van pegadas a él, no juntas al final: un pie
   *  que se lee bajo otro renglón dice lo contrario de lo que quiere decir. */
  pies: string[];
}

/**
 * El estímulo de peaje se calcula sobre el SubTotal (sin IVA) de las casetas.
 *
 * `normas/lif-2026-20-A.yaml` dice "hasta en un 50 por ciento del GASTO TOTAL
 * EROGADO por este concepto", y el motor usa la base SIN IVA: ~13.8% menos
 * estímulo del que podría corresponder. Es el hallazgo H4 de la ficha,
 * `severidad: alta`, `estado: SIN RESOLVER` — resolverlo hacia el total podría
 * DUPLICAR el beneficio del IVA, que ya se acredita por separado (LIVA art. 5),
 * así que es una pregunta para un contador y no se resuelve sola aquí.
 *
 * Lo que sí es exigible al papel: decir cuál de las dos bases usó. Sin esa
 * línea, el contralor no puede ni reproducir la cifra ni discutirla.
 */
export const BASE_ESTIMULO_PEAJE =
  'Base usada: el subtotal SIN IVA de las casetas con CFDI verificado. La ley dice "50% del gasto total erogado"; ' +
  'si su contador toma el total con IVA, la cifra sube alrededor de 13.8%.';

/**
 * Las cuatro condiciones de elegibilidad del estímulo de peaje, transcritas de
 * `estimulo_peaje.condiciones` en `normas/lif-2026-20-A.yaml`
 * (`verificado_fuente_primaria`).
 *
 * El motor no conoce NINGUNA: no sabe los ingresos de la flota, ni si es parte
 * relacionada, ni si la caseta pertenece a la Red Nacional de Autopistas de
 * Cuota — dispara con `concepto === 'caseta'` a secas (hallazgos H5 y H6 de la
 * ficha). Imprimir la cifra en verde y en negritas sin decirlo le entrega el
 * estímulo, con el artículo citado al lado, a una flota con ingresos ≥ $300M o
 * que sea parte relacionada. Y el criterio 1/LIF/PI del Anexo 3 alcanza a
 * "quien preste servicios": esa práctica sería de Likida, no del cliente.
 */
export const CONDICIONES_ESTIMULO_PEAJE =
  'Likida NO verifica la elegibilidad. El estímulo exige las cuatro: dedicarse EXCLUSIVAMENTE al transporte terrestre ' +
  'de carga, pasaje o turismo; que las casetas sean de la Red Nacional de Autopistas de Cuota; ingresos anuales ' +
  'menores a $300 millones; y no ser parte relacionada (LISR art. 179). Confírmelas con su contador.';

/** El estímulo del art. 20 ap. A es ingreso acumulable: el neto es menor. */
export const NOTA_INGRESO_ACUMULABLE =
  'Los estímulos del art. 20 ap. A son ingreso acumulable para ISR: el beneficio neto es menor.';

/**
 * AUDITORÍA 17 pase 5, MEDIO (M8) — EL RENGLÓN MÁS CARO ERA EL ÚNICO SIN PIE.
 *
 * `IVA acreditable (LIVA art. 5)` salía con `tono: 'bueno'` («cifra que el
 * motor sostiene entera») y `pies: []`, al lado de dos renglones condicionados
 * con dos y un pie. La ficha `normas/liva-5.yaml` transcribe la fr. I y la
 * fr. II y **se corta ahí** — el artículo tiene más fracciones—, y lo declara
 * ella misma en `riesgo_actual`: «Si el artículo exige alguna condición
 * adicional que hoy no se valida, la cifra impresa está de más. Es una cifra
 * que el contralor usa». En `verificado_por` añade que NINGÚN contador público
 * ha revisado la interpretación.
 *
 * Lo que el motor SÍ comprueba son exactamente los dos requisitos que la ficha
 * transcribe, y eso es lo que el pie dice. Lo que no comprueba se declara sin
 * enumerarlo: citar una fracción que nadie transcribió sería inventar una norma
 * para poder confesar que no se verifica.
 */
export const NOTA_IVA_ACREDITABLE =
  'Likida comprueba dos requisitos del art. 5: que la erogación sea deducible para ISR —y solo en esa proporción ' +
  'cuando es parcialmente deducible (fr. I)— y que el IVA venga trasladado y desglosado en el CFDI (fr. II). ' +
  'El artículo exige más requisitos que Likida NO verifica. Confírmelo con su contador antes de acreditarlo.';

/**
 * El IEPS de diésel se entrega en LITROS, no en pesos: el estímulo es cuota
 * SEMANAL disminuida × litros y sin el acuerdo del DOF no se puede calcular
 * aquí. Decisión D2 del roadmap.
 */
export const NOTA_LITROS_DIESEL =
  'El estímulo de diésel se calcula con la cuota SEMANAL vigente al momento de cada compra; se entregan los litros ' +
  'para que su contador aplique la cuota fechada.';

/**
 * AUDITORÍA 17 pase 5, BAJO (B4) — EL PIE PEDÍA "LA CUOTA FECHADA" SIN DAR LAS
 * FECHAS.
 *
 * `lif-2026-20-A.yaml:26-30` ata la cuota al «momento en que se haya realizado
 * la… adquisición del diésel», y su `advertencia_critica` recuerda que la cuota
 * **cambia semanalmente**. Un total agregado no se puede repartir entre dos
 * semanas, y la tabla de comprobantes del PDF trae fecha pero no litros.
 *
 * Cuando el reparto por fecha SÍ reconstruye exactamente el total acreditado,
 * se imprime (`desgloseLitrosPorFecha`). Cuando no —falta la fecha de un
 * comprobante, hay un duplicado, o parte del litraje no entró al estímulo—, no
 * se inventa un reparto: se dice que el número viene agrupado. Misma disciplina
 * que `filasDeducibilidad`, que se niega a imprimir si los renglones no suman.
 */
export const NOTA_LITROS_SIN_DESGLOSE =
  'Este total agrupa todas las cargas de la liquidación: Likida no pudo repartirlo por fecha de compra ' +
  '(falta la fecha o los litros de algún comprobante). Si las cargas caen en semanas distintas, hay que ' +
  'repartirlas antes de aplicar la cuota.';

/**
 * Los litros de cada carga con su día, o `null` si la suma no reconstruye
 * exactamente `totalLitros`.
 *
 * NO reimplementa la elegibilidad del estímulo —esa vive en el motor y solo
 * ahí—: toma los litros que los comprobantes traen leídos y los COMPRUEBA
 * contra el total que el motor ya decidió. Si no cuadran, se calla.
 */
function desgloseLitrosPorFecha(gastos: Gasto[] | undefined, totalLitros: number): string | null {
  if (!gastos?.length) return null;
  const porFecha = new Map<string, number>();
  let suma = 0;
  for (const g of gastos) {
    const leidos = Number((g.ocrExtra as Record<string, unknown> | undefined)?.litros ?? 0);
    if (!Number.isFinite(leidos) || leidos <= 0) continue;
    // Sin fecha no se puede colocar en una semana, y colocarlo "donde caiga"
    // sería inventar el dato que decide la cuota.
    if (!g.fecha) return null;
    const dia = g.fecha.slice(0, 10);
    porFecha.set(dia, (porFecha.get(dia) ?? 0) + leidos);
    suma += leidos;
  }
  if (!porFecha.size) return null;
  if (Math.abs(suma - totalLitros) > 0.001) return null;
  const partes = [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, l]) => `${fechaMx(dia)}: ${fmtLitros(l)}`);
  return `Por fecha de compra — ${partes.join(' · ')}.`;
}

/**
 * Devuelve los renglones de la sección, o `null` si no hay nada que acreditar.
 *
 * `piesGenerales` va debajo del bloque entero (aplica a todos los renglones);
 * lo específico de un renglón va en su propio `pies`.
 */
export function filasAcreditables(
  /** `gastos` es opcional: sin ellos el renglón del diésel sigue saliendo, pero
   *  declarando que el total viene agrupado (B4). */
  liq: Pick<Liquidacion, 'ivaAcreditable' | 'peajeAcreditable' | 'litrosDieselAcreditables'>
    & Partial<Pick<Liquidacion, 'gastos'>>,
): { filas: FilaAcreditable[]; piesGenerales: string[] } | null {
  const litros = liq.litrosDieselAcreditables ?? 0;
  const filas: FilaAcreditable[] = [];

  if (litros > 0) {
    const desglose = desgloseLitrosPorFecha(liq.gastos, litros);
    filas.push({
      label: 'Diésel elegible para el estímulo de IEPS (LIF 2026 art. 20, ap. A)',
      valor: fmtLitros(litros),
      tono: 'condicionado',
      pies: [NOTA_LITROS_DIESEL, desglose ?? NOTA_LITROS_SIN_DESGLOSE],
    });
  }
  if (liq.ivaAcreditable > 0) {
    filas.push({
      label: 'IVA acreditable (LIVA art. 5)',
      valor: mxn(liq.ivaAcreditable),
      tono: 'condicionado',
      pies: [NOTA_IVA_ACREDITABLE],
    });
  }
  if (liq.peajeAcreditable > 0) {
    filas.push({
      // La condición va en el LABEL y no solo en el pie: el renglón es lo que se
      // skimmea, y "Estímulo de peaje 50%" a secas se lee como un derecho ya
      // ganado.
      label: 'Estímulo de peaje 50% (LIF 2026 art. 20, ap. A) — sujeto a elegibilidad',
      valor: mxn(liq.peajeAcreditable),
      tono: 'condicionado',
      pies: [BASE_ESTIMULO_PEAJE, CONDICIONES_ESTIMULO_PEAJE],
    });
  }

  if (!filas.length) return null;
  return { filas, piesGenerales: [NOTA_INGRESO_ACUMULABLE] };
}
