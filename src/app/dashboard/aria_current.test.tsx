import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), BAJO — EL SIDEBAR NO LE DICE A UN LECTOR DE PANTALLA
// EN QUÉ PÁGINA ESTÁS.
//
// El estado activo se comunicaba SOLO con `style={estiloItem(activo)}`, o sea
// con color: `grep -rn "aria-current" src/app` daba CERO ocurrencias en todo el
// producto. Un usuario de lector de pantalla oye ocho enlaces idénticos en
// estructura y no sabe cuál corresponde a la pantalla que tiene abierta — y el
// único indicador que había es justo el degradado que reprobaba contraste
// (hallazgo de arriba).
//
// Un producto que se le vende al departamento de administración de una flota
// topa con esto en la primera revisión de accesibilidad de un cliente
// corporativo.
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

describe('el enlace de la página abierta se anuncia como tal', () => {
  it('EL BUG: hay exactamente UN aria-current="page", y es el de la ruta abierta', () => {
    const html = renderToStaticMarkup(<SidebarNav rol="flota_admin" />);
    const marcados = [...html.matchAll(/<a[^>]*aria-current="page"[^>]*>/g)].map((m) => m[0]);
    expect(marcados, 'ningún enlace se anuncia como la página actual').toHaveLength(1);
    expect(marcados[0]).toContain('href="/dashboard/arco"');
  });

  it('los demás enlaces NO lo llevan — si todos lo llevaran, no diría nada', () => {
    const html = renderToStaticMarkup(<SidebarNav rol="flota_admin" />);
    const enlaces = (html.match(/<a\b/g) ?? []).length;
    expect(enlaces).toBeGreaterThan(1);
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
  });

  it('el `<nav>` que los contiene tiene nombre accesible', () => {
    // Con dos `<nav>` en la página (panel y, en /admin, consola) uno sin
    // nombre se anuncia como "navegación" a secas.
    expect(readFileSync('src/app/dashboard/chrome.tsx', 'utf8')).toMatch(/<nav aria-label="/);
  });

  it('la consola de /admin, que tenía el MISMO hueco, también lo cierra', () => {
    const src = readFileSync('src/app/admin/sidebar-nav.tsx', 'utf8');
    expect(src).toContain('aria-current');
    expect(readFileSync('src/app/admin/layout.tsx', 'utf8')).toMatch(/<nav aria-label="/);
  });
});
