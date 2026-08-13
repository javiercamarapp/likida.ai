import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 6), CRÍTICO — LAS VENTANAS DE TIEMPO QUE MIENTEN.
//
// Lo encontraron DOS auditores por separado (tool calling y arquitectura),
// que es la corroboración más fuerte que da este proceso.
//
// `chat-tools.ts` le describe al modelo el enum `modo` como
// "últimos 7 días, últimos 30, o todo el histórico". Las cuatro tools que
// usan ese enum (serie_gasto, serie_liquidado, top_rutas y el desglose)
// indexan las funciones `*Series` de `analytics.ts`, y ésas se construyen con
//
//     const SEMANAS_POR_MODO = { semanal: 5, mensual: 13, historico: 52 }
//
// o sea 35, 91 y 364 DÍAS. Y `prompts.ts:50` le ordena al modelo:
// "SIEMPRE declara la ventana que usaste ('últimos 7 días'…)".
//
// Escenario: el contralor pregunta "¿cuánto gasté en diésel esta semana?".
// El modelo pide serie_gasto con modo 'semanal', recibe CINCO semanas de
// gasto, y las declara como "los últimos 7 días". Un gasto de $184,320 de
// cinco semanas sale rotulado como una. La guardia de cifras no lo puede
// ver: verifica la PROCEDENCIA del dígito contra las tools, nunca su rótulo.
//
// Este arnés ata los dos lados. Si alguien mueve SEMANAS_POR_MODO sin mover
// la descripción del enum —o al revés—, esta prueba se pone roja.
// ═══════════════════════════════════════════════════════════════════════════

const CHAT_TOOLS = readFileSync('src/lib/agents/chat-tools.ts', 'utf8');
const ANALYTICS = readFileSync('src/lib/likida/analytics.ts', 'utf8');

/** Las semanas reales que sirve cada modo, leídas de la fuente. */
function semanasPorModo(): Record<string, number> {
  const m = ANALYTICS.match(/const SEMANAS_POR_MODO = \{([^}]+)\}/);
  if (!m) throw new Error('SEMANAS_POR_MODO ya no está en analytics.ts — este arnés necesita actualizarse');
  const out: Record<string, number> = {};
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*(\d+)/g)) out[k] = Number(v);
  return out;
}

/** La descripción del enum `modo` que LEE EL MODELO. */
function descripcionDelEnum(): string {
  const m = CHAT_TOOLS.match(/modo:\s*\{[^}]*description:\s*'([^']+)'/);
  if (!m) throw new Error('no se encontró la descripción del enum `modo` en chat-tools.ts');
  return m[1];
}

describe('las ventanas que el chat le promete al modelo son las que entrega', () => {
  it('EL BUG: la descripción no puede decir "7 días" si el modo sirve 5 semanas', () => {
    const semanas = semanasPorModo();
    const desc = descripcionDelEnum();

    expect(semanas.semanal).toBe(5);   // ancla de la realidad, no del deseo
    // 5 semanas son 35 días: prometer 7 es mentir por 5x.
    expect(desc).not.toMatch(/7\s*d[íi]as/i);
    expect(desc).not.toMatch(/30\s*d[íi]as/i);
  });

  it('la descripción nombra las semanas reales de cada modo', () => {
    const semanas = semanasPorModo();
    const desc = descripcionDelEnum();
    expect(desc).toContain(`${semanas.semanal} semanas`);
    expect(desc).toContain(`${semanas.mensual} semanas`);
    expect(desc).toContain(`${semanas.historico} semanas`);
  });
});
