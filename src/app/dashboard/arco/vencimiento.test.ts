import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { diasParaVencer, porVencer, vencidas, DIAS_AVISO } from './vencimiento';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 5), MEDIO, 5ª RONDA — el KPI "Vencen pronto (≤ 5 días)"
// de Privacidad (ARCO) contaba SOLO lo que ya había vencido (`venceEn <= hoy`).
//
// El escenario exacto del hallazgo: una solicitud ARCO con vencimiento el
// 15-ago, hoy 12-ago. Faltan 3 días → tiene que contar. La flota es la
// responsable obligada de contestar en 20 días hábiles (LFPDPPP art. 32) y
// ésta es su única alarma.
// ═══════════════════════════════════════════════════════════════════════════

const HOY = '2026-08-12';
const S = (venceEn: string) => ({ venceEn });

describe('diasParaVencer', () => {
  it('EL BUG: una que vence en 3 días da 3, no "ya pasó"', () => {
    expect(diasParaVencer('2026-08-15', HOY)).toBe(3);
  });

  it('hoy mismo es 0, y ayer es -1', () => {
    expect(diasParaVencer('2026-08-12', HOY)).toBe(0);
    expect(diasParaVencer('2026-08-11', HOY)).toBe(-1);
  });

  it('acepta un timestamp ISO completo (la columna es timestamptz)', () => {
    expect(diasParaVencer('2026-08-15T18:30:00.000Z', HOY)).toBe(3);
  });

  it('cruza el fin de mes sin equivocarse', () => {
    expect(diasParaVencer('2026-09-02', '2026-08-31')).toBe(2);
  });
});

describe('porVencer — el KPI que le avisa a la responsable obligada', () => {
  it('EL BUG: la del 15-ago entra en el conteo estando a 3 días', () => {
    expect(porVencer([S('2026-08-15')], HOY)).toHaveLength(1);
  });

  it('el umbral es el del rótulo: 5 sí, 6 no', () => {
    expect(porVencer([S('2026-08-17')], HOY), 'a 5 días').toHaveLength(1);
    expect(porVencer([S('2026-08-18')], HOY), 'a 6 días').toHaveLength(0);
    expect(DIAS_AVISO).toBe(5);
  });

  it('las YA vencidas siguen contando: pasarse del plazo no las vuelve menos urgentes', () => {
    expect(porVencer([S('2026-08-01')], HOY)).toHaveLength(1);
  });

  it('y se pueden contar aparte para decirlo en la nota, sin mezclarlas en silencio', () => {
    const cola = [S('2026-08-01'), S('2026-08-15'), S('2026-09-30')];
    expect(porVencer(cola, HOY)).toHaveLength(2);
    expect(vencidas(cola, HOY)).toHaveLength(1);
  });

  it('CONTROL: una lejana no dispara la alarma', () => {
    expect(porVencer([S('2026-09-30')], HOY)).toHaveLength(0);
  });
});

describe('el tile de la página usa esto y su rótulo dice la verdad', () => {
  const PAGINA = readFileSync('src/app/dashboard/arco/page.tsx', 'utf8');

  it('EL BUG: ya no filtra con `venceEn(...) <= hoy`', () => {
    const sin = PAGINA.replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(sin).not.toMatch(/venceEn\(s\.venceEn\)\s*<=\s*hoy/);
    expect(sin).toContain('porVencer(');
  });

  it('el número del rótulo sale de la constante, no de un literal que se puede separar', () => {
    expect(PAGINA).toContain('DIAS_AVISO');
  });
});
