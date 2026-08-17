import { describe, it, expect } from 'vitest';
import { rentabilidadDe } from './comercial';

// AUD5 ARQ-C1: ingreso de N viajes con flete y costo de TODAS las
// liquidaciones produce un margen mentiroso. La UI dice "solo sobre los N
// viajes con ingreso"; el cálculo tiene que hacer lo mismo.

describe('AUD5 ARQ-C1: rentabilidadDe alinea ingreso y costo al mismo conjunto', () => {
  it('un viaje sin ingreso NO arrastra su comprobado al costo', () => {
    const r = rentabilidadDe(
      [
        { id: 'v-con', ingreso_flete: 10_000 },
        { id: 'v-sin', ingreso_flete: null },
      ],
      [
        { viaje_id: 'v-con', total_comprobado: 4_000 },
        { viaje_id: 'v-sin', total_comprobado: 9_000 },
      ],
    );
    expect(r.ingreso).toBe(10_000);
    expect(r.costoComprobado).toBe(4_000);
    expect(r.contribucion).toBe(6_000);
    expect(r.viajesConIngreso).toBe(1);
    expect(r.viajesSinIngreso).toBe(1);
    expect(r.margenPct).toBe(60);
  });

  it('ingreso 0 tecleado SÍ cuenta: es un cero medido, no un vacío', () => {
    const r = rentabilidadDe(
      [{ id: 'v1', ingreso_flete: 0 }],
      [{ viaje_id: 'v1', total_comprobado: 800 }],
    );
    expect(r.viajesConIngreso).toBe(1);
    expect(r.ingreso).toBe(0);
    expect(r.costoComprobado).toBe(800);
    expect(r.margenPct).toBeNull();
  });
});
