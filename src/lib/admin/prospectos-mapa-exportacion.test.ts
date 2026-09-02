import { describe, it, expect, vi, beforeEach } from 'vitest';

// ADM-8 (auditoría 24, MEDIO) — una exportación CSV del Cerebro (hasta 33k
// filas con teléfono/correo de decisores) no dejaba NINGÚN rastro en
// bitácora. `registrarExportacionProspectos` es el insert directo a
// `bitacora_auditoria` que cierra ese hueco.

const inserts: Array<Record<string, unknown>> = [];
let errorSembrado: { message: string } | null = null;
let lanzaExcepcion = false;

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (tabla: string) => ({
      insert: (fila: Record<string, unknown>) => {
        if (lanzaExcepcion) throw new Error('conexión perdida');
        inserts.push({ tabla, ...fila });
        return Promise.resolve({ error: errorSembrado });
      },
    }),
  }),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { registrarExportacionProspectos } = await import('./prospectos-mapa');

beforeEach(() => { inserts.length = 0; errorSembrado = null; lanzaExcepcion = false; });

describe('registrarExportacionProspectos', () => {
  it('escribe en bitacora_auditoria con el conteo y los filtros, sin datos de prospectos', async () => {
    await registrarExportacionProspectos('u1', 4200, { giros: ['carga'], soloTel: true });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      tabla: 'bitacora_auditoria',
      tenant_id: null,
      actor_id: 'u1',
      accion: 'prospectos.exportados',
      entidad: 'prospecto',
      entidad_id: 'csv',
      detalle: { n: 4200, filtros: { giros: ['carga'], soloTel: true } },
    });
  });

  it('nunca lanza si la escritura falla — una bitácora caída no puede tumbar la descarga', async () => {
    errorSembrado = { message: 'db down' };
    await expect(registrarExportacionProspectos('u1', 10, {})).resolves.toBeUndefined();
  });

  it('nunca lanza ni ante una excepción de red', async () => {
    lanzaExcepcion = true;
    await expect(registrarExportacionProspectos('u1', 10, {})).resolves.toBeUndefined();
  });

  it('un n no finito o negativo no se sanea aquí — el llamador (server action) ya lo hizo; se registra tal cual llegue', async () => {
    await registrarExportacionProspectos(null, 0, {});
    expect(inserts[0]).toMatchObject({ actor_id: null, detalle: { n: 0, filtros: {} } });
  });
});
