import { describe, it, expect } from 'vitest';
import { respuestaDelTurno } from './chat';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 3 — FE-C1 (CRÍTICO).
//
// El endpoint del chat transmite NDJSON y, cuando el analista truena, manda
// `{t:'error'}` DENTRO de un stream con HTTP 200. El cliente decidía así:
//
//     resp.ok && d && Array.isArray(d.bloques) ? respuestaDeBloques(d.bloques)
//                                              : responder(q, kpis, acred)
//
// `responder` era un heurístico de palabras clave sobre los KPIs ya cargados
// en la página: preguntabas "¿cuánto le debo a Pedro este mes?", el agente
// se caía, y la pantalla contestaba "Llevas $412,900.00 comprobados en 37
// viajes" — el comprobado histórico de TODA la flota — con cara de respuesta
// a la pregunta que se hizo, sin una palabra de que el análisis falló.
//
// Eso rompe la regla que define al producto: nunca inventar una cifra, y
// fallar cerrado y DECIRLO. El contralor cruza lo que ve contra su PDF.
// ═══════════════════════════════════════════════════════════════════════════

describe('AUD3 FE-C1 — el turno que falla se declara, no se rellena', () => {
  it('stream 200 con {t:"error"}: ni una cifra, y dice que no pudo', () => {
    const r = respuestaDelTurno(true, { t: 'error', error: 'el analista se quedó sin presupuesto' });

    // Ninguna cifra: ni pesos, ni litros, ni un entero suelto que se lea como medición.
    expect(r.texto).not.toMatch(/\$/);
    expect(r.texto).not.toMatch(/\d[\d,]*\.\d{2}/);
    // Y lo dice.
    expect(r.texto.toLowerCase()).toContain('no pude');
    // Sin visuales: una dona o una tabla es una cifra con otra ropa.
    expect(r.visual).toBeUndefined();
    expect(r.visuales).toBeUndefined();
  });

  it('el detalle del servidor viaja al usuario en vez de perderse', () => {
    const r = respuestaDelTurno(true, { t: 'error', error: 'tope diario alcanzado' });
    expect(r.texto).toContain('tope diario alcanzado');
  });

  it('caída de red (sin respuesta): tampoco inventa', () => {
    const r = respuestaDelTurno(false, null);
    expect(r.texto).not.toMatch(/\$/);
    expect(r.texto.toLowerCase()).toContain('no pude');
    expect(r.visual).toBeUndefined();
  });

  it('HTTP 200 sin bloques tampoco cuenta como respuesta', () => {
    const r = respuestaDelTurno(true, { conversacionId: 'c-1' });
    expect(r.texto.toLowerCase()).toContain('no pude');
  });

  it('el camino bueno sigue armando la respuesta del agente', () => {
    const r = respuestaDelTurno(true, {
      bloques: [{ tipo: 'texto', texto: 'Pedro lleva 3 viajes.' }],
      conversacionId: 'c-1',
    });
    expect(r.texto).toContain('Pedro lleva 3 viajes.');
    expect(r.texto.toLowerCase()).not.toContain('no pude');
  });
});
