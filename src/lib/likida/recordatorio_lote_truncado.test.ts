import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 3) — EL ARREGLO DEL PASE 2 SE REABRÍA SOLO EN UNA FLOTA
// GRANDE.
//
// `709e410` cerró el CRÍTICO de "afirmar sin haber mirado": antes de acusar a
// un chofer de no mandar comprobantes, ahora se consulta `gasto`. La consulta
// que agregó es UNA sola para todo el lote:
//
//     .from('gasto').select('viaje_id').in('viaje_id', candidatos)
//
// y su comentario afirma que "se pide `limit` amplio". No se pide ninguno. Sin
// `range` ni `count`, PostgREST aplica `max_rows` (1,000 por default) y
// **recorta en silencio**: no lanza, no avisa, devuelve menos filas. Es el
// mismo borde que `pg.ts:38-48` documenta y que `traerTodo` existe para cerrar.
//
// ESCENARIO CON VALORES: una flota con 100 viajes abiertos que pasaron el corte
// de días, cada uno con 12 gastos ya cargados = 1,200 filas. La consulta
// devuelve 1,000. Los gastos de los últimos ~16 viajes se quedan fuera del
// `Set`, esos viajes se leen como "sin un solo comprobante", y a sus choferes
// les sale por WhatsApp:
//
//     "Llevas 3 días con tu viaje VJ-104 sin mandarme comprobantes. 📋"
//
// mientras el panel del contralor muestra los doce recibos de cada uno. Es
// exactamente el CRÍTICO que el pase 2 cerró, reaparecido en el rango de una
// flota real — y peor que el original, porque ahora hay una consulta que
// "comprueba" y da falsa confianza.
//
// La prueba emula el servidor: honra `range` y NUNCA entrega más de `PAGINA`
// filas de una vez, que es lo único que hace PostgREST de verdad.
// ═══════════════════════════════════════════════════════════════════════════

const { sendText } = vi.hoisted(() => ({ sendText: vi.fn() }));
vi.mock('@/lib/meta/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  sendText,
}));
vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { PAGINA } = await import('./pg');

const VIAJES = 100;
const GASTOS_POR_VIAJE = 12;

/** Los 100 viajes candidatos: abiertos, vencidos y con operador con teléfono. */
const candidatos = Array.from({ length: VIAJES }, (_, i) => ({
  id: `v-${i}`, tenant_id: 't-1', folio: `VJ-${100 + i}`, operador_id: `o-${i}`,
  fecha_inicio: '2026-08-01',
  operador: { nombre: `Chofer ${i}`, telefono: `52199937007${String(i).padStart(2, '0')}` },
}));

/** TODOS traen comprobantes: 100 × 12 = 1,200 filas. Nadie merece el regaño. */
const gastos = candidatos.flatMap((c) =>
  Array.from({ length: GASTOS_POR_VIAJE }, () => ({ viaje_id: c.id })),
);

/** Cuántas filas pidió el código en total (para distinguir 1 tiro de la paginación). */
let filasEntregadas = 0;

/**
 * Servidor de mentira con la ÚNICA regla que importa: `max_rows`. Si el
 * llamador no acota, se le entrega el recorte sin avisar — igual que PostgREST.
 */
function tablaGasto() {
  let desde = 0;
  let hasta = PAGINA - 1;
  const nodo: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'lte', 'limit', 'order']) {
    nodo[m] = () => nodo;
  }
  nodo.range = (d: number, h: number) => { desde = d; hasta = Math.min(h, d + PAGINA - 1); return nodo; };
  nodo.then = (r: (v: unknown) => unknown) => {
    const trozo = gastos.slice(desde, Math.min(hasta + 1, desde + PAGINA));
    filasEntregadas += trozo.length;
    // `count` solo si lo pidieron: es lo que le permite a `traerTodo` saber
    // que la lectura quedó corta. Sin pedirlo, el recorte es indistinguible.
    return Promise.resolve({ data: trozo, error: null, count: gastos.length }).then(r);
  };
  return nodo;
}

function tablaViaje() {
  const nodo: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'lte', 'limit', 'order', 'range']) {
    nodo[m] = () => nodo;
  }
  nodo.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: candidatos, error: null }).then(r);
  return nodo;
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (tabla: string) => (tabla === 'gasto' ? tablaGasto() : tablaViaje()),
  }),
}));

const { viajesSinComprobar } = await import('./recordatorio_comprobacion');

const AHORA = new Date('2026-08-08T18:00:00.000Z');

describe('el lote de comprobación no se acusa por un recorte de PostgREST', () => {
  beforeEach(() => { filasEntregadas = 0; sendText.mockReset(); });

  it('EL BUG: con 1,200 filas de gasto, nadie debe quedar señalado como "sin comprobantes"', async () => {
    // Sin el arreglo, la única consulta trae 1,000 filas y los ~16 viajes cuyos
    // gastos quedaron fuera del recorte salen aquí como si no hubieran mandado
    // nada. Con el arreglo la lista es vacía: los 100 tienen comprobantes.
    const sinComprobar = await viajesSinComprobar(AHORA);
    expect(sinComprobar.map((v) => v.folio)).toEqual([]);
  });

  it('se leyeron TODAS las filas, no las primeras 1,000', async () => {
    await viajesSinComprobar(AHORA);
    expect(filasEntregadas).toBe(gastos.length);
  });

  it('CONTROL: el escenario de verdad excede el tope, o la prueba no probaría nada', () => {
    // Si alguien baja GASTOS_POR_VIAJE y el total cae por debajo de `PAGINA`,
    // las dos pruebas de arriba pasarían con el bug puesto. Esto lo impide.
    expect(gastos.length).toBeGreaterThan(PAGINA);
  });

  it('CONTROL: un viaje SIN gastos sí se sigue señalando', async () => {
    // El arreglo no puede volverse "nunca acusar a nadie": lo que se corrige es
    // el recorte, no la función. Se le quitan los gastos al último viaje.
    const sinElUltimo = gastos.filter((g) => g.viaje_id !== `v-${VIAJES - 1}`);
    const original = gastos.splice(0, gastos.length, ...sinElUltimo);
    try {
      const sinComprobar = await viajesSinComprobar(AHORA);
      expect(sinComprobar.map((v) => v.id)).toEqual([`v-${VIAJES - 1}`]);
    } finally {
      gastos.splice(0, gastos.length, ...original);
    }
  });
});
