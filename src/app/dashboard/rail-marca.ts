// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 2), CRÍTICO frontend — la marca que retira el centro.
//
// `globals.css:217` esconde `.columna-centro` (opacity 0 + pointer-events
// none) mientras la raíz del documento lleve `data-asistente="expandido"`.
// Poner esa marca es correcto SOLO donde el asistente se está pintando: ahí
// el chat ocupa la pantalla y el botón de contraer está a la vista.
//
// En `/dashboard` el rail devuelve `null` (rail.tsx) porque el Resumen del
// dueño va a ancho completo. Renderizar `null` no desmonta el componente, así
// que la limpieza del efecto no corre y la marca sobrevivía a la navegación:
// el Resumen se pintaba invisible y sin ningún control para revertirlo.
//
// Por eso la regla mira las DOS cosas. Vive aparte de `rail.tsx` para poder
// anclarla con una prueba sin necesitar jsdom, que este repo no tiene.
// ═══════════════════════════════════════════════════════════════════════════

/** La única ruta del panel que NO pinta el rail del asistente: el Resumen del
 *  dueño, a ancho completo (dirección visual del 7-ago-2026). La comparten
 *  `rail.tsx` (para devolver `null`) y `marcaAsistente` (para no marcar), que
 *  es justo la desincronización que causó el hallazgo. */
export const RUTA_SIN_RAIL = '/dashboard';

/** El ancho mínimo (px) al que el asistente EXISTE: `hidden xl:flex` en
 *  `rail.tsx`, o sea el `xl` de Tailwind. Abajo de aquí el `<aside>` no se
 *  pinta —pero el componente NO se desmonta—, así que la regla de `globals.css`
 *  que retira la columna del centro tiene que estar acotada al mismo número: si
 *  no, el panel se queda invisible sin ningún botón para revertirlo (AUDITORÍA
 *  17, pase 5, ALTO). Vive aquí para que una prueba pueda cruzar el CSS contra
 *  el componente; el valor real lo aplica Tailwind. */
export const ANCHO_MIN_ASISTENTE = 1280;

/** ¿El chat está a pantalla completa EN ESTA PÁGINA?
 *
 *  AUDITORÍA 17 (pase 5), MEDIO — `expandido` era un `useState(false)` en un
 *  componente montado en el LAYOUT, así que sobrevivía a la navegación: se
 *  expandía en ARCO y el chat reaparecía tapando Soporte tres clics después.
 *  Reiniciarlo con un `useEffect` está prohibido en este repo
 *  (`react-hooks/set-state-in-effect`, ver la nota de `rail.tsx`), así que el
 *  estado deja de ser un booleano: guarda LA RUTA donde se pidió pantalla
 *  completa, y "¿está expandido aquí?" pasa a ser una derivación pura. */
export function estaExpandido(expandidoEn: string | null, pathname: string): boolean {
  return expandidoEn !== null && expandidoEn === pathname;
}

/** Qué debe valer `document.documentElement.dataset.asistente` para este
 *  estado. `null` = sin marca, el centro se ve. */
export function marcaAsistente(expandido: boolean, pathname: string): 'expandido' | null {
  if (!expandido) return null;
  if (pathname === RUTA_SIN_RAIL) return null;
  return 'expandido';
}
