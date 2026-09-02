// ═══════════════════════════════════════════════════════════════════════════
// AUD24 · PRU-6 — mover `rfc_receptor_no_verificable` a la lista `REVISAR`
// (engine.ts:1610) no hacía enrojecer ninguna prueba: `rfc_no_verificable.
// test.ts` afirma cubetas (totalDeducible, ivaAcreditable, totalPorConfirmar)
// y el texto de la nota, nunca `estatus`.
//
// Con esta liquidación (RFC de la flota mal capturado, CFDI de un tercero) el
// estatus correcto es `con_diferencias` — hay algo que confirmar, pero no
// bloquea la liquidación completa como «Por revisar» (rojo en panel y PDF).
// Si `rfc_receptor_no_verificable` entra a REVISAR, cada liquidación de una
// flota con su RFC mal capturado se vuelve rojo, incluida la del demo.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { cuadrarViaje } from './engine';
import type { Gasto } from '@/types/likida';

const CFDI_DE_TERCERO: Gasto = {
  id: 'g1', concepto: 'factura', monto: 11600, fecha: '2026-07-27',
  cfdiUuid: 'aaaaaaaa-1111-2222-3333-444444444444', estadoSat: 'vigente',
  rfcReceptor: 'ODM950324V2A',
  ivaTraslado: 1600, xmlVerificado: true,
};

describe('PRU-6: rfc_receptor_no_verificable no baja el estatus a "revisar"', () => {
  it('RFC de la flota mal formado: estatus = con_diferencias, NO revisar', () => {
    const l = cuadrarViaje({ viajeId: 'v', anticipo: 20_000, politica: [], gastos: [CFDI_DE_TERCERO], empresaRfc: 'TIN010101AAA' });
    expect(l.diferencias.map((d) => d.tipo)).toContain('rfc_receptor_no_verificable');
    expect(l.estatus).toBe('con_diferencias');
  });

  it('RFC de la flota sin capturar (genérico del SAT): mismo estatus, no "revisar"', () => {
    const l = cuadrarViaje({ viajeId: 'v', anticipo: 20_000, politica: [], gastos: [CFDI_DE_TERCERO], empresaRfc: 'XAXX010101000' });
    expect(l.diferencias.map((d) => d.tipo)).toContain('rfc_receptor_no_verificable');
    expect(l.estatus).toBe('con_diferencias');
  });
});
