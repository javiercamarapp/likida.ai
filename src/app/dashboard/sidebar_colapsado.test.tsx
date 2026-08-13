import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { MARCO_SIDEBAR } from '../marco';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO — ENTRE 768 Y 1023 px EL SIDEBAR CORTA LAS
// OCHO ETIQUETAS A DIEZ PÍXELES.
//
// La aritmética, con los números del árbol: `MARCO_SIDEBAR` es
// `w-[72px] lg:w-[232px] … overflow-hidden`. A 72 px, el `px-2` del `<nav>`
// deja 56; el `px-2.5` del item, 36; el ícono de 16 más el `gap-2.5` de 10 se
// comen 26 → quedan ≈10 px para "Combustible & Casetas". Y el encabezado
// "NEGOCIO" (11px, uppercase, ~55 px) sale como "NEG". Con `overflow-hidden`
// en el `aside` no hay elipsis ni scroll: se corta a filo, a mitad de letra.
//
// El rango no es exótico: es el iPad en vertical (768 px CSS) y el zoom de
// sala (150 % en un portátil de 1440 → 960 px CSS). Hasta `8d6ac51` ahí no se
// veía NADA porque el `<nav>` estaba vacío; hoy se ven ocho filas y dos
// encabezados de texto cortado.
//
// `/admin` ya tenía resuelto esto y escrito el criterio (`layout.tsx`:
// "colapsa a solo íconos entre md y lg", con `hidden lg:block` +
// `SidebarNavIconos`). `chrome.tsx` comparte `marco.ts` con él y no ese par.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/arco',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>{children}</a>
  ),
}));

const { default: SidebarNav } = await import('./sidebar-nav');
const CHROME = readFileSync('src/app/dashboard/chrome.tsx', 'utf8');

/** El texto visible de los enlaces (lo que se pinta DENTRO del `<a>`), sin
 *  atributos: es lo que el ancho de 72 px tiene que aguantar. */
function textoDeLinks(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, '').trim())
    .filter((t) => t.length > 0);
}

describe('el sidebar colapsado no pinta texto que no cabe', () => {
  it('EL BUG: en la variante de íconos ningún enlace lleva etiqueta en el flujo', () => {
    const html = renderToStaticMarkup(<SidebarNav rol="flota_admin" soloIconos />);
    expect(
      textoDeLinks(html),
      'estas etiquetas se cortan a ~10px dentro de una columna de 72 con overflow-hidden',
    ).toEqual([]);
  });

  it('el nombre sigue disponible: viaja en `title` y en `aria-label`', () => {
    // Quitar el texto no puede significar perder la información: colapsado, el
    // nombre se dice por tooltip nativo y por el árbol de accesibilidad.
    const html = renderToStaticMarkup(<SidebarNav rol="flota_admin" soloIconos />);
    expect(html).toContain('title="Combustible &amp; Casetas"');
    expect(html).toContain('aria-label="Combustible &amp; Casetas"');
    expect((html.match(/aria-label=/g) ?? []).length).toBe((html.match(/<a\b/g) ?? []).length);
  });

  it('los encabezados de sección tampoco se pintan colapsados ("NEGOCIO" salía "NEG")', () => {
    const html = renderToStaticMarkup(<SidebarNav rol="flota_admin" soloIconos />);
    expect(html).not.toContain('Negocio');
    expect(html).not.toContain('Cuenta');
  });

  it('no se pierde ni una puerta: colapsado salen los MISMOS href que abierto', () => {
    // El arreglo no puede achicar el menú. Es la regla que
    // `sidebar_puerta.test.tsx` defiende para el sidebar ancho.
    const hrefs = (soloIconos: boolean) => [
      ...renderToStaticMarkup(<SidebarNav rol="flota_admin" soloIconos={soloIconos} />)
        .matchAll(/href="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(hrefs(true)).toEqual(hrefs(false));
    expect(hrefs(true).length).toBeGreaterThan(1);
  });

  it('CONTROL: abierto, las etiquetas siguen escritas', () => {
    const html = renderToStaticMarkup(<SidebarNav rol="flota_admin" />);
    // El `&` sale como `&amp;` en el markup servido; se compara sin entidades.
    expect(textoDeLinks(html)).toContain('Combustible &amp; Casetas');
    expect(html).toContain('Negocio');
  });
});

describe('el marco monta las dos variantes en el breakpoint de la columna', () => {
  it('la columna sigue midiendo 72 abajo de `lg` — el arreglo es la variante, no ensancharla', () => {
    expect(MARCO_SIDEBAR).toContain('w-[72px]');
    expect(MARCO_SIDEBAR).toContain('lg:w-[232px]');
  });

  it('EL BUG: `chrome.tsx` pinta la variante de íconos abajo de `lg`', () => {
    const sin = CHROME.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(sin).toMatch(/hidden lg:block[^]*<SidebarNav rol=\{rol\} \/>/);
    expect(sin).toMatch(/lg:hidden[^]*<SidebarNav rol=\{rol\} soloIconos \/>/);
  });
});
