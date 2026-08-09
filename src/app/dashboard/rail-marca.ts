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

/** Qué debe valer `document.documentElement.dataset.asistente` para este
 *  estado. `null` = sin marca, el centro se ve. */
export function marcaAsistente(expandido: boolean, pathname: string): 'expandido' | null {
  if (!expandido) return null;
  if (pathname === RUTA_SIN_RAIL) return null;
  return 'expandido';
}
