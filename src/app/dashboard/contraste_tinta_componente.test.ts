import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COLOR_REGION } from './top-rutas';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — LAS TRES TARJETAS QUE ABREN EL DEMO PINTABAN
// BLANCO SOBRE EL DEGRADADO NARANJA A 2.1:1 – 2.6:1.
//
// "Gasto total", "Costo por viaje" y "Ahorro generado — Ejercicio 2026" son lo
// primero que ve el contralor, y el sitio donde una sala iluminada castiga
// más. Medido con la fórmula de WCAG 2.1 (la misma de `contraste.test.ts`):
//
//   etiqueta 12px, blanco al 85% sobre ≈#ed8839 …… 2.09:1   (AA pide 4.5)
//   cifra 20px semibold, blanco puro …………………… 2.57:1   (AA pide 3)
//   item activo del sidebar, 14px ………………………… 2.57:1   (AA pide 4.5)
//
// POR QUÉ LA PRUEBA QUE YA EXISTÍA NO PODÍA CAZARLO. `contraste.test.ts` mide
// `--color-ok`, `--color-bad` y `--faint` CONTRA `--surface` y `--bg`: tokens
// contra el fondo de la app. Aquí la tinta va sobre un color del COMPONENTE (un
// degradado inline), y eso queda fuera de su universo por construcción — el
// mismo agujero deja pasar cualquier `text-white` o `#0891b2` escrito a mano.
//
// Por eso esta prueba muestrea el degradado ENTERO (cada 5%), no sus extremos:
// el texto vive en el borde izquierdo de una tarjeta de ~360×90 con el
// degradado a 135°, así que el color efectivo bajo la etiqueta es un punto
// intermedio y no una de las dos paradas.
// ═══════════════════════════════════════════════════════════════════════════

const CSS = readFileSync(fileURLToPath(new URL('../globals.css', import.meta.url)), 'utf8');
const VISUAL = readFileSync(fileURLToPath(new URL('./resumen-visual.tsx', import.meta.url)), 'utf8');
const SIDEBAR = readFileSync(fileURLToPath(new URL('./sidebar-nav.tsx', import.meta.url)), 'utf8');

/** Luminancia relativa (WCAG 2.1, 1.4.3). Misma fórmula que `contraste.test.ts`. */
function luminancia(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contraste(a: string, b: string): number {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (bajo + 0.05);
}
/** Interpolación en sRGB, que es como el navegador pinta un `linear-gradient`
 *  por defecto. */
function mezcla(a: string, b: string, t: number): string {
  return '#' + [1, 3, 5].map((i) => {
    const x = parseInt(a.slice(i, i + 2), 16), y = parseInt(b.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  }).join('');
}

/** El hex de una variable declarada en el `:root {}` de `globals.css`. Se lee
 *  del archivo, nunca de una copia en la prueba: una copia se queda vieja en
 *  silencio y entonces se mide un color que ya no se sirve. */
function token(nombre: string): string {
  const m = CSS.match(new RegExp(`${nombre}:\\s*(#[0-9a-fA-F]{6})`));
  expect(m, `no encontré ${nombre} en globals.css`).not.toBeNull();
  return m![1].toLowerCase();
}

/** Las dos paradas de un `linear-gradient(135deg, var(--a) 0%, var(--b) 100%)`
 *  declarado como constante en el fuente, ya resueltas a hex. */
function paradasDe(fuente: string, constante: string): [string, string] {
  const m = fuente.match(new RegExp(`${constante}\\s*=\\s*'linear-gradient\\([^']*'`));
  expect(m, `no encontré la constante ${constante}`).not.toBeNull();
  const vars = [...m![0].matchAll(/var\((--[a-z0-9-]+)\)/g)].map((v) => token(v[1]));
  expect(vars.length, `${constante} ya no tiene dos paradas`).toBe(2);
  return [vars[0], vars[1]];
}

/** El peor contraste de una tinta contra CUALQUIER punto del degradado. */
function peorSobre(tinta: string, [a, b]: [string, string]): number {
  let peor = Infinity;
  for (let t = 0; t <= 1.0001; t += 0.05) peor = Math.min(peor, contraste(tinta, mezcla(a, b, t)));
  return peor;
}

const AA_TEXTO = 4.5;
const BLANCO = '#ffffff';

describe('la tinta blanca de las tarjetas de KPI, medida sobre su propio degradado', () => {
  const rampa = () => paradasDe(VISUAL, 'DEGRADADO_MARCA_TINTA_BLANCA');

  it('EL BUG: blanco puro pasa AA en TODO el recorrido, no solo en el extremo oscuro', () => {
    // Con la rampa vieja (`--g3` → `--marca`) esto valía 2.36:1.
    expect(peorSobre(BLANCO, rampa())).toBeGreaterThanOrEqual(AA_TEXTO);
  });

  it('la etiqueta de 12px ya no va translúcida — al 85% medía 4.17:1', () => {
    // `opacity` cambia la tinta efectiva, así que una etiqueta al 85% no está
    // cubierta por la medición de arriba. La forma barata de garantizarlo es
    // que no haya opacidad sobre el texto de la tarjeta.
    // Sin comentarios: la prosa que EXPLICA el arreglo cita la clase
    // prohibida, y una prueba que lee comentarios se dispara con su propia
    // documentación (mismo recorte que `ahorro_sin_dato.test.ts`).
    const i = VISUAL.indexOf('export function KpiDegradado');
    const cuerpo = VISUAL.slice(i).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(cuerpo, 'volvió una clase de opacidad sobre la tinta de la tarjeta').not.toMatch(/opacity-8\d/);
  });

  it('los tintes de la tendencia (↑/↓ vs periodo anterior) también pasan', () => {
    const hexes = [...VISUAL.matchAll(/tendencia\.bueno \? '(#[0-9a-f]{6})' : '(#[0-9a-f]{6})'/g)][0];
    expect(hexes, 'no encontré los colores de la tendencia').toBeTruthy();
    for (const c of [hexes[1], hexes[2]]) {
      expect(peorSobre(c, rampa()), `${c} sobre el degradado`).toBeGreaterThanOrEqual(AA_TEXTO);
    }
  });

  it('el item activo del sidebar usa la MISMA rampa y su tinta también pasa', () => {
    // Es el mismo defecto en otro archivo: `--marca-fg` (#ffffff) sobre el
    // degradado. Si alguien lo devuelve a `DEGRADADO_MARCA`, esto se pone rojo.
    expect(SIDEBAR).toContain('DEGRADADO_MARCA_TINTA_BLANCA');
    expect(peorSobre(token('--marca-fg'), rampa())).toBeGreaterThanOrEqual(AA_TEXTO);
  });

  it('CONTROL: el hero conserva su rampa clara, que con tinta OSCURA sí pasa', () => {
    // El arreglo no es "oscurecer la marca en todas partes": el hero escribe en
    // #1a1207 sobre `--g3` a 7.85:1 y está bien como está. Lo que no funciona
    // es blanco sobre el extremo claro.
    const claro = paradasDe(VISUAL, 'DEGRADADO_MARCA');
    expect(contraste('#1a1207', claro[0])).toBeGreaterThanOrEqual(AA_TEXTO);
  });
});

describe('los colores escritos a mano en un componente también son tinta', () => {
  it('EL BUG: las siete regiones de Top rutas pasan AA sobre la superficie', () => {
    // "Golfo" (#0891b2) medía 3.68:1 — texto de 12px, sin excepción de texto
    // grande que lo salve. Las otras seis ya pasaban (5.02 – 6.28:1).
    const superficie = '#ffffff'; // --surface en modo claro
    for (const [region, color] of Object.entries(COLOR_REGION)) {
      expect(contraste(color, superficie), `${region} (${color})`).toBeGreaterThanOrEqual(AA_TEXTO);
    }
  });
});
