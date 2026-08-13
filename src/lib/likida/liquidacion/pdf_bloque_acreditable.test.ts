// ═══════════════════════════════════════════════════════════════════════════
// EL BLOQUE "ACREDITABLE / RECUPERABLE" NO SE PUEDE ESCRIBIR ENCIMA DEL
// DESCARGO DEL PIE.
//
// Compañera de M8 y B4 (auditoría 17, pase 5). Los dos hallazgos añaden texto
// AL PIE de sus renglones —el qualifier del IVA (LIVA 5) y el desglose de
// litros por fecha de compra—, y el bloque reservaba 90pt fijos
// (`asegurar(90)`) calculados cuando el renglón del IVA no tenía ni un pie. Con
// los tres renglones y sus pies, el bloque pasa de 90pt y se escribía sobre la
// zona del pie, que es donde vive el descargo del art. 52 del CFF: el papel se
// vuelve ilegible justo donde declara sus límites.
//
// La zona del pie (`PISO_PIE = 90`) se respeta en TODAS las hojas a propósito,
// para que el salto de página no tenga que saber cuál es la última. Esta prueba
// lo comprueba sobre el PDF RENDERIZADO, no sobre la intención del código, y
// barre el número de comprobantes para caer sí o sí en el caso frontera —el
// bloque llegando al final de la hoja.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { generarLiquidacionPDF } from './pdf';
import { filasAcreditables } from './acreditable';
import type { Liquidacion, Viaje, Operador, Gasto } from '@/types/likida';

const PISO_PIE = 90;

/** Los renglones dibujados con su posición (mismo lector que `pdf_cifras`). */
async function renglones(bytes: Uint8Array): Promise<Array<{ y: number; texto: string }>> {
  const { inflateSync } = await import('node:zlib');
  const buf = Buffer.from(bytes);
  let raw = '';
  for (let i = 0; i < buf.length; i++) {
    // OJO: `endstream` TAMBIÉN contiene «stream». Sin este descarte, el lector
    // toma el cierre del primer flujo por la apertura del segundo, se come el
    // resto y un PDF de dos hojas se lee como si tuviera una — que es
    // exactamente el caso que esta prueba existe para mirar.
    if (buf[i] === 0x73 && buf.subarray(i, i + 6).toString('latin1') === 'stream'
      && buf.subarray(i - 3, i).toString('latin1') !== 'end') {
      let ini = i + 6;
      while (buf[ini] === 0x0d || buf[ini] === 0x0a) ini++;
      const fin = buf.indexOf(Buffer.from('endstream'), ini);
      if (fin < 0) continue;
      try { raw += inflateSync(buf.subarray(ini, fin)).toString('latin1'); } catch { /* no comprimido */ }
      i = fin;
    }
  }
  raw = raw.replace(/<([0-9A-Fa-f]+)>\s*Tj/g, (_m, hex: string) => Buffer.from(hex, 'hex').toString('latin1'));
  return [...raw.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\n([^\n]*)\n/g)]
    .map((m) => ({ y: Number(m[2]), texto: m[3] }));
}

const VIAJE: Viaje = { id: 'v1', folio: 'VJ-9', origen: 'Mérida', destino: 'Cancún', anticipo: 200000 };
const OPERADOR: Operador = { id: 'o1', nombre: 'Juan Pérez', telefono: '+52', terminal: 'Mérida' };

const gasto = (i: number): Gasto => ({
  id: `g${i}`, concepto: 'diesel', monto: 1000, folio: `F${i}`, fecha: '2026-08-0'
    + String((i % 5) + 1), cfdiUuid: `u${i}`,
  ocrExtra: { litros: 100 },
} as unknown as Gasto);

const liqCon = (n: number): Liquidacion => ({
  id: 'l-acred', viajeId: 'v1', creadaEn: '2026-08-10T10:00:00Z',
  totalComprobado: n * 1000, totalAnticipo: 200000, diferencia: 200000 - n * 1000,
  estatus: 'cuadrada', totalDeducible: n * 1000, totalNoDeducible: 0, totalPorConfirmar: 0,
  iepsAcreditable: 0, litrosDieselAcreditables: n * 100, ivaAcreditable: 41300, peajeAcreditable: 500,
  diferencias: [], gastos: Array.from({ length: n }, (_, i) => gasto(i)),
});

/** Fin del bloque: lo primero que `pdf.ts` dibuja después de él. */
const SIGUIENTE_SECCION = /^(LO QUE SE LE REEMBOLSA|DIFERENCIAS DETECTADAS|Generado por Likida)/;

/**
 * Los renglones del bloque acreditable, en orden de dibujado: del encabezado
 * hasta la siguiente sección. Se toman del PDF, no de la intención del código.
 */
function bloqueAcreditable(rs: Array<{ y: number; texto: string }>) {
  const i = rs.findIndex((r) => r.texto.includes('ACREDITABLE / RECUPERABLE'));
  if (i < 0) return [];
  const resto = rs.slice(i);
  const fin = resto.findIndex((r, k) => k > 0 && SIGUIENTE_SECCION.test(r.texto.trim()));
  return fin < 0 ? resto : resto.slice(0, fin);
}

describe('el bloque acreditable respeta la zona del pie en todas las hojas', () => {
  it('con los tres renglones y sus pies, nada del bloque baja de PISO_PIE', async () => {
    // Se barre el número de comprobantes para atravesar el caso frontera: con
    // uno solo el bloque siempre cabe, y el fallo aparece cuando la tabla deja
    // el cursor a media hoja.
    for (const n of [1, 6, 12, 18, 24, 30, 36]) {
      const liq = liqCon(n);
      const rs = await renglones(await generarLiquidacionPDF(liq, VIAJE, OPERADOR));
      const delBloque = bloqueAcreditable(rs);
      // Control: si el bloque no se encontrara, el mínimo saldría de un arreglo
      // vacío y la prueba pasaría por vacío.
      const esperados = filasAcreditables(liq)!;
      expect(delBloque.length, `no se encontró el bloque acreditable con ${n} comprobantes`)
        .toBeGreaterThan(esperados.filas.length * 2);
      const masBajo = Math.min(...delBloque.map((r) => r.y));
      expect(masBajo, `con ${n} comprobantes el bloque acreditable invade la zona del pie (y=${masBajo})`)
        .toBeGreaterThanOrEqual(PISO_PIE);
    }
  });
});
