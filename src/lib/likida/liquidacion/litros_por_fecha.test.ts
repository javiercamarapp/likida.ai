// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), BAJO B4 — EL PDF ENTREGA LOS LITROS DEL ESTÍMULO
// **AGREGADOS Y SIN FECHA DE COMPRA**, Y SU PROPIO PIE LE PIDE AL CONTADOR QUE
// APLIQUE "LA CUOTA FECHADA".
//
// `normas/lif-2026-20-A.yaml:26-30` (verificado_fuente_primaria):
//
//   «…el monto que se podrá acreditar será el que resulte de multiplicar la
//    cuota… **vigente en el momento en que se haya realizado la importación o
//    adquisición del diésel**…, por el número de litros…»
//
// y `advertencia_critica:32-35`: «la cuota **cambia SEMANALMENTE**» (la ficha
// documenta que pasó de $7.3634 a $2.0925 en cinco meses).
//
// El renglón imprimía UN escalar —`1,400 L`— y su pie decía «se entregan los
// litros para que su contador aplique la cuota fechada». La tabla de
// comprobantes trae fecha por renglón pero NO trae litros: no había forma de
// repartir el total entre semanas, y el papel le pedía al contador justo eso.
//
// El desglose sale del MISMO dato que ya viaja en la liquidación (la fecha del
// comprobante y los litros que leyó el OCR) y se imprime SOLO si reconstruye
// exactamente el total que el motor acreditó. Si no cuadra —falta una fecha,
// hay un duplicado, un litraje quedó fuera del estímulo— no se inventa un
// reparto: el pie dice que el total viene agrupado y que hay que repartirlo.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { filasAcreditables, NOTA_LITROS_DIESEL, NOTA_LITROS_SIN_DESGLOSE } from './acreditable';
import { cuadrarViaje } from '../cuadre/engine';
import { DEMO_CONFIG } from '../config';
import type { Gasto } from '@/types/likida';

/** Una carga de diésel timbrada y pagada por transferencia (LISR 27-III la acepta). */
const carga = (id: string, fecha: string, litros: number, monto: number) => ({
  id, concepto: 'diesel', monto, fecha, folio: id,
  formaPago: '03', ocrConfianza: 1, xmlVerificado: true,
  cfdiUuid: `uuid-${id}`, rfcReceptor: 'GMX0902279I1', rfcEmisor: 'CGC1005243I3',
  claveProdServ: '15101505', claveUnidad: 'LTR', tipoComprobante: 'I',
  complementoHidrocarburos: true,
  ocrExtra: { producto: 'DIESEL', litros },
} as unknown as Gasto);

// El viaje del escenario: 27-jul al 5-ago-2026, 1,400 L en tres cargas que caen
// en DOS semanas distintas del DOF.
const CARGAS = [
  carga('c1', '2026-07-28', 620, 17000),
  carga('c2', '2026-08-01', 480, 13000),
  carga('c3', '2026-08-04', 300, 8100),
];

const liquidar = (gastos: Gasto[]) => cuadrarViaje({
  viajeId: 'v-b4', anticipo: 40000, gastos,
  politica: [{ concepto: 'diesel', topeMonto: 30000 }],
  estimulos: DEMO_CONFIG.estimulos, hidrocarburos: DEMO_CONFIG.hidrocarburos,
  empresaRfc: 'GMX0902279I1', hoy: '2026-08-06',
});

const filaDiesel = (gastos: Gasto[]) => {
  const liq = liquidar(gastos);
  const r = filasAcreditables({ ...liq, gastos })!;
  return { liq, fila: r.filas.find((f) => f.label.includes('Diésel'))! };
};

describe('B4 · los litros del estímulo se entregan con su fecha de compra', () => {
  it('el escenario del hallazgo: 1,400 L en tres cargas de dos semanas distintas', () => {
    const { liq, fila } = filaDiesel(CARGAS);
    expect(liq.litrosDieselAcreditables, 'la premisa: el motor acredita las tres cargas').toBe(1400);
    expect(fila.valor).toBe('1,400 L');
    const pies = fila.pies.join(' ');
    expect(pies).toContain(NOTA_LITROS_DIESEL);
    // Las tres fechas con sus litros, en orden, para que el contador pueda
    // aplicar la cuota de CADA semana.
    expect(pies).toContain('28 jul 2026: 620 L');
    expect(pies).toContain('1 ago 2026: 480 L');
    expect(pies).toContain('4 ago 2026: 300 L');
    expect(pies).not.toContain(NOTA_LITROS_SIN_DESGLOSE);
  });

  it('dos cargas del MISMO día se suman en un solo renglón de fecha', () => {
    const { fila } = filaDiesel([
      carga('c1', '2026-07-28', 620, 17000),
      carga('c4', '2026-07-28', 100, 2700),
    ]);
    expect(fila.pies.join(' ')).toContain('28 jul 2026: 720 L');
  });

  it('si el reparto no reconstruye EXACTAMENTE el total, no se inventa: se declara', () => {
    // La tercera carga se paga en EFECTIVO: el motor no la acredita (LIF 20-A-IV
    // no tiene la válvula del 15% de la RFA 2.9), así que sus litros no están en
    // el total y el desglose por fecha no cuadraría.
    const gastos = [CARGAS[0], CARGAS[1], { ...CARGAS[2], formaPago: '01' } as Gasto];
    const { liq, fila } = filaDiesel(gastos);
    expect(liq.litrosDieselAcreditables).toBe(1100);
    expect(fila.valor).toBe('1,100 L');
    expect(fila.pies.join(' '), 'un reparto que no suma el total impreso es peor que ninguno')
      .not.toMatch(/28 jul 2026: 620 L/);
    expect(fila.pies).toContain(NOTA_LITROS_SIN_DESGLOSE);
  });

  it('un comprobante sin fecha apaga el desglose entero, no se le inventa un día', () => {
    const sinFecha = { ...CARGAS[1], fecha: undefined } as Gasto;
    const { fila } = filaDiesel([CARGAS[0], sinFecha]);
    expect(fila.pies).toContain(NOTA_LITROS_SIN_DESGLOSE);
    expect(fila.pies.join(' ')).not.toContain('620 L');
  });

  it('sin la lista de gastos (llamador viejo) el renglón sigue siendo válido y honesto', () => {
    const r = filasAcreditables({ ivaAcreditable: 0, peajeAcreditable: 0, litrosDieselAcreditables: 1400 })!;
    const fila = r.filas[0];
    expect(fila.valor).toBe('1,400 L');
    expect(fila.pies).toContain(NOTA_LITROS_SIN_DESGLOSE);
  });

  it('el pie declara por qué hace falta el reparto: la cuota es SEMANAL', () => {
    expect(NOTA_LITROS_DIESEL).toContain('SEMANAL');
    expect(NOTA_LITROS_SIN_DESGLOSE).toMatch(/fecha de compra/i);
  });
});
