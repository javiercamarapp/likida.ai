'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { type Item, SIDEBAR_PRINCIPAL, FISCAL, NEGOCIO, GESTION } from './rutas';
import { puedeVerRuta } from '@/lib/auth/visibilidad';
import { DEGRADADO_MARCA_TINTA_BLANCA } from './resumen-visual';

const ITEM = 'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors';

/** El mismo item, colapsado a solo ícono — cuadrado de 36px centrado, sin
 *  hueco para texto. Ver `SidebarNav({ soloIconos })`. */
const ITEM_ICONO = 'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors';

/** Mismo degradado que los KPI de Resumen (una sola fuente) — el mockup usa
 *  ese mismo tono para el item activo del sidebar, no el naranja plano.
 *  `hover` solo aplica al item INACTIVO: el activo no necesita indicar que es
 *  clickeable, ya dice dónde estás.
 *
 *  Es la variante DE TINTA BLANCA (AUDITORÍA 17, pase 5): el texto va en
 *  `--marca-fg` (#ffffff) y sobre la rampa clara medía 2.57:1. */
function claseItem(activo: boolean, soloIconos = false): string {
  const base = soloIconos ? ITEM_ICONO : ITEM;
  return activo
    ? `${base} font-medium`
    : `${base} hover:bg-[color-mix(in_srgb,var(--muted)_10%,transparent)]`;
}
function estiloItem(activo: boolean) {
  return activo ? { background: DEGRADADO_MARCA_TINTA_BLANCA, color: 'var(--marca-fg)' } : undefined;
}
function estiloIcono(activo: boolean) {
  return { width: 16, height: 16, strokeWidth: 1.75, color: activo ? 'var(--marca-fg)' : 'var(--muted)' } as const;
}

/** Mismo patrón que admin/sidebar-nav.tsx, sin el plegado: la dirección
 *  visual del 7-ago quiere el sidebar siempre abierto, como una sola lista —
 *  el título de sección se queda como separador de lectura, no como botón. */
function Seccion({ titulo, items, sufijo, pathname, soloIconos }: { titulo: string; items: Item[]; sufijo: string; pathname: string; soloIconos: boolean }) {
  // Una sección que quedó sin un solo item para este rol no se pinta: un
  // encabezado "Documentos & Dinero" con nada debajo le anuncia al encargado
  // justo lo que no puede ver.
  if (items.length === 0) return null;

  return (
    <div className={soloIconos ? 'flex flex-col items-center gap-1' : undefined}>
      {/* El encabezado NO cabe colapsado: "NEGOCIO" a 11px son ~55px y la
          columna deja 36 — salía "NEG". Sin él, los íconos siguen agrupados
          por el espacio entre secciones. */}
      {!soloIconos && (
        <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {titulo}
        </div>
      )}
      {items.map(({ href, nombre, Icono }) => (
        <ItemNav key={href} href={href} nombre={nombre} Icono={Icono}
          activo={pathname === href} sufijo={sufijo} soloIconos={soloIconos} />
      ))}
    </div>
  );
}

/**
 * Un link del sidebar, en sus dos anchos.
 *
 * Colapsado, el nombre viaja en `title` (tooltip nativo) y en `aria-label`:
 * NO se recorta con `truncate` ni se esconde con `hidden` un texto que ya no
 * cabe — se quita del flujo y se dice por otro canal.
 */
function ItemNav({
  href, nombre, Icono, activo, sufijo, soloIconos,
}: { href: string; nombre: string; Icono: Item['Icono']; activo: boolean; sufijo: string; soloIconos: boolean }) {
  return (
    <Link
      href={`${href}${sufijo}`}
      className={claseItem(activo, soloIconos)}
      style={estiloItem(activo)}
      title={soloIconos ? nombre : undefined}
      aria-label={soloIconos ? nombre : undefined}
      // AUDITORÍA 17 (pase 5), BAJO — el estado activo se comunicaba SOLO con
      // color (el degradado), así que un lector de pantalla oía ocho enlaces
      // idénticos sin saber en cuál está parado. `aria-current="page"` es el
      // atributo que lo dice; el color se queda como refuerzo, no como único
      // canal.
      aria-current={activo ? 'page' : undefined}
    >
      <Icono {...estiloIcono(activo)} />{soloIconos ? null : <> {nombre}</>}
    </Link>
  );
}

/**
 * Sidebar de /dashboard — mismo patrón visual que admin/sidebar-nav.tsx,
 * navegación propia (rutas.ts).
 *
 * `sufijo`: cuando un superadmin llega viendo una flota real (`?tenant=`) o
 * la demo (`?vista=demo`), CADA link del sidebar tiene que cargar ese mismo
 * parámetro — si no, "Viajes" te bota de vuelta al tenant demo aunque
 * estuvieras viendo una flota ejemplo. Un flota_admin/operador/contador
 * real nunca trae ninguno de los dos params (entra por /login sin
 * query string), así que para ellos `sufijo` siempre es vacío y esto no
 * hace nada distinto de un link normal.
 */
export default function SidebarNav({ rol, soloIconos = false }: { rol: string; soloIconos?: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const tenant = sp.get('tenant');
  const vista = sp.get('vista');
  // EL SUPERADMIN QUE LLEGA A UNA SUBPÁGINA SIN PARÁMETRO SE EXPULSABA SOLO.
  //
  // `/dashboard` a secas rebota a /admin cuando el rol es superadmin y no
  // trae `?tenant=` ni `?vista=demo` (tenant-efectivo.ts, `esRaiz`): es su
  // consola, no la de un cliente. Pero las SUBpáginas no rebotan — caen al
  // tenant demo sin más. Así que entrar directo a /dashboard/despacho (link
  // pegado, bookmark) dejaba el sufijo vacío, y el link de "Resumen"
  // apuntaba a /dashboard pelón: el propio sidebar te sacaba del panel que
  // estabas viendo. Para superadmin sin parámetro se asume `?vista=demo`,
  // que es el tenant al que las subpáginas ya lo mandaron.
  //
  // Para los otros cuatro roles esto no cambia nada: nunca traen ninguno de
  // los dos params y su sufijo sigue siendo vacío.
  const base = tenant
    ? `?tenant=${tenant}`
    : vista ? `?vista=${vista}`
    : rol === 'superadmin' ? '?vista=demo' : '';

  // "Ver como" (`?rol=`) tiene que viajar en CADA link igual que `?tenant=`:
  // si un solo link lo pierde, el siguiente clic te devuelve a tu propia
  // vista de superadmin y la comparación se rompe sin avisar.
  const rolVista = sp.get('rol');
  const sufijo = rolVista ? `${base}${base ? '&' : '?'}rol=${rolVista}` : base;

  // El rol con el que se FILTRA el menú es el previsualizado, no el real —
  // pero solo si el real es superadmin, misma regla que `rolEfectivo` aplica
  // del lado del servidor. Duplicarla aquí es a propósito: este componente es
  // cliente y no puede llamar a la del servidor, y las dos son la misma línea.
  const rolMenu = rol === 'superadmin' && rolVista ? rolVista : rol;

  // Se filtra con la MISMA función que gatea la página (`visibilidad.ts`).
  // Dos listas separadas —una para pintar y otra para autorizar— se
  // desincronizan, y el modo de falla es el peor: el link existe, el clic
  // rebota, y el usuario cree que la app está rota.
  const visibles = (items: Item[]) => items.filter((it) => puedeVerRuta(rolMenu, it.href));

  const resumenActivo = pathname === '/dashboard';

  return (
    <>
      {puedeVerRuta(rolMenu, '/dashboard') && (
        <div className={soloIconos ? 'flex flex-col items-center gap-1' : undefined}>
          <ItemNav href="/dashboard" nombre="Resumen" Icono={LayoutGrid}
            activo={resumenActivo} sufijo={sufijo} soloIconos={soloIconos} />
        </div>
      )}
      {/* Plano, sin encabezado — dirección visual del 7-ago-2026, los 9 que
          importan todos los días. */}
      {visibles(SIDEBAR_PRINCIPAL).map(({ href, nombre, Icono }) => (
        <ItemNav key={href} href={href} nombre={nombre} Icono={Icono}
          activo={pathname === href} sufijo={sufijo} soloIconos={soloIconos} />
      ))}
      {/* El panel del contador SÍ necesita su sección propia: es su única
          casa, y no aparece en SIDEBAR_PRINCIPAL (esa lista es la del
          dueño). Para un rol sin área `dinero` esto sale vacío y no se
          pinta (ver `Seccion`). */}
      <Seccion titulo="Fiscal" items={visibles(FISCAL)} sufijo={sufijo} pathname={pathname} soloIconos={soloIconos} />
      {/* AUDITORÍA 17 (pase 4), CRÍTICO — estas dos listas llevaban desde
          `2be4b1c` vivas en `rutas.ts` y sin llegar nunca al render. Mientras
          SIDEBAR_PRINCIPAL tenía sus 9 items el hueco no se veía; al vaciarse
          para el rediseño, el dueño se quedó con UN link y el contador con
          NINGUNO —`puedeVerRuta('contador','/dashboard')` es false—, con siete
          páginas vivas alcanzables solo tecleando la URL. Se pintan por
          `Seccion`, que ya se esconde sola cuando el rol no ve ni un item, y
          se filtran con el mismo `puedeVerRuta` que gatea la página. */}
      <Seccion titulo="Negocio" items={visibles(NEGOCIO)} sufijo={sufijo} pathname={pathname} soloIconos={soloIconos} />
      <Seccion titulo="Cuenta" items={visibles(GESTION)} sufijo={sufijo} pathname={pathname} soloIconos={soloIconos} />
    </>
  );
}
