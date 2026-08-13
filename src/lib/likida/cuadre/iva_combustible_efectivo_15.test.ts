// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), ALTO A4 — EL COMBUSTIBLE EN EFECTIVO DENTRO DEL 15%
// NO ACREDITABA **IVA**, Y LA FICHA QUE SE INVOCA EXCLUYE EL **IEPS**.
//
// `rfa-2026-2.9.yaml` (verificado_fuente_primaria), `limite_importante`:
//
//   «Conserva la DEDUCCIÓN para ISR. NO habilita el acreditamiento del IEPS:
//    son dos beneficios distintos y el efectivo solo salva uno.»
//
// El IVA no es el IEPS. Su requisito vive en `liva-5.yaml` fr. I, también
// verificado contra fuente primaria:
//
//   «…se consideran estrictamente indispensables las erogaciones efectuadas por
//    el contribuyente que sean DEDUCIBLES PARA LOS FINES DEL IMPUESTO SOBRE LA
//    RENTA…  Tratándose de erogaciones parcialmente deducibles…, únicamente se
//    considerará… EN LA PROPORCIÓN en la que dichas erogaciones sean
//    deducibles…»
//
// O sea: si la facilidad de la RFA 2.9 deja la erogación DEDUCIBLE para ISR
// —y el motor lo afirma: la imprime en "Deducible para ISR"—, su IVA es
// acreditable. El motor metía `combustible_efectivo_dentro15` y
// `efectivo_sobre_15` en `SIN_ACREDITAMIENTO` y hacía `continue` sobre el gasto
// ENTERO, así que la misma hoja decía "Deducible para ISR $5,800.00" y se
// callaba los $800 de IVA que ese mismo comprobante trae desglosados.
//
// Lo que NO cambia (y va probado abajo como regresión): el efectivo no acredita
// IEPS —ni un litro—, y el efectivo NO elegible (o sin declarar) no acredita
// nada, porque ahí la erogación no es deducible para ISR.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { cuadrarViaje, cubetaDe } from './engine';
import { DEMO_CONFIG } from '../config';
import type { Gasto } from '@/types/likida';

/** Diésel en EFECTIVO, con CFDI verificado: $5,000 + $800 de IVA = $5,800. */
const DIESEL_EFECTIVO = {
  id: 'g-efe',
  concepto: 'diesel',
  monto: 5800,
  fecha: '2026-08-06',
  folio: '77001',
  folioNorm: '77001',
  rfcEmisor: 'CGC1005243I3',
  ocrConfianza: 1,
  formaPago: '01',
  subTotal: 5000,
  ocrExtra: { producto: 'DIESEL', litros: 200, precioUnitario: 29, ivaMonto: 800, ivaTasa: 0.16 },
  xmlVerificado: true,
  cfdiUuid: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  claveProdServ: '15101505',
  claveUnidad: 'LTR',
  tipoComprobante: 'I',
  complementoHidrocarburos: true,
  rfcReceptor: 'GMX0902279I1',
  ivaTraslado: 800,
  iepsTraslado: 0,
} as unknown as Gasto;

function liquidar(gastos: Gasto[], extra: Record<string, unknown>) {
  return cuadrarViaje({
    viajeId: 'prueba-iva-15',
    anticipo: 20000,
    gastos,
    politica: [{ concepto: 'diesel', topeMonto: 30000 }],
    ruta: 'prueba',
    hoy: '2026-08-08',
    estimulos: DEMO_CONFIG.estimulos,
    hidrocarburos: DEMO_CONFIG.hidrocarburos,
    empresaRfc: 'GMX0902279I1',
    anioEjercicio: '2026',
    ...extra,
  });
}

describe('A4 · el combustible en efectivo dentro del 15% acredita IVA (la RFA 2.9 excluye el IEPS, no el IVA)', () => {
  it('dentro del 15%: acredita los $800 de IVA del comprobante', () => {
    // Tope = 15% de $100,000 = $15,000. Este comprobante ($5,800) cabe entero.
    const liq = liquidar([DIESEL_EFECTIVO], {
      facilidad15: true, totalCombustibleEjercicio: 100000, efectivoPrevEjercicio: 0,
    });
    expect(
      liq.diferencias.some((d) => d.tipo === 'combustible_efectivo_dentro15'),
      'la premisa de la prueba: el motor tiene que estar declarándolo deducible por la facilidad',
    ).toBe(true);
    expect(cubetaDe(DIESEL_EFECTIVO, liq.diferencias.filter((d) => d.gastoId === 'g-efe'))).toBe('deducible');
    expect(
      liq.ivaAcreditable,
      'el mismo papel lo imprime "Deducible para ISR": LIVA 5-I ata el acreditamiento a la deducibilidad para ISR',
    ).toBeCloseTo(800, 2);
  });

  it('dentro del 15%: sigue SIN acreditar un solo litro de IEPS', () => {
    const liq = liquidar([DIESEL_EFECTIVO], {
      facilidad15: true, totalCombustibleEjercicio: 100000, efectivoPrevEjercicio: 0,
    });
    expect(liq.litrosDieselAcreditables ?? 0, 'la facilidad salva UN beneficio, no dos').toBe(0);
    expect(liq.iepsAcreditable).toBe(0);
  });

  it('excedente del 15%: el IVA se acredita EN LA PROPORCIÓN deducible (LIVA 5-I)', () => {
    // Tope = 15% de $10,000 = $1,500. De los $5,800, solo $1,500 son deducibles
    // → proporción 1500/5800 = 0.258620…, y $800 × esa proporción = $206.90.
    const liq = liquidar([DIESEL_EFECTIVO], {
      facilidad15: true, totalCombustibleEjercicio: 10000, efectivoPrevEjercicio: 0,
    });
    expect(liq.diferencias.some((d) => d.tipo === 'efectivo_sobre_15')).toBe(true);
    expect(liq.ivaAcreditable).toBeCloseTo(800 * (1500 / 5800), 2);
    expect(liq.litrosDieselAcreditables ?? 0).toBe(0);
  });

  it('flota NO elegible: no acredita nada — ahí la erogación no es deducible para ISR', () => {
    const liq = liquidar([DIESEL_EFECTIVO], {
      facilidad15: false, totalCombustibleEjercicio: 100000, efectivoPrevEjercicio: 0,
    });
    expect(liq.diferencias.some((d) => d.tipo === 'efectivo_no_elegible')).toBe(true);
    expect(liq.ivaAcreditable).toBe(0);
  });

  it('flota SIN declarar: no acredita nada — no se afirma deducible ni no deducible', () => {
    const liq = liquidar([DIESEL_EFECTIVO], {
      totalCombustibleEjercicio: 100000, efectivoPrevEjercicio: 0,
    });
    expect(liq.diferencias.some((d) => d.tipo === 'combustible_efectivo')).toBe(true);
    expect(liq.ivaAcreditable).toBe(0);
  });
});
