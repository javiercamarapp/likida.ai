// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), BAJO B3 — EL `continue` DEL FAIL-CLOSED DEL 15% SE
// LLEVABA EL RESTO DE LA REVISIÓN DEL MISMO COMPROBANTE.
//
// Cuando el contador del ejercicio no traía datos (o el comprobante era de otro
// ejercicio), el motor empujaba `combustible_efectivo` —correcto, fail-closed—
// y hacía `continue`. Ese `continue` no salta la regla del 15%: salta el resto
// del cuerpo del bucle, que es donde viven `monto_discrepante`,
// `comprobante_no_fiscal`, `texto_sospechoso`, `fecha_sospechosa`,
// `folio_verificar`, la política de la flota, el RFC del receptor, el CFDI
// cancelado, los EFOS y el complemento de hidrocarburos.
//
// Las otras cuatro ramas del 15% no continúan. Ésta sí, y el efecto era que un
// bache en el contador del ejercicio apagaba, de paso, la revisión completa del
// comprobante — justo sobre el gasto más caro de una flota.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { cuadrarViaje } from './engine';
import { DEMO_CONFIG } from '../config';
import type { Gasto } from '@/types/likida';

/** Diésel en efectivo con TRES banderas encima, y el contador caído. */
const SOSPECHOSO = {
  id: 'g-b3',
  concepto: 'diesel',
  monto: 4000,
  fecha: '2026-08-06',
  folio: '31337',
  formaPago: '01',
  ocrConfianza: 1,
  cfdiUuid: 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70',
  rfcReceptor: 'GMX0902279I1',
  estadoSat: 'cancelado',
  ocrExtra: { montoDiscrepante: true, montoOcr: 4700, noEsComprobanteFiscal: true, textoSospechoso: true },
} as unknown as Gasto;

const liquidar = (extra: Record<string, unknown>) => cuadrarViaje({
  viajeId: 'v-b3', anticipo: 10000, gastos: [SOSPECHOSO],
  politica: [{ concepto: 'diesel', topeMonto: 2500 }],
  estimulos: DEMO_CONFIG.estimulos,
  empresaRfc: 'GMX0902279I1',
  facilidad15: true, anioEjercicio: '2026', hoy: '2026-08-08',
  ...extra,
});

const tipos = (extra: Record<string, unknown>) =>
  liquidar(extra).diferencias.filter((d) => d.gastoId === 'g-b3').map((d) => d.tipo);

describe('B3 · el fail-closed del 15% no apaga el resto de la revisión del comprobante', () => {
  it('con el contador del ejercicio caído (total 0) siguen saliendo las otras banderas', () => {
    const t = tipos({ totalCombustibleEjercicio: 0, efectivoPrevEjercicio: 0 });
    expect(t, 'la premisa: el efectivo entra por la rama fail-closed').toContain('combustible_efectivo');
    for (const esperado of ['monto_discrepante', 'comprobante_no_fiscal', 'texto_sospechoso', 'sobre_politica', 'cfdi_cancelado']) {
      expect(t, `un bache en el contador del 15% no puede esconder ${esperado}`).toContain(esperado);
    }
  });

  it('con el comprobante de OTRO ejercicio, lo mismo', () => {
    const t = liquidar({ totalCombustibleEjercicio: 100000, efectivoPrevEjercicio: 0, anioEjercicio: '2027' })
      .diferencias.filter((d) => d.gastoId === 'g-b3').map((d) => d.tipo);
    expect(t).toContain('combustible_efectivo');
    expect(t).toContain('cfdi_cancelado');
    expect(t).toContain('monto_discrepante');
  });

  it('la rama que sí mide (dentro del 15%) nunca perdió esas banderas — el contraste', () => {
    const t = tipos({ totalCombustibleEjercicio: 100000, efectivoPrevEjercicio: 0 });
    expect(t).toContain('combustible_efectivo_dentro15');
    expect(t).toContain('cfdi_cancelado');
    expect(t).toContain('monto_discrepante');
  });
});
