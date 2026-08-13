import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { marcaAsistente, estaExpandido, ANCHO_MIN_ASISTENTE } from './rail-marca';

const CSS = readFileSync(fileURLToPath(new URL('../globals.css', import.meta.url)), 'utf8');
const RAIL = readFileSync(fileURLToPath(new URL('./rail.tsx', import.meta.url)), 'utf8');

/** El cuerpo del bloque que empieza en `desde`, con las llaves balanceadas.
 *  Una regex no sirve: los `@media` de este archivo anidan selectores. */
function bloqueDesde(css: string, desde: number): string {
  const abre = css.indexOf('{', desde);
  let nivel = 0;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') nivel++;
    else if (css[i] === '}' && --nivel === 0) return css.slice(abre + 1, i);
  }
  throw new Error('bloque sin cerrar en globals.css');
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), ALTO — EL ASISTENTE EXPANDIDO DEJA EL PANEL
// INVISIBLE ABAJO DE 1280 px, Y NO HAY CÓMO REVERTIRLO. 6ª ronda.
//
// Tres piezas que no se hablaban:
//   · `rail.tsx`  → `<aside className="… hidden xl:flex …">` — el asistente
//     SOLO existe de 1280 px para arriba.
//   · `rail-marca.ts` → decide la marca mirando `expandido` y `pathname`,
//     nunca el ancho de la ventana.
//   · `globals.css` → `:root[data-asistente="expandido"] .columna-centro
//     { opacity: 0; pointer-events: none }` — a CUALQUIER ancho.
//
// El escenario con valores: /dashboard/combustible-casetas a 1440 px, el
// presentador expande el chat, no se lee en el proyector y sube el zoom del
// navegador a 125 %. El viewport CSS pasa a 1152 px, `hidden xl:flex` deja de
// pintar el `<aside>` — pero el componente NO se desmonta, así que la marca
// sigue puesta. Queda el sidebar, un fondo, y ningún control para revertirlo:
// el botón "Contraer chat" vivía dentro del `<aside>` que acabó de irse.
// Pantalla en blanco irrecuperable sin recargar, delante del comprador.
//
// El arreglo es de CSS y no de JS a propósito: la regla que retira el centro
// tiene que valer exactamente donde el asistente existe, y eso lo sabe el
// mismo motor que aplica `hidden xl:flex`. Con `matchMedia` habría dos fuentes
// del breakpoint (una en JS, otra en Tailwind) y volverían a separarse.
// ═══════════════════════════════════════════════════════════════════════════

describe('la columna del centro solo se retira donde el asistente EXISTE', () => {
  const OCULTA = ':root[data-asistente="expandido"] .columna-centro';

  it('EL BUG: la regla que esconde el centro vive dentro del breakpoint del asistente', () => {
    let i = CSS.indexOf(OCULTA);
    expect(i, 'ya no existe la regla que retira el centro').toBeGreaterThan(-1);
    while (i > -1) {
      const antes = CSS.slice(0, i);
      // El `@media` que la envuelve es el último abierto y no cerrado antes de
      // ella; basta con comprobar que el bloque del breakpoint la contiene.
      const media = antes.lastIndexOf(`@media (min-width: ${ANCHO_MIN_ASISTENTE}px)`);
      expect(media, `una copia de la regla vive fuera del breakpoint (offset ${i})`).toBeGreaterThan(-1);
      expect(bloqueDesde(CSS, media)).toContain(OCULTA);
      i = CSS.indexOf(OCULTA, i + 1);
    }
  });

  it('el breakpoint del CSS es el MISMO que el del `<aside>` (`xl` de Tailwind)', () => {
    // Si alguien mueve el asistente a `lg:flex` y no toca el CSS, el hueco
    // vuelve a abrirse en el rango que quede en medio.
    expect(RAIL, 'el rail dejó de esconderse en `xl` — revisa ANCHO_MIN_ASISTENTE').toContain('hidden xl:flex');
    expect(ANCHO_MIN_ASISTENTE, 'xl de Tailwind son 1280px').toBe(1280);
  });

  it('CONTROL: a ancho completo la regla sigue existiendo — el arreglo acota, no borra', () => {
    const media = CSS.indexOf(`@media (min-width: ${ANCHO_MIN_ASISTENTE}px)`);
    const cuerpo = bloqueDesde(CSS, media);
    expect(cuerpo).toContain('opacity: 0');
    expect(cuerpo).toContain('pointer-events: none');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — EL CHAT SE QUEDA "EXPANDIDO" AL NAVEGAR.
//
// `expandido` era un `useState(false)` que nadie reinicia, en un componente
// montado en el LAYOUT: sobrevive a la navegación. Con los clics que `8d6ac51`
// devolvió al sidebar:
//
//   sidebar → "Privacidad (ARCO)" → expandir el asistente
//   → sidebar → "Resumen" (el rail devuelve null, la marca se limpia, todo bien)
//   → sidebar → "Soporte & Quejas"
//
// …y el asistente reaparece A PANTALLA COMPLETA sobre una página que nunca se
// pidió así. En el pase 4 esto estaba anotado como "solo se alcanza tecleando
// URLs"; hoy son tres clics de sidebar.
//
// El arreglo NO es un `useEffect` que reinicie el estado (el repo tiene
// prohibido `set-state-in-effect`, ver `rail.tsx:61-63`): el estado deja de ser
// un booleano y pasa a ser LA RUTA en la que se pidió pantalla completa. Así la
// pregunta "¿está expandido AQUÍ?" es una derivación pura, sin efecto.
// ═══════════════════════════════════════════════════════════════════════════
describe('estaExpandido — pantalla completa es de UNA página, no de la sesión', () => {
  it('EL BUG: expandir en ARCO y navegar a Soporte NO deja el chat a pantalla completa', () => {
    expect(estaExpandido('/dashboard/arco', '/dashboard/soporte')).toBe(false);
  });

  it('la secuencia entera de los tres clics del sidebar', () => {
    // 1. en ARCO se pide pantalla completa
    expect(estaExpandido('/dashboard/arco', '/dashboard/arco')).toBe(true);
    // 2. clic en "Resumen": ahí el rail ni se pinta
    expect(estaExpandido('/dashboard/arco', '/dashboard')).toBe(false);
    // 3. clic en "Soporte & Quejas": la página se ve, no el chat encima
    expect(estaExpandido('/dashboard/arco', '/dashboard/soporte')).toBe(false);
  });

  it('sin haber expandido nada, nunca está expandido', () => {
    expect(estaExpandido(null, '/dashboard/arco')).toBe(false);
    expect(estaExpandido(null, '/dashboard')).toBe(false);
  });

  it('CONTROL: en su propia página, expandir sigue funcionando y sigue retirando el centro', () => {
    // Si esto se pusiera rojo, el arreglo habría matado "pantalla completa"
    // en vez de acotarla a la página donde se pidió.
    expect(estaExpandido('/dashboard/soporte', '/dashboard/soporte')).toBe(true);
    expect(marcaAsistente(estaExpandido('/dashboard/soporte', '/dashboard/soporte'), '/dashboard/soporte'))
      .toBe('expandido');
  });

  it('y `rail.tsx` guarda la RUTA, no un booleano suelto', () => {
    // El componente no se puede montar en vitest (no hay jsdom), así que lo
    // que se ancla aquí es que el estado que sobrevive a la navegación ya no
    // es el booleano: si alguien vuelve a `useState(false)`, esto se pone rojo.
    expect(RAIL).not.toMatch(/useState\(false\)/);
    expect(RAIL).toContain('estaExpandido(');
  });
});
