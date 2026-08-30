// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 22 · FIS-C1 (CRÍTICO) — la póliza no sabía qué era deducible.
//
// `LiquidacionParaPoliza` no tenía UN SOLO campo de deducibilidad:
// `porConcepto` era `{concepto, subtotal}` y punto. Así que TODO gasto se
// cargaba a `catalogo.gastos[concepto]` —la cuenta de gasto DEDUCIBLE de la
// flota— aunque el motor lo hubiera marcado `combustible_efectivo`,
// `cfdi_efos` o `efectivo_sobre_tope`.
//
// El resultado: el PDF de la misma liquidación imprime «No deducible $58,000»
// y el archivo que el contador importa a CONTPAQi lo asienta como deducible.
// Dos artefactos del mismo cálculo diciendo cosas contrarias — que es
// exactamente lo que la regla del formato de cifras existe para impedir.
//
// Y era una REGRESIÓN reciente: antes de `010a7f5` estos casos descuadraban y
// el periodo entero se negaba con 409. El renglón residual de IVA/IEPS no
// acreditado que ese arreglo introdujo los volvió exportables — absorbía la
// base no deducible como si fuera impuesto.
//
// La regla del módulo manda el resto: NINGUNA CUENTA SE INVENTA. Si hay gasto
// no deducible y la flota no declaró dónde asentarlo, no se elige una cuenta
// plausible: se dice qué falta.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { polizaDeLiquidacion, type CatalogoContable, type LiquidacionParaPoliza } from './poliza';

const CATALOGO: CatalogoContable = {
  gastos: { diesel: '5010-001', caseta: '5010-002', hospedaje: '5010-004' },
  ivaAcreditable: '1180-001',
  ivaNoAcreditable: '1180-002',
  gastoNoDeducible: '5990-001',
  gastoPorConfirmar: '5990-002',
  anticipoOperador: '1190-001',
  porCobrarOperador: '1190-002',
  porPagarOperador: '2010-001',
};

const cuentasDe = (movs: Array<{ cuenta: string; cargo: number }>) =>
  Object.fromEntries(movs.filter((m) => m.cargo > 0).map((m) => [m.cuenta, m.cargo]));

// Anticipo 10,000. Diésel deducible 3,000 + hospedaje NO deducible 5,000
// (efectivo sobre el tope: sin IVA acreditable). Comprobado 8,000, devuelve 2,000.
const CON_NO_DEDUCIBLE: LiquidacionParaPoliza = {
  folioViaje: 'VJ-2026-0042',
  operador: 'Juan Pérez',
  fecha: '2026-08-20',
  anticipo: 10_000,
  porConcepto: [
    { concepto: 'diesel', subtotal: 3000 },
    { concepto: 'hospedaje', subtotal: 0, subtotalNoDeducible: 5000 },
  ],
  ivaAcreditable: 0,
  diferencia: 2000, // 10,000 − 8,000
};

describe('FIS-C1: lo no deducible NO se asienta en la cuenta de gasto deducible', () => {
  it('el hospedaje no deducible va a su propia cuenta, no a 5010-004', () => {
    const r = polizaDeLiquidacion(CON_NO_DEDUCIBLE, CATALOGO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = cuentasDe(r.poliza.movimientos);
    // Lo que rompía: 5010-004 cargaba los $5,000 como gasto deducible.
    expect(c['5010-004']).toBeUndefined();
    expect(c['5990-001']).toBe(5000);
    expect(c['5010-001']).toBe(3000); // el diésel deducible no se toca
  });

  it('el asiento sigue cuadrando al centavo', () => {
    const r = polizaDeLiquidacion(CON_NO_DEDUCIBLE, CATALOGO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cargos = r.poliza.movimientos.reduce((s, m) => s + m.cargo, 0);
    const abonos = r.poliza.movimientos.reduce((s, m) => s + m.abono, 0);
    expect(cargos).toBeCloseTo(abonos, 2);
    expect(cargos).toBeCloseTo(10_000, 2);
  });

  it('el «por confirmar» tampoco se mezcla con lo deducible: es un tercer estado', () => {
    const r = polizaDeLiquidacion(
      {
        ...CON_NO_DEDUCIBLE,
        porConcepto: [
          { concepto: 'diesel', subtotal: 3000 },
          { concepto: 'hospedaje', subtotal: 0, subtotalPorConfirmar: 5000 },
        ],
      },
      CATALOGO,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = cuentasDe(r.poliza.movimientos);
    expect(c['5010-004']).toBeUndefined();
    expect(c['5990-002']).toBe(5000);
  });

  // NINGUNA CUENTA SE INVENTA — la regla que gobierna el módulo entero.
  it('sin cuenta declarada para lo no deducible, se NIEGA y se dice qué falta', () => {
    const { gastoNoDeducible: _omitida, ...sinCuenta } = CATALOGO;
    const r = polizaDeLiquidacion(CON_NO_DEDUCIBLE, sinCuenta);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.falta.join(' ')).toContain('no deducible');
    // No cae al genérico «la póliza no cuadra»: dice exactamente qué capturar.
    expect(r.falta.join(' ')).not.toContain('revisar la liquidación a mano');
  });

  it('una liquidación 100% deducible no exige la cuenta nueva (nadie se rompe)', () => {
    const { gastoNoDeducible: _a, gastoPorConfirmar: _b, ...sinCuentas } = CATALOGO;
    const r = polizaDeLiquidacion(
      { ...CON_NO_DEDUCIBLE, porConcepto: [{ concepto: 'diesel', subtotal: 8000 }] },
      sinCuentas,
    );
    expect(r.ok).toBe(true);
  });

  it('el residuo de impuesto no se traga la base no deducible', () => {
    // El renglón `ivaNoAcreditable` se deriva de `comprobado − base − IVA
    // acreditable`. Si la base no deducible no contara como base, esos $5,000
    // aparecerían como «IVA/IEPS no acreditable» — un impuesto que no existe.
    const r = polizaDeLiquidacion(CON_NO_DEDUCIBLE, CATALOGO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = cuentasDe(r.poliza.movimientos);
    expect(c['1180-002']).toBeUndefined();
  });
});
