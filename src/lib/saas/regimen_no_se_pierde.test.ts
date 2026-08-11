import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REGIMENES } from './fiscal';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 4), ALTO — el catálogo con el que la FLOTA captura su
// propio régimen no incluía `624`, y guardar el formulario lo reescribía a
// `601` en silencio.
//
// Son dos catálogos del mismo `c_RegimenFiscal` en el mismo repo, y los dos
// escriben la MISMA columna, `tenant.regimen_fiscal`:
//   · `admin/flotas/page.tsx:223` — el que usa Javier al dar de alta la flota.
//     SÍ trae 624, desde el arreglo del CRÍTICO C3 del pase 2.
//   · `saas/fiscal.ts` REGIMENES — el que usa el DUEÑO en Plan & Facturación.
//     No lo traía.
//
// El escenario no necesita un error de nadie: `forma.tsx:174-178` pinta el
// <select> con `defaultValue` y sin opción vacía, así que un `624` guardado no
// empataba ninguna <option> y el navegador seleccionaba la PRIMERA sin avisar.
// El dueño entra a corregir su código postal, guarda, y su régimen queda en
// `601` — Título II general, que no es su Capítulo VII.
//
// LA CONSECUENCIA, VERIFICADA CONTRA EL CÓDIGO. El auditor del pase 4 la
// escribió como "le apaga la facilidad del 15%", y eso es FALSO: la
// elegibilidad vive en `tenant.config.facilidadCombustibleEfectivo`
// (`cuadre/desde_db.ts:56`, `likida/fiscal.ts:220`, `tools.ts:116`), que solo
// escriben `crearFlota` y `actualizarFacilidad15` — `guardarDatosFiscales`
// nunca toca `config`. El motor de cuadre no se entera.
//
// Lo que SÍ pasa, y por eso esto sigue siendo ALTO: `tenant.regimen_fiscal` es
// la columna que viaja al receptor del CFDI que Likida le emite a la flota
// (`getDatosFiscales` → `facturacion/flota_fiscal.ts:84` →
// `adaptadores/registro.ts:133` → `saas/facturapi.ts:183`, `tax_system`). Un
// coordinado termina recibiendo su factura timbrada con el régimen equivocado,
// y de paso `regimen_fiscal` y `config.regimenElegible` quedan diciendo cosas
// distintas sobre la misma flota sin que nada lo señale.
//
// SE LEE EL CÓDIGO FUENTE de `administracion.ts` a propósito, en vez de repetir
// aquí la lista: si mañana alguien agrega un tercer régimen elegible, esta
// prueba lo exige también en el catálogo de la flota. Copiar la lista probaría
// la copia. Mismo patrón que `dashboard/estatus.test.ts`.
// ═══════════════════════════════════════════════════════════════════════════

/** Los que `administracion.ts` considera elegibles, leídos de su fuente. */
function regimenesElegibles(): string[] {
  const src = readFileSync('src/lib/likida/administracion.ts', 'utf8');
  const m = src.match(/REGIMENES_ELEGIBLES\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error('no se encontró REGIMENES_ELEGIBLES en administracion.ts');
  return [...m[1].matchAll(/'([0-9]{3})'/g)].map((x) => x[1]);
}

describe('el régimen del dueño sobrevive a guardar sus datos fiscales', () => {
  it('todo régimen que el alta reconoce, la flota lo puede elegir', () => {
    const claves = new Set(REGIMENES.map((r) => r.clave as string));
    const faltantes = regimenesElegibles().filter((c) => !claves.has(c));
    expect(
      faltantes,
      `el alta (/admin/flotas) reconoce estos regímenes pero la flota no los puede\n` +
      `elegir en Plan & Facturación (saas/fiscal.ts REGIMENES): ${faltantes.join(', ')}.\n` +
      `Guardar esa forma los reescribe con el primero de la lista, y esa columna es\n` +
      `la que viaja al receptor del CFDI (facturapi.ts:183, tax_system).`,
    ).toEqual([]);
  });

  it('624 Coordinados está, y es el que la RFA 2.9 nombra', () => {
    // Explícito además del barrido: 624 es el caso de Transportes Innovativos,
    // y el que el mapeo viejo confundía con 601 (Título II general).
    const r = REGIMENES.find((x) => x.clave === '624');
    expect(r, '624 no está en el catálogo de Plan & Facturación').toBeDefined();
    expect(r!.nombre.toLowerCase()).toContain('coordinado');
  });

  it('601 sigue existiendo y NO se rotula como coordinados', () => {
    // El error que cerró el CRÍTICO C3 fue exactamente ese rótulo. Que no
    // vuelva por este otro catálogo.
    const r = REGIMENES.find((x) => x.clave === '601');
    expect(r).toBeDefined();
    expect(r!.nombre.toLowerCase()).not.toContain('coordinado');
  });
});
