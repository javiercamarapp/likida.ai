import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { leerArchivoUniversal, ArchivoNoSoportado, MAX_EXTRACTO } from './archivo';

describe('leerArchivoUniversal — el lector del chat', () => {
  it('lee un Excel: hojas, filas y extracto tabulado', async () => {
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
      ['Concepto', 'Monto'], ['Diésel', 8340.5], ['Casetas', 1200],
    ]), 'Gastos');
    const buf = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const r = await leerArchivoUniversal('gastos.xlsx', buf);
    expect(r.clase).toBe('hoja');
    expect(r.extracto).toContain('Diésel | 8340.5');
    expect(r.meta).toContainEqual(['Filas', 3]);
  });

  it('lee un CSV por la misma vía', async () => {
    const r = await leerArchivoUniversal('viajes.csv', Buffer.from('folio,anticipo\nF-1,8000\nF-2,5500\n'));
    expect(r.clase).toBe('hoja');
    expect(r.extracto).toContain('F-1 | 8000');
  });

  it('recorta el texto gigante y lo DICE (nunca lectura silenciosamente parcial)', async () => {
    const r = await leerArchivoUniversal('log.txt', Buffer.from('x'.repeat(MAX_EXTRACTO * 2)));
    expect(r.extracto.length).toBeLessThanOrEqual(MAX_EXTRACTO + 60);
    expect(r.extracto).toContain('[recortado');
  });

  it('un XML de CFDI extrae los campos que importan', async () => {
    const xml = `<cfdi:Comprobante Total="1855.00" Fecha="2026-08-10T11:22:33"><cfdi:Emisor Rfc="ABC123456XYZ"/><cfdi:Receptor Rfc="DEF987654ABC"/><tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-555555555555"/></cfdi:Comprobante>`;
    const r = await leerArchivoUniversal('factura.xml', Buffer.from(xml));
    expect(r.clase).toBe('cfdi');
    expect(r.meta).toContainEqual(['Total', '1855.00']);
    expect(r.meta).toContainEqual(['RFC emisor', 'ABC123456XYZ']);
  });

  it('lee un PDF REAL generado con pdf-lib', async () => {
    const doc = await PDFDocument.create();
    const fuente = await doc.embedFont(StandardFonts.Helvetica);
    const pagina = doc.addPage();
    pagina.drawText('Estado de cuenta TAG - total del periodo 4520.75 MXN en casetas de la ruta Silao Monterrey', { x: 40, y: 700, size: 12, font: fuente });
    const buf = Buffer.from(await doc.save());
    const r = await leerArchivoUniversal('estado-tag.pdf', buf);
    expect(r.clase).toBe('pdf');
    expect(r.extracto).toContain('4520.75');
    expect(r.meta).toContainEqual(['Páginas leídas', 1]);
  }, 20_000);

  // ═══════════════════════════════════════════════════════════════════════
  // AUDITORÍA 17 (pase 6), CRÍTICO fiscal N1 — LAS PRIMERAS PÁGINAS QUE NUNCA
  // SE LEEN.
  //
  // `archivo.ts:59` pedía `getText({ last: MAX_PAGINAS_PDF })` con el
  // comentario "«last» acota páginas". Acota, sí: por el FINAL. El README de
  // pdf-parse lo dice con todas sus letras (líneas 198-199):
  //
  //     - Use `first` to render the first N pages
  //     - Use `last` to render the last N pages
  //
  // Un estado de cuenta de TAG de 30 páginas entraba SIN las páginas 1 a 5 —
  // la portada, que es donde vive el total del periodo—, el globo del chat
  // decía "Páginas leídas: 25" sin denominador, y el extracto no llevaba
  // ninguna marca de que faltara nada. El contralor pregunta por su gasto de
  // casetas y el agente contesta con lo que sobró.
  //
  // El oráculo es la página 1: si el lector arranca por el principio, su
  // texto está; si arranca por el final, no.
  // ═══════════════════════════════════════════════════════════════════════
  it('EL BUG: un PDF más largo que el tope se lee desde la PRIMERA página, no desde la última', async () => {
    const doc = await PDFDocument.create();
    const fuente = await doc.embedFont(StandardFonts.Helvetica);
    // 30 páginas > MAX_PAGINAS_PDF (25). Cada una se identifica sola.
    for (let i = 1; i <= 30; i++) {
      doc.addPage().drawText(`PAGINA-${i} del estado de cuenta`, { x: 40, y: 700, size: 12, font: fuente });
    }
    const buf = Buffer.from(await doc.save());
    const r = await leerArchivoUniversal('estado-tag-30.pdf', buf);

    // La portada y las cuatro que le siguen: son las que se perdían.
    expect(r.extracto).toContain('PAGINA-1 ');
    expect(r.extracto).toContain('PAGINA-5 ');
    // CONTROL: el tope sigue vigente — no se lee el PDF entero.
    expect(r.extracto).not.toContain('PAGINA-30 ');
  }, 30_000);

  it('lo que no conoce lo rechaza con nombre, no lo finge', async () => {
    await expect(leerArchivoUniversal('video.mp4', Buffer.from('x'))).rejects.toBeInstanceOf(ArchivoNoSoportado);
  });
});
