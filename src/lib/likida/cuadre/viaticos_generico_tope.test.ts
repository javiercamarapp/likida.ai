// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), BAJO B1 — EL CONCEPTO HEREDADO `viaticos` RECIBE EL
// TOPE DE **ALIMENTACIÓN** DE LISR 28-V, QUE NO CUBRE HOSPEDAJE… Y EL PAPEL LO
// IMPRIMÍA COMO SI FUERA ALIMENTACIÓN.
//
// `normas/lisr-28-V.yaml:21-25` (verificado_fuente_primaria):
//
//   «Tratándose de gastos de viaje destinados a la **alimentación**, éstos sólo
//    serán deducibles hasta por un monto que no exceda de $750.00 diarios por
//    cada beneficiario…»
//
// y la propia ficha, en `confirmado_del_codigo:43`: «Solo alimentación; el
// hospedaje nacional no tiene tope: CORRECTO».
//
// El motor topa también el concepto genérico `viaticos` —el que emitía el OCR
// viejo, y esos gastos ya guardados no se reclasifican solos—. Mantener el tope
// es la decisión conservadora y se conserva: quitarlo dejaría escapar del tope
// una alimentación real, que es el error caro (deducción de más, la paga el
// cliente ante el SAT). Lo que NO se puede es imprimirlo como un hecho:
//
//   «Alimentación del 2026-08-01: $2,000.00 excede el tope fiscal de $750.00
//    por día (LISR 28-V) — el excedente de $1,250.00 no es deducible.»
//
// sobre una noche de hotel de $2,000 clasificada 'viaticos'. Ni es alimentación
// ni ese excedente existe. La regla del producto para esto está escrita:
// «Una estimación se puede mostrar, pero declarada y con su supuesto a la
// vista». Eso es lo que el renglón hace ahora.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { cuadrarViaje } from './engine';
import { DEMO_CONFIG } from '../config';
import type { Gasto } from '@/types/likida';

const g = (over: Partial<Gasto>): Gasto => ({
  id: Math.random().toString(36).slice(2), concepto: 'otro', monto: 100,
  fecha: '2026-08-01', formaPago: '04', rfcReceptor: 'GMX0902279I1', ...over,
});

const cuadrar = (gastos: Gasto[]) => cuadrarViaje({
  viajeId: 'v-b1', anticipo: 5000, gastos, politica: [], estimulos: DEMO_CONFIG.estimulos,
});

const tope = (gastos: Gasto[]) =>
  cuadrar(gastos).diferencias.find((d) => d.tipo === 'viatico_excede_fiscal')!;

describe('B1 · el concepto genérico "viaticos" no se imprime como alimentación', () => {
  it('una noche de hotel de $2,000 clasificada "viaticos" NO se rotula "Alimentación"', () => {
    const d = tope([g({ concepto: 'viaticos', monto: 2000, cfdiUuid: 'u1', xmlVerificado: true })]);
    expect(
      d.nota.startsWith('Alimentación'),
      'el tope de LISR 28-V es de alimentación; llamarle así a un comprobante que solo dice '
      + '"viáticos" es afirmar el hecho que decide el dinero',
    ).toBe(false);
    expect(d.nota).toMatch(/^Viáticos del 2026-08-01/);
  });

  it('declara el supuesto y qué hacer: el hospedaje nacional no lleva tope', () => {
    const d = tope([g({ concepto: 'viaticos', monto: 2000, cfdiUuid: 'u1', xmlVerificado: true })]);
    expect(d.nota).toMatch(/hospedaje/i);
    expect(d.nota).toMatch(/genérico|generico/i);
    expect(d.nota, 'el contralor tiene que poder recuperar la deducción').toMatch(/reclasif/i);
    // Y sigue citando la norma y el tope, que no cambian.
    expect(d.nota).toContain('LISR 28-V');
    expect(d.nota).toContain('$750.00');
  });

  it('el criterio conservador NO se afloja: el excedente sigue contando', () => {
    // Quitarle el tope al genérico dejaría escapar una alimentación real, que es
    // el error que le cuesta al cliente ante una revisión.
    const r = cuadrar([g({ concepto: 'viaticos', monto: 2000, cfdiUuid: 'u1', xmlVerificado: true })]);
    expect(r.totalNoDeducible).toBe(1250);
    expect(r.totalDeducible).toBe(750);
  });

  it('una ALIMENTACIÓN de verdad se sigue rotulando "Alimentación", sin el descargo', () => {
    const d = tope([g({ concepto: 'alimentacion', monto: 2000, cfdiUuid: 'u1', xmlVerificado: true })]);
    expect(d.nota).toMatch(/^Alimentación del 2026-08-01/);
    expect(d.nota).not.toMatch(/hospedaje/i);
  });

  it('un HOSPEDAJE bien clasificado sigue sin tope alguno', () => {
    const r = cuadrar([g({ concepto: 'hospedaje', monto: 2000, cfdiUuid: 'u1', xmlVerificado: true })]);
    expect(r.diferencias.some((d) => d.tipo === 'viatico_excede_fiscal')).toBe(false);
  });
});
