import { describe, it, expect, vi, beforeEach } from 'vitest';

const updates: Array<{ id: string; fila: Record<string, unknown> }> = [];
const deletes: Array<{ tabla: string; id: string }> = [];
let filasCorreo: Array<{ id: string }> = [];
let filasTel: Array<{ id: string }> = [];
let updateError: { message: string } | null = null;

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (tabla: string) => {
      const nodo: Record<string, unknown> = {};
      for (const m of ['select', 'ilike', 'in', 'order', 'eq']) nodo[m] = () => nodo;
      nodo.range = () => {
        if (tabla !== 'prospecto') return Promise.resolve({ data: [], error: null });
        // Primera lectura (correo) vs segunda (tel): se distingue por si ya
        // se pidió ilike en este builder. Simplificamos: devolvemos ambas
        // listas en llamadas sucesivas vía el mock de abajo.
        return Promise.resolve({ data: [], error: null });
      };
      nodo.update = (fila: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          if (updateError) return Promise.resolve({ error: updateError });
          updates.push({ id, fila });
          return Promise.resolve({ error: null });
        },
      });
      nodo.delete = () => ({
        eq: (_c: string, id: string) => {
          deletes.push({ tabla, id });
          return Promise.resolve({ error: null });
        },
      });
      return nodo;
    },
  }),
}));

vi.mock('@/lib/likida/pg', () => ({
  traerTodo: async (_fn: unknown, etiqueta: string) => {
    if (etiqueta.endsWith('correo')) return filasCorreo;
    if (etiqueta.endsWith('tel')) return filasTel;
    return [];
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const { ejecutarCancelacionProspecto } = await import('./prospectos-arco');

beforeEach(() => {
  updates.length = 0;
  deletes.length = 0;
  filasCorreo = [];
  filasTel = [];
  updateError = null;
});

describe('ejecutarCancelacionProspecto', () => {
  it('ref vacía no toca la base', async () => {
    const r = await ejecutarCancelacionProspecto('  ');
    expect(r).toEqual({ encontrados: 0, anonimizados: 0, ids: [] });
    expect(updates).toHaveLength(0);
  });

  it('AUD5→7: anonimiza nombre, correo y teléfono y borra toques', async () => {
    filasCorreo = [{ id: 'p-1' }];
    const r = await ejecutarCancelacionProspecto('ana@flota.mx');
    expect(r.encontrados).toBe(1);
    expect(r.anonimizados).toBe(1);
    expect(updates[0].fila).toMatchObject({
      contacto_nombre: null, telefono: null, correo: null, notas: null,
    });
    expect(updates[0].fila).not.toHaveProperty('empresa');
    expect(deletes.some((d) => d.tabla === 'prospecto_toque' && d.id === 'p-1')).toBe(true);
    expect(deletes.some((d) => d.tabla === 'prospecto_contacto' && d.id === 'p-1')).toBe(true);
  });

  it('un update que falla no cuenta como anonimizado', async () => {
    filasTel = [{ id: 'p-2' }];
    updateError = { message: 'db down' };
    const r = await ejecutarCancelacionProspecto('9993700779');
    expect(r.encontrados).toBe(1);
    expect(r.anonimizados).toBe(0);
  });
});
