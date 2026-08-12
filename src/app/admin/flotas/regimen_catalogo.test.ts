import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { REGIMENES } from '@/lib/saas/fiscal';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), ALTO — el alta de flota ofrecía ocho regímenes que la
// base rechaza, y escondía tres que acepta.
//
// El `<select>` de `/admin/flotas` traía su catálogo escrito a mano: once
// claves del `c_RegimenFiscal` del SAT. El CHECK vigente
// (`tenant_regimen_fiscal_dominio`, redefinido por la 0088) acepta seis, y no
// son las mismas seis:
//
//   ofrecidas y RECHAZADAS: 605, 606, 607, 608, 610, 611, 615, 616  (ocho)
//   aceptadas y NO ofrecidas: 603, 621, 626                        (tres)
//
// Entra esto → sale esto mal: se da de alta "TRANSPORTES DEMO SA DE CV" y se
// elige «605 — Sueldos y Salarios» (o cualquiera de las otras siete). El
// UPDATE choca contra el CHECK, Postgres contesta `23514 check_violation` y el
// alta se cae en la cara de quien la está haciendo — en el demo, Javier.
// Y al revés duele más callado: una flota RESICO (`626`), que es el régimen de
// media flota chica en México, NO SE PUEDE CAPTURAR. Se queda en «Sin
// declarar», y ese hueco viaja al `tax_system` del CFDI que Likida le emite.
//
// El pase 4 arregló ESTE MISMO modo de falla en el otro catálogo
// (`src/lib/saas/fiscal.ts`, commit `12cc8c6`) añadiéndole el `624` que le
// faltaba. Arregló un valor, no la clase: quedaron dos catálogos escritos a
// mano para la misma columna, y el segundo estaba peor que el primero.
//
// Por eso esta prueba mira las DOS cosas: que el catálogo compartido siga
// cuadrando con el CHECK, y que la página no vuelva a escribir el suyo.
// ═══════════════════════════════════════════════════════════════════════════

const PAGINA = 'src/app/admin/flotas/page.tsx';

/** Las claves que el CHECK de `tenant.regimen_fiscal` acepta HOY. */
function regimenesQueLaBaseAcepta(): string[] {
  const dir = 'supabase/migrations';
  const re = /add constraint tenant_regimen_fiscal_dominio\s+check \(\s*regimen_fiscal is null or regimen_fiscal in \(([\s\S]*?)\)\s*\)\s*;/i;
  let ultimo: string[] | null = null;
  // Corren en orden de número: la última que redefine el dominio es la vigente.
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(`${dir}/${f}`, 'utf8').replace(/--[^\n]*/g, '');
    const m = sql.match(re);
    if (m) ultimo = [...m[1].matchAll(/'([0-9]{3})'/g)].map((x) => x[1]);
  }
  if (!ultimo) throw new Error('ninguna migración define tenant_regimen_fiscal_dominio');
  return ultimo.sort();
}

/** El cuerpo del `<select name="regimenFiscal">` de la página de alta. */
function bloqueDelSelect(): string {
  const src = readFileSync(PAGINA, 'utf8');
  const ini = src.indexOf('name="regimenFiscal"');
  expect(ini, `${PAGINA} ya no tiene el select de régimen fiscal`).toBeGreaterThan(-1);
  const fin = src.indexOf('</select>', ini);
  expect(fin, 'el select de régimen fiscal no cierra').toBeGreaterThan(ini);
  return src.slice(ini, fin);
}

describe('el alta de flota ofrece exactamente los regímenes que la base acepta', () => {
  it('el catálogo compartido cuadra con el CHECK vigente, en las dos direcciones', () => {
    const base = regimenesQueLaBaseAcepta();
    const catalogo: string[] = REGIMENES.map((r) => r.clave as string).sort();

    expect(catalogo.filter((c) => !base.includes(c)),
      'REGIMENES ofrece claves que el CHECK rechaza: el guardado revienta con 23514').toEqual([]);
    expect(base.filter((c) => !catalogo.includes(c)),
      'el CHECK acepta claves que REGIMENES no ofrece: esa flota no se puede capturar').toEqual([]);
  });

  it('la página NO escribe su propio catálogo — lo toma del compartido', () => {
    const bloque = bloqueDelSelect();
    // El bug no era una clave suelta: era que existía un segundo catálogo. Si
    // alguien vuelve a teclear `<option value="605">` aquí, esto se pone rojo
    // aunque la clave que teclee sí sea válida hoy.
    const aMano = [...bloque.matchAll(/<option value="([0-9]{3})"/g)].map((m) => m[1]);
    expect(aMano,
      `${PAGINA} vuelve a tener el catálogo de regímenes escrito a mano. `
      + 'Es la misma divergencia que la 0088 destapó en `src/lib/saas/fiscal.ts`: '
      + 'dos listas para la misma columna terminan diciendo cosas distintas.').toEqual([]);
    expect(bloque, 'la página no deriva su lista de REGIMENES').toContain('REGIMENES');
  });

  it('sigue habiendo una opción vacía, y es la que el navegador elige por default', () => {
    const bloque = bloqueDelSelect();
    // Sin opción vacía, `defaultValue=""` no empata nada y el navegador
    // selecciona la PRIMERA — que hoy sería `624 Coordinados`. Un alta que
    // nadie tocó saldría declarada como coordinado.
    expect(bloque, 'el select perdió su opción vacía').toContain('<option value="">');
    expect(bloque).toContain('defaultValue=""');
    const vacia = bloque.indexOf('<option value="">');
    const primeraConValor = bloque.search(/<option value="[^"]/) >= 0
      ? bloque.search(/<option value="[^"]/) : Number.MAX_SAFE_INTEGER;
    expect(vacia, 'la opción vacía quedó después de una con valor').toBeLessThan(primeraConValor);
  });
});
