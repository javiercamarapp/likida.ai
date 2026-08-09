import { describe, it, expect } from 'vitest';
import { marcaAsistente } from './rail-marca';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 2), CRÍTICO frontend — EL PANEL DEL DUEÑO EN BLANCO.
//
// `globals.css:217` retira la columna del centro cuando la raíz del documento
// lleva `data-asistente="expandido"`:
//
//     :root[data-asistente="expandido"] .columna-centro {
//       opacity: 0; transform: translateX(-24px); pointer-events: none;
//     }
//
// El rail ponía esa marca mirando UNA sola cosa, `expandido`, y la limpiaba en
// el `return` del efecto — que corre al DESMONTAR o al cambiar `expandido`.
//
// Pero en `/dashboard` el rail no se desmonta: se renderiza `null`
// (`rail.tsx:82`, la dirección visual del 7-ago — el Resumen va a ancho
// completo, sin asistente al lado). Renderizar `null` NO es desmontar, así que
// la limpieza no corre.
//
// Dos clics del flujo normal del demo:
//   1. en /dashboard/cuadre, "Expandir chat a pantalla completa"
//      → raíz marcada, el centro se retira (correcto: el chat ocupa todo)
//   2. clic en "Resumen" del sidebar, que sigue clickeable bajo el chat
//      → pathname pasa a /dashboard, el rail devuelve null y DESAPARECE el
//        botón de contraer… con la marca todavía puesta.
//
// Resultado: el Resumen del dueño se pinta con `opacity: 0` y
// `pointer-events: none`. Pantalla en blanco, sin un solo control visible que
// lo revierta — solo recargando. En la sala, delante del contralor.
//
// La decisión es de una función pura para poder anclarla: este repo no tiene
// jsdom, así que lo que esta prueba fija es la REGLA (qué marca corresponde a
// cada estado), no el cableado del efecto. Ver la nota al pie.
// ═══════════════════════════════════════════════════════════════════════════

describe('marcaAsistente — la marca que retira la columna del centro', () => {
  it('EL BUG: expandido y en /dashboard NO debe marcar — ahí el rail no se pinta y no hay botón para contraer', () => {
    // Esta es la línea que fallaba: la regla vieja solo miraba `expandido`,
    // así que aquí devolvía 'expandido' y el Resumen quedaba invisible.
    expect(marcaAsistente(true, '/dashboard')).toBeNull();
  });

  it('la secuencia completa del demo: expandir en /cuadre, luego ir a Resumen', () => {
    // 1. expandido en una página con rail → se retira el centro, a propósito
    expect(marcaAsistente(true, '/dashboard/cuadre')).toBe('expandido');
    // 2. mismo estado `expandido`, otra ruta → la marca se cae sola
    expect(marcaAsistente(true, '/dashboard')).toBeNull();
  });

  it('sin expandir nunca se marca, esté donde esté', () => {
    expect(marcaAsistente(false, '/dashboard')).toBeNull();
    expect(marcaAsistente(false, '/dashboard/cuadre')).toBeNull();
  });

  it('CONTROL: en las páginas que sí pintan el rail, expandir sigue retirando el centro', () => {
    // Si esta se pusiera roja, el arreglo habría matado la función de
    // "pantalla completa" en vez de acotarla.
    for (const ruta of ['/dashboard/cuadre', '/dashboard/gastos', '/dashboard/arco', '/dashboard/facturacion']) {
      expect(marcaAsistente(true, ruta)).toBe('expandido');
    }
  });
});

// ── LO QUE ESTA PRUEBA NO ANCLA ───────────────────────────────────────────
// Que `rail.tsx` llame a `marcaAsistente` con el `pathname` vivo y escriba el
// resultado en `document.documentElement`. Eso es cableado de DOM y el repo no
// tiene entorno jsdom (por eso la cobertura de UI sigue pendiente, ver
// REPORTE-ESTADO §2). Un `grep` del nombre de la función sería una prueba de
// proxy —la clase de prueba que la ronda 17 ya tuvo que acotar en
// `ruta_pdf_sincronizada.test.ts`— así que no se escribe.
