// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), ALTO — UN CFDI **PPD** SALÍA IMPRESO "DEDUCIBLE PARA
// ISR", CON EL IVA ACREDITADO Y LOS LITROS CONTADOS, SIN QUE EL MOTOR HAYA
// VISTO UN SOLO MEDIO DE PAGO.
//
// LISR 27-III enumera los medios que la ley acepta para deducir: transferencia,
// cheque nominativo, tarjeta de crédito/débito/servicios, monedero electrónico
// autorizado. El motor implementaba la regla al revés: detectaba **un medio
// prohibido** (`'01'`, efectivo) y trataba TODO lo demás como permitido.
//
// El caso que lo destapa es el más común de una flota de verdad. Una flota con
// línea de crédito en su estación recibe CFDI **PPD** (Pago en Parcialidades o
// Diferido), y el SAT obliga ahí a `FormaPago = 99` — "Por definir". El 99 no
// es un medio de pago: es la declaración explícita de que **todavía no se sabe
// cuál fue**. Se documenta después, en el complemento de pago (REP).
//
// Con `99`, el motor:
//   · no disparaba `combustible_efectivo` (solo mira `'01'`)         → deducible
//   · `pagoElectronico = !!formaPago && formaPago !== '01'` → true   → litros
//   · nada bloqueaba el acreditamiento                               → IVA
//
// y el PDF imprimía las tres afirmaciones con su artículo al lado. El pago pudo
// haber sido en efectivo, y entonces ninguna de las tres es cierta: contaría
// contra el 15% de la RFA 2.9 y los litros no serían elegibles.
//
// Las tres van en dirección **sobre-afirmante**, que es la peor para este
// producto: el contralor deduce contra un papel que Likida le dio, y en una
// revisión quien responde es él. Es justo la práctica que `leyendas.ts:9-11`
// identifica como indebida del prestador del servicio.
//
// La regla correcta es fail-closed y ya estaba escrita —en el COMENTARIO de
// `engine.ts:1049-1051`, que nombra los cuatro medios de la LIF 20-A-IV—; lo
// que faltaba era implementarla.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { cuadrarViaje, cubetaDe } from './engine';
import { DEMO_CONFIG } from '../config';
import type { Gasto } from '@/types/likida';

/** Diésel de una flota con línea de crédito: CFDI real, timbrado PPD. */
const DIESEL_PPD = {
  id: 'g-ppd',
  concepto: 'diesel',
  monto: 18560,
  fecha: '2026-08-06',
  folio: '99001',
  folioNorm: '99001',
  rfcEmisor: 'CGC1005243I3',
  ocrConfianza: 1,
  // 99 = "Por definir". El SAT lo OBLIGA en PPD. No es un medio de pago.
  formaPago: '99',
  subTotal: 16000,
  ocrExtra: { producto: 'DIESEL', litros: 660, precioUnitario: 28.12, ivaMonto: 2560, ivaTasa: 0.16 },
  xmlVerificado: true,
  cfdiUuid: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  claveProdServ: '15101505',
  claveUnidad: 'LTR',
  tipoComprobante: 'I',
  complementoHidrocarburos: true,
  rfcReceptor: 'GMX0902279I1',
  ivaTraslado: 2560,
  iepsTraslado: 0,
} as unknown as Gasto;

/** El mismo comprobante, pero pagado con transferencia (LISR 27-III lo acepta). */
const DIESEL_TRANSFERENCIA = { ...DIESEL_PPD, formaPago: '03' } as unknown as Gasto;

function liquidar(gastos: Gasto[]) {
  return cuadrarViaje({
    viajeId: 'prueba-ppd',
    anticipo: 25000,
    gastos,
    politica: [{ concepto: 'diesel', topeMonto: 30000 }],
    ruta: 'prueba',
    hoy: '2026-08-08',
    estimulos: DEMO_CONFIG.estimulos,
    hidrocarburos: DEMO_CONFIG.hidrocarburos,
  });
}

describe('un CFDI PPD (FormaPago 99) no afirma nada sobre el medio de pago', () => {
  it('NO cae en la cubeta deducible: el medio de pago no está acreditado', () => {
    const liq = liquidar([DIESEL_PPD]);
    const suyas = liq.diferencias.filter((d) => d.gastoId === 'g-ppd');
    expect(
      cubetaDe(DIESEL_PPD, suyas),
      'con FormaPago 99 el motor no vio ningún medio de pago: afirmar "Deducible '
      + 'para ISR" es sobre-afirmar sobre un requisito de LISR 27-III que nadie verificó',
    ).toBe('por_confirmar');
  });

  it('lo dice con una diferencia propia, no lo esconde', () => {
    const d = liquidar([DIESEL_PPD]).diferencias.find((x) => x.tipo === 'medio_pago_no_acreditado');
    expect(d, 'no hay diferencia que explique por qué el gasto quedó por confirmar').toBeTruthy();
    expect(d!.gastoId).toBe('g-ppd');
    // El contralor tiene que poder actuar: el dato que falta es el REP.
    expect(d!.nota).toMatch(/99|definir/i);
  });

  it('NO acredita los 660 L del estímulo de IEPS', () => {
    // LIF 2026 art. 20-A-IV, 4º párrafo: monedero, tarjeta, cheque nominativo o
    // transferencia. `99` no es ninguno, y no tiene la válvula del 15% que la
    // RFA 2.9 sí concede para ISR.
    expect(liquidar([DIESEL_PPD]).litrosDieselAcreditables ?? 0).toBe(0);
  });

  it('NO acredita los $2,560 de IVA', () => {
    expect(liquidar([DIESEL_PPD]).ivaAcreditable).toBe(0);
  });

  it('el MISMO comprobante con transferencia sí acredita — la guarda no apaga el camino bueno', () => {
    const liq = liquidar([DIESEL_TRANSFERENCIA]);
    const suyas = liq.diferencias.filter((d) => d.gastoId === 'g-ppd');
    expect(cubetaDe(DIESEL_TRANSFERENCIA, suyas)).toBe('deducible');
    expect(liq.litrosDieselAcreditables).toBe(660);
    expect(liq.ivaAcreditable).toBeCloseTo(2560, 2);
    expect(liq.diferencias.some((d) => d.tipo === 'medio_pago_no_acreditado')).toBe(false);
  });

  it('el efectivo sigue tratándose como efectivo, no como "no acreditado"', () => {
    // Regresión: `01` tiene su propia regla (y su facilidad del 15%). La guarda
    // nueva no debe robársela ni duplicar la diferencia.
    const enEfectivo = { ...DIESEL_PPD, formaPago: '01' } as unknown as Gasto;
    const liq = liquidar([enEfectivo]);
    expect(liq.diferencias.some((d) => d.tipo === 'medio_pago_no_acreditado')).toBe(false);
    expect(liq.diferencias.some((d) => d.tipo.startsWith('combustible_efectivo')
      || d.tipo.startsWith('efectivo_'))).toBe(true);
  });
});
