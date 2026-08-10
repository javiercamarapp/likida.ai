import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 17 (pase 3) — CRÍTICO backend: EL LEASE ERA MÁS CORTO QUE EL TURNO
// QUE PROTEGE.
//
// `acquireViajeLock` pedía el candado con `p_ttl_ms = 60_000`, y el turno que
// ese candado serializa tiene un peor caso DOCUMENTADO en `presupuesto.ts` de
// ~72s (lock ≤12s + espera de intake 20s + cuadre ~40s), dentro de una
// invocación presupuestada a 120s. `processor.ts` nunca pasaba `ttlMs`, así que
// tomaba ese default.
//
// El resultado no es que el lock falle ruidoso: es que VENCE SOLO. A los 60s el
// `try_lock_viaje` de la 0005 considera el viaje libre, un segundo mensaje del
// mismo operador entra al ciclo completo mientras el primero sigue cuadrando, y
// los dos cierran. Ninguno de los dos caminos lanza:
//   - `guardar_liquidacion` no comprueba `viaje.estatus`,
//   - el `on conflict do update` de la 0013 sobrescribe la fila,
//   - el `upsert: true` del PDF sobrescribe el archivo en storage.
// Los dos reportan éxito. El chofer se queda con un PDF de $5,600 y la base con
// $7,000 — la doble liquidación que la 0005 existe para impedir, causada por el
// reloj del propio candado.
//
// Lo que estas pruebas fijan es la INVARIANTE, no un número: el lease que se
// pide tiene que cubrir el peor caso del turno. Si mañana alguien sube el techo
// del agente y no sube el lease, esto se pone rojo. Es la misma disciplina con
// la que `presupuesto_camino.test.ts` compara `PRESUPUESTO_WEBHOOK_MS` contra
// el `maxDuration` de la ruta.
// ═══════════════════════════════════════════════════════════════════════════

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { acquireViajeLock } = await import('./conv');
const { PRESUPUESTO_WEBHOOK_MS, PEOR_CASO_TURNO_MS, TTL_LOCK_VIAJE_MS } = await import('./presupuesto');

const ok = { data: true, error: null };

/** El `p_ttl_ms` con el que se pidió el candado en la última llamada. */
function ttlPedido(): number {
  const ultima = rpc.mock.calls.at(-1);
  const args = ultima?.[1] as { p_ttl_ms?: number } | undefined;
  return args?.p_ttl_ms ?? -1;
}

describe('el lease del mutex del viaje cubre el turno que protege', () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue(ok); });

  it('el lease por DEFAULT cubre el peor caso documentado del turno', async () => {
    // Este es el caso real: `processor.ts` llama sin `ttlMs`, así que lo que
    // manda es el default. Con 60_000 contra 72_000 esto es rojo.
    await acquireViajeLock('v1');
    expect(ttlPedido()).toBeGreaterThanOrEqual(PEOR_CASO_TURNO_MS);
  });

  it('el lease por DEFAULT cubre la invocación entera, no solo el peor caso', async () => {
    // El peor caso es una estimación de la suma de los eslabones; el techo DURO
    // es `maxDuration`. Un turno no puede pasar de ahí, así que un lease que
    // llega hasta ahí no puede vencer con el turno vivo — que es la garantía
    // que se quiere, no "cabe casi siempre".
    await acquireViajeLock('v1');
    expect(ttlPedido()).toBeGreaterThanOrEqual(PRESUPUESTO_WEBHOOK_MS);
  });

  it('la constante del lease no se puede quedar corta contra el peor caso', async () => {
    // Sin llamar a nadie: la relación entre las dos constantes es la invariante.
    // Si alguien sube `PEOR_CASO_TURNO_MS` sin subir el lease, esto avisa aquí y
    // no en producción con dos liquidaciones sobre el mismo viaje.
    expect(TTL_LOCK_VIAJE_MS).toBeGreaterThanOrEqual(PEOR_CASO_TURNO_MS);
  });

  it('CONTROL: un ttlMs explícito del llamador se sigue respetando', async () => {
    // El default no puede volverse un tope. `startup.ts` pide leases de 1ms a
    // propósito para su sondeo, y ese camino tiene que seguir funcionando.
    await acquireViajeLock('v1', { ttlMs: 1 });
    expect(ttlPedido()).toBe(1);
  });

  it('CONTROL: el peor caso documentado es mayor que el lease que se pedía antes', async () => {
    // Deja escrito POR QUÉ esto era un bug y no una preferencia: el número viejo
    // (60s) es objetivamente menor que el peor caso que el propio repo declara.
    expect(PEOR_CASO_TURNO_MS).toBeGreaterThan(60_000);
  });
});
