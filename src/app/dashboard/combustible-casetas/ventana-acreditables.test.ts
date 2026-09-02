import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════════════════
// FE-8 (auditoría 24) · "litros elegibles para el estímulo" (LIF 20-A) se
// medía con DOS ventanas distintas en dos pantallas: el contador llamaba
// `getAcreditables(tenantId, diasEjercicio)` (el ejercicio en curso) y
// Combustible & Casetas llamaba `getAcreditables(tenantId)` a secas — que
// `corteVentana(undefined)` resuelve al histórico COMPLETO. Misma cita
// legal, dos cálculos.
//
// Escaneo de fuente (mismo espíritu que `dinero_por_area.test.ts`): no
// ejecuta las páginas (son Server Components con sesión) — fija que ambos
// call sites de `getAcreditables` pasen un segundo argumento derivado de
// `resolverPeriodo`, para que un futuro "simplifiquemos y quitemos la
// ventana" en cualquiera de las dos vuelva a divergir EN ROJO.
// ═══════════════════════════════════════════════════════════════════════════

function leer(ruta: string): string {
  return readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');
}

describe('getAcreditables: misma ventana en las dos pantallas que citan LIF 20-A', () => {
  it('combustible-casetas/page.tsx pasa diasEjercicio (no getAcreditables(tenantId) a secas)', () => {
    const src = leer('./page.tsx');
    expect(src).toMatch(/resolverPeriodo\(/);
    expect(src).toMatch(/getAcreditables\(tenantId,\s*diasEjercicio\)/);
    expect(src).not.toMatch(/getAcreditables\(tenantId\)\)/);
  });

  it('contador/inicio-contador.tsx sigue pasando diasEjercicio (el otro call site)', () => {
    const src = leer('../contador/inicio-contador.tsx');
    expect(src).toMatch(/resolverPeriodo\(/);
    expect(src).toMatch(/getAcreditables\(tenantId,\s*diasEjercicio\)/);
  });
});
