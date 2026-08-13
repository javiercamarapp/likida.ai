import type { ModoPeriodo } from './actividad';

// ═══════════════════════════════════════════════════════════════════════════
// CÓMO SE LEE CADA VENTANA DE TIEMPO. UNA VEZ.
//
// AUDITORÍA 17 (pase 5), MEDIO — un pill gobierna CINCO secciones del Resumen
// (Viajes, Actividad, Gasto por categoría, Liquidado, Top rutas) y ninguna
// decía de qué ventana hablaba. El contralor deja el pill en "Histórico", baja
// a "Liquidado", ve $2,840,500.00 y lo cita como el mes: el pill quedó cinco
// secciones arriba, fuera del scroll.
//
// La forma correcta ya estaba a la vista en las tarjetas de al lado —
// `kpi-periodo.tsx` rotula `${nombre} — ${ETIQUETA_MODO[modo]}` y
// `motor-fiscal-periodo.tsx` imprime la ventana bajo cada cifra—, pero cada
// uno tenía su copia del mapa. Ésta es la única, y `Record<ModoPeriodo,…>`
// hace que un cuarto modo rompa la compilación en vez de salir en blanco.
// ═══════════════════════════════════════════════════════════════════════════

export const ETIQUETA_MODO: Record<ModoPeriodo, string> = {
  semanal: 'últimos 7 días',
  mensual: 'últimos 30 días',
  historico: 'histórico',
};
