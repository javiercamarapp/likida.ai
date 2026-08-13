import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — SOPORTE IMPRIMÍA CATEGORÍA, PRIORIDAD Y
// ESTADO CRUDOS DEL CHECK CONSTRAINT.
//
// Un ticket abierto por facturación, prioridad alta, ya contestado y esperando
// al cliente salía así:
//
//     facturacion · alta · en_proceso
//
// Sin acento en "facturacion", con guion bajo en "en_proceso", todo en
// minúscula — y en la misma fila donde la fecha SÍ se formatea con `fechaMx`.
// Era la única de las ocho páginas vivas sin mapa de etiquetas: `arco` mapea
// sus 4 tipos, `estatus.ts` cubre los 3 de `EstatusLiquidacion` (con prueba),
// `combustible-casetas` cubre los 5 motivos uno por uno.
//
// La prueba lee los dominios de la MIGRACIÓN, no de una lista copiada aquí:
// una copia se queda vieja en silencio y entonces se valida contra sí misma.
// ═══════════════════════════════════════════════════════════════════════════

const PAGINA = readFileSync('src/app/dashboard/soporte/page.tsx', 'utf8');
const MIG = readFileSync('supabase/migrations/0051_soporte_y_cotizacion.sql', 'utf8');

/** Los valores de un `check (x in ('a','b'))` de la migración. */
function dominio(constraint: string): string[] {
  const i = MIG.indexOf(constraint);
  expect(i, `no encontré ${constraint} en la migración`).toBeGreaterThan(-1);
  const decl = MIG.slice(i, MIG.indexOf('))', i));
  const vals = [...decl.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  expect(vals.length, `no se pudo leer el dominio de ${constraint}`).toBeGreaterThan(1);
  return vals;
}

/** Un mapa literal del fuente de la página. */
function mapa(nombre: string): Record<string, string> {
  const i = PAGINA.indexOf(`const ${nombre}: Record<string, string> = {`);
  expect(i, `la página ya no declara ${nombre}`).toBeGreaterThan(-1);
  const bloque = PAGINA.slice(i, PAGINA.indexOf('};', i));
  const out: Record<string, string> = {};
  for (const m of bloque.matchAll(/(\w+):\s*'([^']*)'/g)) out[m[1]] = m[2];
  return out;
}

describe('la cola de tickets se lee en español, no en snake_case', () => {
  it.each([
    ['CATEGORIA', 'ticket_categoria_dominio'],
    ['PRIORIDAD', 'ticket_prioridad_dominio'],
    ['ESTADO', 'ticket_estado_dominio'],
  ])('EL BUG: %s cubre los valores del constraint, uno por uno', (nombre, constraint) => {
    const m = mapa(nombre);
    for (const v of dominio(constraint)) {
      expect(m[v], `falta etiqueta para "${v}" — sale crudo en pantalla`).toBeTruthy();
      expect(m[v], `"${v}" se etiqueta consigo mismo`).not.toBe(v);
    }
  });

  it('las tres columnas usan el mapa, no el valor crudo', () => {
    const sin = PAGINA.replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const campo of ['categoria', 'prioridad', 'estado']) {
      expect(sin, `la columna ${campo} volvió al valor crudo`).not.toMatch(new RegExp(`\\{t\\.${campo}\\}`));
    }
    expect(sin).toMatch(/etiqueta\(CATEGORIA, t\.categoria\)/);
    expect(sin).toMatch(/etiqueta\(PRIORIDAD, t\.prioridad\)/);
    expect(sin).toMatch(/etiqueta\(ESTADO, t\.estado\)/);
  });

  it('EL OTRO BUG: la insignia de estado ya no pinta alerta para cualquier ticket abierto', () => {
    // Pintaba `warn` (naranja) para todo lo que no fuera resuelto/cerrado, así
    // que un ticket recién levantado con 23 h de SLA por delante llevaba la
    // misma insignia que uno vencido — y una alerta que siempre está encendida
    // entrena a ignorarla. La urgencia la dice la columna de SLA, que sí la mide.
    const sin = PAGINA.replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const i = sin.indexOf('<StatusPill');
    const pill = sin.slice(i, sin.indexOf('>', i));
    expect(pill, 'la píldora de estado sigue gritando warn por omisión').not.toContain("'warn'");
    expect(pill).toContain("'ok'");
  });

  it('CONTROL: el reloj de SLA sigue marcando en rojo lo vencido', () => {
    // Si esto se pusiera rojo, el arreglo habría apagado la única señal real
    // de urgencia en vez de acotar la falsa.
    expect(PAGINA).toContain('var(--bad)');
    expect(PAGINA).toContain('vencido hace');
  });
});
