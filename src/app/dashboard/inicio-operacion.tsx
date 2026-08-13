import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { Send, UserCog, CircleSlash } from 'lucide-react';
import { saludo, fechaLarga, ahoraMs } from '@/lib/saludo';
import { getViajes, type ViajeRow } from '@/lib/likida/analytics';
import {
  getTableroOperacion, getViajesSinAsignar, getCargaOperadores, getIncidencias,
  type TableroOperacion, type ViajeSinAsignar, type CargaOperador, type IncidenciaRow,
} from '@/lib/likida/operacion';
import { listOperadores, reasignarOperador } from '@/lib/likida/repo';
import { requireSessionTenant } from '@/lib/auth/guard';
import { puedeAsignar } from '@/lib/auth/permisos';
import { resolverTenantPedido } from '@/lib/auth/tenant-api';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { EstadoVacio, StatusPill } from '../admin/ui/kit';
import { TableroCifras, TablaCarga, TablaSinAsignar } from './tablero-operacion';
import AvanceCierre from './avance-cierre';
import { AvisoSinFlota } from './sin-flota';

// ═══════════════════════════════════════════════════════════════════════════
// LA CASA DEL ENCARGADO.
//
// El Resumen que existía es del DUEÑO: abre con lo que el motor señaló en
// pesos, los acreditables fiscales y el monto comprobado. El jefe de tráfico
// no ve nada de eso (visibilidad.ts), así que aterrizaba en una pantalla
// llena de huecos o, peor, en una que le enseñaba justo lo que no le toca.
//
// Esta es la misma casa con otro contenido: mismo encabezado, misma barra de
// avance, mismo marco — pero las seis cifras son de operación y lo que sigue
// abajo es lo que persigue en la mañana: qué no tiene chofer, quién trae
// cuánto, y qué se salió de lo normal. Cero pesos en toda la pantalla.
// ═══════════════════════════════════════════════════════════════════════════

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

/**
 * A qué tenant escribe la Server Action de asignar, y quién puede.
 *
 * Vive a nivel de MÓDULO, no dentro del componente: una función anidada
 * capturada por el closure de un `'use server'` cuenta como valor a serializar
 * hacia el cliente. Mismo patrón que `combustible-casetas/page.tsx`.
 *
 * El permiso se REVALIDA aquí: un server action es un endpoint POST alcanzable
 * por su cuenta, así que el `puedeAsignar` del render decide si el `<select>`
 * se DIBUJA, nunca si se puede EJECUTAR.
 */
async function tenantDelAction(sufijo: string, tenantPedido?: string): Promise<string> {
  const s = await requireSessionTenant('/dashboard');
  if (!puedeAsignar(s.rol)) redirect(`/dashboard${sufijo}`);
  if (s.rol === 'superadmin' && tenantPedido) {
    return await resolverTenantPedido(supabaseAdmin(), s.tenantId, tenantPedido);
  }
  return s.tenantId;
}

export async function InicioOperacion({
  tenantId, tenantNombre, nombre, tenantExiste = true, rol = 'encargado', sufijo = '', tenantPedido,
}: {
  tenantId: string;
  tenantNombre: string | null;
  nombre: string | null;
  /** Rol EFECTIVO — decide si se pinta el selector de chofer. La escritura lo
   *  vuelve a comprobar por su cuenta (ver `tenantDelAction`). */
  rol?: string;
  /** El `?tenant=`/`?vista=`/`?rol=` que hay que conservar al volver del POST. */
  sufijo?: string;
  /** El `?tenant=` crudo, para que un superadmin que previsualiza una flota
   *  real escriba EN ESA flota y no en la demo. */
  tenantPedido?: string;
  /** `false` cuando el uuid al que apunta la página no tiene fila en `tenant`
   *  — ver `sin-flota.tsx`. Aquí importa más que en el Resumen del dueño: sin
   *  flota, "Todo lo que está en curso ya trae chofer" y "0 viajes activos"
   *  se leen como una mañana tranquila, no como una base vacía. */
  tenantExiste?: boolean;
}) {
  const puede = puedeAsignar(rol);
  const [tablero, sinAsignar, carga, incidencias, viajes, operadores] = await Promise.all([
    safe<TableroOperacion>(() => getTableroOperacion(tenantId)),
    safe<ViajeSinAsignar[]>(() => getViajesSinAsignar(tenantId)),
    safe<CargaOperador[]>(() => getCargaOperadores(tenantId)),
    safe<IncidenciaRow[]>(() => getIncidencias(tenantId)),
    safe<ViajeRow[]>(() => getViajes(tenantId)),
    // Solo si este rol puede asignar: pedir la lista para no ofrecerla es una
    // consulta de más en la pantalla que más se abre.
    puede ? safe<Array<{ id: string; nombre: string }>>(() => listOperadores(tenantId)) : null,
  ]);

  /**
   * Reparte un viaje a un chofer. AUDITORÍA 17 (pase 5), ALTO — hasta hoy esta
   * pantalla anunciaba "3 viajes sin chofer" y no tenía con qué; la única vía
   * (`/dashboard/despacho`) se borró y el expediente se le niega a este rol
   * por área.
   *
   * Resuelve el tenant OTRA VEZ desde la sesión en vez de confiar en el
   * `tenantId` que cerró el closure: un action es un endpoint con su propia
   * petición, y el valor capturado viene del render, no de quien hizo clic.
   */
  async function accionAsignar(formData: FormData) {
    'use server';
    const t = await tenantDelAction(sufijo, tenantPedido);
    const viajeId = String(formData.get('viajeId') ?? '');
    const operadorId = String(formData.get('operadorId') ?? '');
    if (!viajeId || !operadorId) redirect(`/dashboard${sufijo}`);
    // `reasignarOperador` comprueba que el operador sea de ESTA flota antes de
    // escribir (auditoría 10, ALTO): el `<select>` es una restricción de la UI.
    await reasignarOperador(t, viajeId, operadorId);
    revalidatePath('/dashboard');
    redirect(`/dashboard${sufijo}`);
  }

  // Lo urgente arriba, y SOLO si hay fuego real. Una banda de alertas que
  // siempre dice algo entrena a ignorarla.
  const urgentes: string[] = [];
  if ((sinAsignar?.length ?? 0) > 0) {
    urgentes.push(`${sinAsignar!.length} viaje${sinAsignar!.length === 1 ? '' : 's'} sin chofer.`);
  }
  const vencidas = (incidencias ?? []).filter((i) => i.slaVencido);
  if (vencidas.length > 0) {
    urgentes.push(`${vencidas.length} incidencia${vencidas.length === 1 ? '' : 's'} pasada${vencidas.length === 1 ? '' : 's'} de su tiempo comprometido.`);
  }
  if ((tablero?.podPendientes ?? 0) > 0) {
    urgentes.push(`${tablero!.podPendientes} viaje${tablero!.podPendientes === 1 ? '' : 's'} en curso sin evidencia de entrega.`);
  }

  return (
    // EL SCROLL VIVE DENTRO DE CADA PANEL, no en la columna.
    //
    // Con la columna scrolleando, un panel más alto que la pantalla se
    // CORTA a media fila: se ve la mitad de un KPI y el borde redondeado
    // del recuadro nunca aparece, como si la interfaz estuviera rota.
    // Con `h-full` + `min-h-0` en la cadena, cada panel cierra donde debe y
    // lo que no cabe se desplaza adentro.
    <main className="flex flex-col gap-3">
      <div className="glass-panel overflow-hidden shrink-0">
        <div className="px-5 pt-3 pb-3 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl tracking-tight truncate" style={{ fontFamily: 'var(--font-display), var(--font-sans)', fontWeight: 600 }}>
              {saludo()}, {nombre ?? 'jefe'}
            </h1>
            {/* Ya viene capitalizada de `fechaLarga()` — ver auditoría 10,
                BAJO (dashboard/page.tsx tiene la nota completa). */}
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--muted)' }}>{fechaLarga()}</p>
            {tenantNombre && (
              <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ color: 'var(--accent-fg)', background: 'var(--accent)' }}>
                viendo como superadmin · {tenantNombre}
              </span>
            )}
            <AvanceCierre viajes={viajes ?? []} ahoraMs={ahoraMs()} />
          </div>

          {/* En vez de la cifra de dinero del dueño, la cifra que manda aquí:
              cuántos viajes están vivos ahora mismo. */}
          <div className="text-right shrink-0">
            <div className="text-4xl tracking-tight tabular" style={{ fontFamily: 'var(--font-display), var(--font-sans)', fontWeight: 600 }}>
              {tablero?.viajesActivos ?? '—'}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'var(--muted)' }}>
              Viajes activos
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>
              Abiertos y en cuadre
            </div>
          </div>
        </div>

        {!tenantExiste && (
          <div className="px-5 pb-3"><AvisoSinFlota tenantId={tenantId} /></div>
        )}

        {urgentes.length > 0 && (
          <div className="px-5 pb-3 space-y-1.5">
            {urgentes.map((u) => (
              <div key={u} className="flex items-center gap-2 text-[13px]">
                <StatusPill estado="warn">Atender</StatusPill>
                <span>{u}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {tablero === null ? (
        <div className="glass-panel p-8 text-sm" style={{ color: 'var(--muted)' }}>
          No se pudo leer el estado de la operación.
        </div>
      ) : (
        <TableroCifras t={tablero} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <section className="glass-panel overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center gap-2 shrink-0">
            <CircleSlash width={14} height={14} strokeWidth={1.75} style={{ color: 'var(--marca)' }} />
            <h2 className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: 'var(--muted)' }}>
              Sin asignar
            </h2>
          </div>
          {sinAsignar === null ? (
            <div className="px-5 pb-4 text-sm" style={{ color: 'var(--muted)' }}>No se pudo leer la lista.</div>
          ) : sinAsignar.length === 0 ? (
            <div className="px-5 pb-4">
              <EstadoVacio icono={<Send width={17} height={17} strokeWidth={1.75} style={{ color: 'var(--marca)' }} />}>
                Todo lo que está en curso ya trae chofer.
              </EstadoVacio>
            </div>
          ) : (
            // LA LISTA ES ACCIONABLE, no un anuncio. La banda de arriba dice
            // "Atender · N viajes sin chofer"; aquí es donde se atiende.
            <TablaSinAsignar viajes={sinAsignar} operadores={puede ? (operadores ?? []) : []} accion={accionAsignar} />
          )}
        </section>

        <section className="glass-panel overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-center gap-2 shrink-0">
            <UserCog width={14} height={14} strokeWidth={1.75} style={{ color: 'var(--marca)' }} />
            <h2 className="text-xs font-semibold uppercase tracking-wide m-0" style={{ color: 'var(--muted)' }}>
              Carga por operador
            </h2>
          </div>
          {carga === null ? (
            <div className="px-5 pb-4 text-sm" style={{ color: 'var(--muted)' }}>No se pudo leer la carga.</div>
          ) : (
            <TablaCarga carga={carga} />
          )}
        </section>
      </div>
    </main>
  );
}
