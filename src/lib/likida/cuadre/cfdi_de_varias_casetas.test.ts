import { describe, it, expect } from 'vitest';
import { copiasDeComprobante } from './engine';
import type { Gasto } from '@/types/likida';

// ═══════════════════════════════════════════════════════════════════════════
// A4-FIS-C1 — UN CFDI QUE AMPARA OCHO CASETAS NO SON SIETE COPIAS. 16-ago-2026.
//
// La migración 0065 existe exactamente para este caso y lo dice literal:
//
//     "CAPUFE no factura ticket por ticket: se capturan los datos fiscales UNA
//      vez, se validan N códigos de caseta contra la misma pantalla y al final
//      se emite UNA sola factura con todos. Ocho casetas de un viaje = ocho
//      filas de `gasto` y UN `cfdi_uuid`."
//
// Para distinguir ese caso del duplicado de verdad, la 0065 agregó
// `gasto.cfdi_orden` (1..N, `default 1`) y cambió el índice único a
// `(tenant_id, cfdi_uuid, cfdi_orden)`. Dos escritores lo llenan hoy:
// `facturacion/al_vuelo.ts:518` e `intake/consolidado.ts:176`.
//
// `copiasDeComprobante` nunca se enteró: deduplica por `cfdiUuid` a secas. Las
// ocho casetas entran con el mismo UUID, la primera queda como original y las
// SIETE restantes salen marcadas como copias suyas — fuera del total
// comprobado, fuera del deducible y fuera de la base del estímulo de peaje.
//
// Con ocho casetas de $1,000 en un lote de CAPUFE, al contralor se le imprime
// "$1,000 comprobados" y al operador se le cobra una diferencia de $7,000 que
// sí gastó y sí está facturada.
//
// El otro lado —dos fotos del MISMO comprobante— sigue detectándose sin tocar
// nada: ambas filas nacen con `cfdi_orden` 1 (el `default` de la 0065), así que
// comparten llave y la segunda sigue siendo copia de la primera.
// ═══════════════════════════════════════════════════════════════════════════

/** Una caseta del lote de CAPUFE: mismo CFDI, su propio `cfdiOrden`. */
const caseta = (id: string, orden: number): Gasto =>
  ({
    id,
    concepto: 'peaje',
    monto: 1000,
    cfdiUuid: 'B0800A68-1111-2222-3333-444455556666',
    cfdiOrden: orden,
  }) as unknown as Gasto;

describe('A4-FIS-C1 — un CFDI que ampara varias casetas (mig. 0065)', () => {
  it('EL FALLO: ocho casetas con UN CFDI no son siete copias', () => {
    const lote = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => caseta(`c${n}`, n));

    const copias = copiasDeComprobante(lote);

    expect(
      copias.size,
      'las ocho casetas están amparadas por el mismo CFDI y son ocho gastos distintos',
    ).toBe(0);
  });

  it('los $7,000 que se borraban del comprobado siguen contados', () => {
    const lote = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => caseta(`c${n}`, n));

    const copias = copiasDeComprobante(lote);
    const comprobado = lote
      .filter((g) => !copias.has(g.id))
      .reduce((s, g) => s + g.monto, 0);

    expect(comprobado, 'ocho casetas de $1,000 son $8,000, no $1,000').toBe(8000);
  });

  it('el duplicado DE VERDAD sigue cazado: mismo UUID y mismo `cfdiOrden`', () => {
    // Dos fotos del mismo XML en una ráfaga de WhatsApp. Ambas nacen con el
    // `default 1` de la 0065: misma llave, la segunda es copia de la primera.
    const copias = copiasDeComprobante([caseta('a', 1), caseta('b', 1)]);

    expect(copias.get('b'), 'el mismo comprobante dos veces sigue siendo copia').toBe('a');
    expect(copias.size).toBe(1);
  });

  it('sin `cfdiOrden` se comporta como antes: mismo UUID ⇒ copia', () => {
    // Filas viejas, anteriores a que el escritor llenara la columna. El
    // `default 1` de la base las deja todas en la misma llave.
    const sinOrden = (id: string) =>
      ({
        id,
        concepto: 'peaje',
        monto: 1000,
        cfdiUuid: 'B0800A68-1111-2222-3333-444455556666',
      }) as unknown as Gasto;

    const copias = copiasDeComprobante([sinOrden('a'), sinOrden('b')]);

    expect(copias.get('b')).toBe('a');
    expect(copias.size).toBe(1);
  });

  it('dos CFDI distintos no se cruzan aunque compartan `cfdiOrden`', () => {
    const copias = copiasDeComprobante([
      { ...caseta('a', 1), cfdiUuid: 'AAAAAAAA-1111-2222-3333-444455556666' } as Gasto,
      { ...caseta('b', 1), cfdiUuid: 'BBBBBBBB-1111-2222-3333-444455556666' } as Gasto,
    ]);

    expect(copias.size).toBe(0);
  });
});
