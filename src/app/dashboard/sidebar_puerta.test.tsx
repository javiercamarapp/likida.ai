import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { puedeVerRuta } from '@/lib/auth/visibilidad';
import { TODAS_LAS_RUTAS } from './rutas';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 4), CRÍTICO — el panel se quedó sin navegación.
//
// `2be4b1c` vació SIDEBAR_PRINCIPAL y FISCAL para el rediseño, y esas son las
// DOS únicas listas que `sidebar-nav.tsx` importaba. NEGOCIO y GESTION nunca
// se vaciaron —`rutas.ts` las declara explícitamente como "no se tocó"— pero
// tampoco llegaban nunca al render: el dueño veía UN item ("Resumen") y el
// contador NINGUNO, porque `puedeVerRuta('contador','/dashboard')` es false.
// Siete páginas vivas sin un solo clic que llevara a ellas, entre ellas
// `/dashboard/arco` (plazo de 20 días hábiles del art. 32 LFPDPPP).
//
// POR QUÉ ESTA PRUEBA Y NO OTRA. El guardarraíl que debía cazarlo
// (`visibilidad.test.ts:85-125`) sigue verde: arma su lista `todas` de las SEIS
// constantes de sección, no de las que el componente lee. Es el patrón "arnés
// que aparenta" — cubre la regla y no el cableado. Así que esto renderiza el
// componente REAL y afirma sobre los `href` que salen del HTML, que es lo único
// que el contralor puede clickear. Si mañana alguien agrega una lista a
// `rutas.ts` y olvida importarla en el sidebar, esta prueba se pone roja.
// ═══════════════════════════════════════════════════════════════════════════

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(''),
}));

// El `next/link` real arrastra el router de app-router, que no existe fuera de
// Next. Lo que esta prueba mide es el `href`, y eso un <a> lo dice igual.
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { default: SidebarNav } = await import('./sidebar-nav');

/** Los `href` que de verdad salen renderizados, sin el sufijo de query. */
function hrefsPintados(rol: string): string[] {
  const html = renderToStaticMarkup(<SidebarNav rol={rol} />);
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
}

/** Lo que ese rol DEBERÍA poder clickear, según la única fuente de verdad. */
function hrefsEsperados(rol: string): string[] {
  return TODAS_LAS_RUTAS.filter((i) => puedeVerRuta(rol, i.href)).map((i) => i.href);
}

describe('el sidebar pinta TODA ruta que el rol puede ver', () => {
  it.each(['flota_admin', 'contador', 'encargado'])(
    'a %s no le falta ninguna puerta',
    (rol) => {
      const pintados = new Set(hrefsPintados(rol));
      const faltantes = hrefsEsperados(rol).filter((h) => !pintados.has(h));
      expect(
        faltantes,
        `${rol} puede ver estas rutas pero el sidebar no las pinta — solo se llega tecleando la URL:\n  ${faltantes.join('\n  ')}`,
      ).toEqual([]);
    },
  );

  it('el contador no se queda con el menú en blanco', () => {
    // Es la vista que Javier abre en el demo desde `admin/selector-vista.tsx:54`.
    // `puedeVerRuta('contador','/dashboard')` es false —/dashboard es área
    // `operacion`—, así que sin NEGOCIO ni GESTION el <nav> salía VACÍO.
    expect(hrefsPintados('contador').length).toBeGreaterThan(0);
  });

  it('el sidebar nunca ofrece una ruta que el rol NO puede ver', () => {
    // La otra dirección: pintar de más es peor que pintar de menos — el link
    // existe, el clic rebota, y el usuario cree que la app está rota.
    for (const rol of ['flota_admin', 'contador', 'encargado']) {
      const deMas = hrefsPintados(rol).filter((h) => !puedeVerRuta(rol, h));
      expect(deMas, `${rol} ve links que no le tocan: ${deMas.join(', ')}`).toEqual([]);
    }
  });
});
