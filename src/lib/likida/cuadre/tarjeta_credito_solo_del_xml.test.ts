// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO M9 — EL OCR COLAPSA **DÉBITO EN `'04'`**
// (TARJETA DE CRÉDITO), Y EL MOTOR TIENE ESCRITO TRES ARCHIVOS MÁS ALLÁ QUE
// DÉBITO NO CUENTA PARA LISR 28-V.
//
// `normas/lisr-28-V.yaml:26-29` (verificado_fuente_primaria):
//
//   «Cuando a la documentación que ampare el gasto de alimentación el
//    contribuyente únicamente acompañe el comprobante fiscal relativo al
//    transporte, la deducción a que se refiere este párrafo **sólo procederá
//    cuando el pago se efectúe mediante tarjeta de crédito** de la persona que
//    realiza el viaje.»
//
// El motor lo sabía (`engine.ts`: «Débito ('28') NO cuenta: la ley pide crédito
// ('04'), no cualquier tarjeta») y el intake lo desmentía:
//
//   ocr.ts:43   forma_pago: z.enum(['efectivo', 'tarjeta', 'otro']).nullable()
//   ocr.ts:360  data.forma_pago === 'tarjeta' ? '04' : undefined
//
// El esquema del OCR **no tiene manera de distinguir crédito de débito** y el
// mapeo elige `'04'`, justo la clave que el motor interpreta como "cumple la
// condición". Resultado: tres comidas de $1,980 pagadas con la tarjeta de
// DÉBITO de la empresa salían dentro de "Deducible para ISR" y el aviso que el
// propio motor sabe redactar no se emitía nunca — fallo silencioso y en
// dirección sobre-afirmante.
//
// `ocr.ts` está fuera de esta partición y el enum no se puede ampliar desde
// aquí. Lo que sí se puede, y es lo correcto de todos modos: el motor deja de
// tratar un `'04'` NO respaldado por el XML como prueba de nada. Cuando el XML
// llega, `repo.ts` sobrescribe `forma_pago` con el `c_FormaPago` real —que sí
// distingue `04` de `28`— y entonces la condición se da por cumplida.
// Fail-closed: el aviso manda a revisar, no declara la deducción improcedente.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { cuadrarViaje } from './engine';
import { DEMO_CONFIG } from '../config';
import type { Gasto } from '@/types/likida';

const g = (over: Partial<Gasto>): Gasto => ({
  id: Math.random().toString(36).slice(2), concepto: 'otro', monto: 100, fecha: '2026-07-27', ...over,
});

const cuadrar = (gastos: Gasto[]) =>
  cuadrarViaje({
    viajeId: 'v-m9', anticipo: 20_000, gastos,
    politica: DEMO_CONFIG.politica, estimulos: DEMO_CONFIG.estimulos,
  });

const aviso = (gastos: Gasto[]) =>
  cuadrar(gastos).diferencias.filter((d) => d.tipo === 'alimentacion_transporte_sin_tarjeta_credito');

/** El viaje del escenario: hay transporte y NO hay hospedaje. */
const TRANSPORTE = g({ concepto: 'transporte', monto: 450, cfdiUuid: 'u-tr', xmlVerificado: true, formaPago: '03' });

describe('M9 · un `04` que solo vio el OCR no acredita "tarjeta de crédito" (LISR 28-V)', () => {
  it('el escenario del hallazgo: $1,980 en tres comidas con "tarjeta" leída del ticket → avisa', () => {
    // Timbradas por el portal (traen UUID) pero el XML todavía no se jala, así
    // que `formaPago` sigue siendo el que dedujo el OCR: '04' para CUALQUIER
    // tarjeta, débito incluido.
    const comidas = [660, 660, 660].map((m, i) =>
      g({ id: `c${i}`, concepto: 'alimentacion', monto: m, cfdiUuid: `u${i}`, formaPago: '04' }));
    const ds = aviso([...comidas, TRANSPORTE]);
    expect(
      ds,
      'el OCR mapea toda tarjeta a 04 (débito incluido): tomarlo por crédito es afirmar el único '
      + 'requisito de LISR 28-V que depende del medio de pago sin haberlo visto',
    ).toHaveLength(1);
    expect(ds[0].nota).toContain('$1,980.00');
    expect(ds[0].nota).toMatch(/tarjeta de crédito/i);
    expect(ds[0].monto, 'es un aviso a revisión, no una deducción declarada improcedente').toBe(0);
  });

  it('con el XML jalado, un 04 real SÍ cumple la condición y no avisa', () => {
    // `c_FormaPago` del CFDI distingue 04 (crédito) de 28 (débito): ahí el dato
    // es el que la ley pide.
    const r = aviso([
      g({ concepto: 'alimentacion', monto: 700, cfdiUuid: 'u1', xmlVerificado: true, formaPago: '04' }),
      TRANSPORTE,
    ]);
    expect(r).toHaveLength(0);
  });

  it('con el XML jalado y débito (28) sigue avisando — no cambió la regla de fondo', () => {
    const r = aviso([
      g({ concepto: 'alimentacion', monto: 700, cfdiUuid: 'u1', xmlVerificado: true, formaPago: '28' }),
      TRANSPORTE,
    ]);
    expect(r).toHaveLength(1);
  });

  it('la duda es SOLO del medio de pago: con hospedaje en el viaje no aplica', () => {
    const r = aviso([
      g({ concepto: 'alimentacion', monto: 700, cfdiUuid: 'u1', formaPago: '04' }),
      g({ concepto: 'hospedaje', monto: 900, cfdiUuid: 'u3', formaPago: '04' }),
      TRANSPORTE,
    ]);
    expect(r).toHaveLength(0);
  });
});
