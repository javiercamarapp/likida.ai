// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO M3 — UN COMBUSTIBLE EN EFECTIVO **SIN FECHA**
// CORRÍA CONTRA UN CONTADOR CUYO DENOMINADOR LO EXCLUYE.
//
// El contador del 15% de la RFA 2.9 tiene dos mitades y no cuadraban:
//
//   · el DENOMINADOR lo arma `repo.ts` con `.gte('fecha', '2026-01-01')
//     .lte('fecha', '2026-12-31')`, y un gasto con `fecha = null` **no entra**;
//   · el NUMERADOR lo llevaba el motor, y `engine.ts` daba por bueno el gasto
//     sin fecha: `const mismoEjercicio = !anioComprobante || …` — sin fecha,
//     `anioComprobante` es `null` y la condición sale `true`.
//
// Resultado: el papel afirmaba «el ejercicio lleva $5,800.00 de $100,000.00 de
// combustible en efectivo» sumando en el numerador unos pesos que el
// denominador nunca contó. Un rótulo que dice "del ejercicio" tiene que estar
// medido contra el ejercicio.
//
// Y el agravante en `desde_db.ts`: para no doblar el contador, el previo se
// calcula restando el efectivo de ESTE viaje —y contaba el sin-fecha como del
// ejercicio (`g.fecha?.slice(0, 4) ?? anioEjercicio`), o sea restaba de
// `totalesEjercicio.efectivo` unos pesos que esa consulta jamás sumó. El previo
// salía más chico de lo real y el tope del resto del ejercicio, más grande.
//
// Arreglo, fail-closed y en las dos mitades: sin fecha no se mide. El gasto
// sale "por confirmar" con nota honesta (misma rama que el comprobante de otro
// ejercicio), y `desde_db` deja de restar lo que nunca sumó.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cuadrarViaje, cubetaDe } from './engine';
import { DEMO_CONFIG } from '../config';
import type { Gasto } from '@/types/likida';

const DIESEL_EFECTIVO = {
  id: 'g-sf',
  concepto: 'diesel',
  monto: 5800,
  folio: '55001',
  rfcEmisor: 'CGC1005243I3',
  ocrConfianza: 1,
  formaPago: '01',
  subTotal: 5000,
  xmlVerificado: true,
  cfdiUuid: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  claveProdServ: '15101505',
  tipoComprobante: 'I',
  complementoHidrocarburos: true,
  rfcReceptor: 'GMX0902279I1',
  ivaTraslado: 800,
} as unknown as Gasto;

const liquidar = (g: Gasto) => cuadrarViaje({
  viajeId: 'v-m3', anticipo: 20000, gastos: [g],
  politica: [{ concepto: 'diesel', topeMonto: 30000 }],
  estimulos: DEMO_CONFIG.estimulos, hidrocarburos: DEMO_CONFIG.hidrocarburos,
  empresaRfc: 'GMX0902279I1',
  facilidad15: true, totalCombustibleEjercicio: 100000, efectivoPrevEjercicio: 0,
  anioEjercicio: '2026', hoy: '2026-08-08',
});

describe('M3 · el motor no mide contra el ejercicio un comprobante sin fecha', () => {
  it('sin fecha NO se declara "deducible dentro del 15%": sale por confirmar', () => {
    const liq = liquidar(DIESEL_EFECTIVO);
    expect(
      liq.diferencias.some((d) => d.tipo === 'combustible_efectivo_dentro15'),
      'el denominador del 15% se consulta por rango de fecha: un gasto sin fecha no está en él, '
      + 'así que no se puede afirmar en qué parte del tope cae',
    ).toBe(false);
    const suyas = liq.diferencias.filter((d) => d.gastoId === 'g-sf');
    expect(suyas.some((d) => d.tipo === 'combustible_efectivo')).toBe(true);
    expect(cubetaDe(DIESEL_EFECTIVO, suyas)).toBe('por_confirmar');
  });

  it('la nota dice qué falta y por qué, sin afirmar una cifra del ejercicio', () => {
    const d = liquidar(DIESEL_EFECTIVO).diferencias.find((x) => x.tipo === 'combustible_efectivo')!;
    expect(d.nota).toMatch(/sin fecha|no trae fecha/i);
    expect(d.nota, 'no puede citar un acumulado del ejercicio que no lo incluye').not.toMatch(/\$100,000\.00/);
    expect(d.monto, 'no se declara perdido: se declara no medido').toBe(0);
  });

  it('CON fecha del ejercicio sigue midiéndose igual — la regla buena no se apaga', () => {
    const liq = liquidar({ ...DIESEL_EFECTIVO, fecha: '2026-08-06' } as Gasto);
    const d = liq.diferencias.find((x) => x.tipo === 'combustible_efectivo_dentro15');
    expect(d).toBeDefined();
    expect(d!.nota).toContain('$100,000.00');
  });
});

// ── La otra mitad: `desde_db` restaba del previo lo que la consulta no sumó ──

const getViaje = vi.fn();
const getGastos = vi.fn();
const getAcumuladoCombustible = vi.fn();
const cuadrarViajeSpy = vi.fn();

vi.mock('../repo', () => ({
  getViaje: (...a: unknown[]) => getViaje(...a),
  getGastos: (...a: unknown[]) => getGastos(...a),
  getOperador: vi.fn(async () => null),
  getAcumuladoCombustible: (...a: unknown[]) => getAcumuladoCombustible(...a),
}));
vi.mock('../config', async (orig) => {
  const real = await orig() as Record<string, unknown>;
  return { ...real, getConfig: async () => ({ ...(real.DEMO_CONFIG as object), facilidadCombustibleEfectivo: { dedicacionExclusivaCarga: true, regimenElegible: true } }) };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }));
vi.mock('./engine', async (orig) => {
  const real = await orig() as Record<string, unknown>;
  return {
    ...real,
    cuadrarViaje: (input: unknown) => {
      cuadrarViajeSpy(input);
      return (real.cuadrarViaje as (i: unknown) => unknown)(input);
    },
  };
});

describe('M3 · desde_db no resta del previo el efectivo que la consulta del ejercicio no contó', () => {
  beforeEach(() => {
    cuadrarViajeSpy.mockReset();
    getViaje.mockResolvedValue({ id: 'v1', anticipo: 20000, fechaInicio: '2026-08-01', destino: 'Monterrey' });
    // El acumulado del ejercicio SOLO puede traer gastos con fecha: la consulta
    // de `repo.ts` filtra por rango. $10,000 de efectivo, ninguno sin fecha.
    getAcumuladoCombustible.mockResolvedValue({ efectivo: 10000, totalCombustible: 120000 });
  });

  it('el gasto sin fecha de ESTE viaje no se resta del previo', async () => {
    getGastos.mockResolvedValue([
      { id: 'a', concepto: 'diesel', monto: 3000, formaPago: '01', fecha: '2026-08-02' },
      { id: 'b', concepto: 'diesel', monto: 5800, formaPago: '01' }, // sin fecha
    ]);
    const { cuadrarDesdeDB } = await import('./desde_db');
    await cuadrarDesdeDB('t1', 'v1');
    const input = cuadrarViajeSpy.mock.calls[0][0] as { efectivoPrevEjercicio: number };
    expect(
      input.efectivoPrevEjercicio,
      'restar los $5,800 sin fecha de un acumulado que nunca los incluyó fabrica un previo más '
      + 'chico y un tope más grande para el resto del ejercicio',
    ).toBe(7000);
  });

  it('los gastos CON fecha del ejercicio se siguen restando (no se dobla el contador)', async () => {
    getGastos.mockResolvedValue([
      { id: 'a', concepto: 'diesel', monto: 3000, formaPago: '01', fecha: '2026-08-02' },
      { id: 'c', concepto: 'diesel', monto: 1000, formaPago: '01', fecha: '2026-07-30' },
    ]);
    const { cuadrarDesdeDB } = await import('./desde_db');
    await cuadrarDesdeDB('t1', 'v1');
    const input = cuadrarViajeSpy.mock.calls[0][0] as { efectivoPrevEjercicio: number };
    expect(input.efectivoPrevEjercicio).toBe(6000);
  });
});
