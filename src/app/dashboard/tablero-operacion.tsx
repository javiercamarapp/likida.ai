import { Truck, UserCog, Wrench, TriangleAlert, PackageCheck, CircleSlash } from 'lucide-react';
import { EstadoVacio, StatusPill, KpiTile } from '../admin/ui/kit';
import { KpiDegradado, TituloSeccion } from './resumen-visual';
import { fechaMx } from './formato';
import type { TableroOperacion, CargaOperador, ViajeSinAsignar } from '@/lib/likida/operacion';

// ═══════════════════════════════════════════════════════════════════════════
// Movido de `despacho/vista.tsx` el 10-ago-2026, cuando esa página se borró
// para el rediseño de "dueño de flota" desde cero. `TableroCifras` y
// `TablaCarga` sobreviven porque `inicio-operacion.tsx` (la casa del
// ENCARGADO en `/dashboard` — no una de las 17 páginas que se borraron) las
// usa para su propia versión sin dinero del tablero. Borrar despacho sin
// mover esto primero se hubiera llevado entre pies la vista de ese rol.
// `FormaAlta` (crear viaje a mano) NO se movió: era exclusiva de despacho y
// hoy los viajes nacen por WhatsApp.
//
// `TablaSinAsignar` SÍ VOLVIÓ (AUDITORÍA 17, pase 5, ALTO). Se fue con la
// página y eso dejó al jefe de tráfico leyendo "Atender · 3 viajes sin chofer"
// en `inicio-operacion.tsx` sin un solo control para actuar: despacho ya no
// existe y `/dashboard/<id>` —que sí tiene "Reasignar"— se le niega antes por
// área (`dinero`). Vuelve SIN la columna de unidad: `asignarUnidad` era la otra
// mitad de despacho y esta pantalla no lista unidades, así que ofrecerla aquí
// sería una promesa a medias.
// ═══════════════════════════════════════════════════════════════════════════

const ICONO = { width: 15, height: 15, strokeWidth: 1.75, style: { color: 'var(--marca)' } } as const;

/**
 * Los 6 números del tablero partidos en dos filas: arriba, en degradado, los
 * TRES que piden acción hoy (por asignar, incidencias abiertas, sin
 * evidencia de entrega); abajo, en plano, los tres de CONTEXTO (viajes
 * activos, unidades disponibles, en taller).
 */
export function TableroCifras({ t }: { t: TableroOperacion }) {
  return (
    <div>
      <TituloSeccion>Estado de la operación</TituloSeccion>
      <div className="mt-3 flex flex-wrap gap-2.5 items-stretch">
        <div className="flex-1 min-w-[200px]">
          <KpiDegradado icono={<CircleSlash width={17} height={17} strokeWidth={1.75} />}
            etiqueta="Por asignar" valor={t.porAsignar} formato="entero" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <KpiDegradado icono={<TriangleAlert width={17} height={17} strokeWidth={1.75} />}
            etiqueta="Incidencias abiertas" valor={t.incidenciasAbiertas} formato="entero" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <KpiDegradado icono={<PackageCheck width={17} height={17} strokeWidth={1.75} />}
            etiqueta="Sin evidencia de entrega" valor={t.podPendientes} formato="entero" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
        <KpiTile icono={<Truck {...ICONO} />} etiqueta="Viajes activos" valor={t.viajesActivos} formato="entero" />
        <KpiTile icono={<UserCog {...ICONO} />} etiqueta="Unidades disponibles" valor={t.unidadesDisponibles} formato="entero" />
        <KpiTile icono={<Wrench {...ICONO} />} etiqueta="En taller" valor={t.unidadesEnTaller} formato="entero" />
      </div>
    </div>
  );
}

const CONTROL = {
  background: 'var(--canvas)', border: '1px solid var(--line)', color: 'var(--ink)',
} as const;

/**
 * Los viajes sin chofer, CON el selector que los reparte — la mitad que le
 * faltaba a la casa del encargado.
 *
 * `accion` es la server action de la página: la escritura la hace
 * `reasignarOperador`, que comprueba que el operador sea de la misma flota
 * (auditoría 10, ALTO — el `.eq('tenant_id')` acota el VIAJE, no el operador).
 */
export function TablaSinAsignar({
  viajes, operadores, accion,
}: {
  viajes: ViajeSinAsignar[];
  operadores: Array<{ id: string; nombre: string }>;
  accion: (fd: FormData) => Promise<void>;
}) {
  // Un `<select>` con una sola opción deshabilitada es el mismo callejón sin
  // salida que la lista de solo texto que esto reemplaza: si no hay a quién
  // asignarle, se dice por qué y cómo se resuelve.
  const hayChoferes = operadores.length > 0;
  return (
    <div className="overflow-x-auto pb-2">
      {!hayChoferes && (
        <p className="px-5 pb-2 text-[13px]" style={{ color: 'var(--muted)' }}>
          Todavía no hay choferes dados de alta en esta flota, así que no hay a quién asignarle estos viajes. Se dan
          de alta solos cuando el chofer manda su primer mensaje por WhatsApp.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--muted)' }} className="text-left">
            <th className="px-5 py-2.5 font-medium">Folio</th>
            <th className="px-5 py-2.5 font-medium">Ruta</th>
            <th className="px-5 py-2.5 font-medium">Inicio</th>
            {hayChoferes && <th className="px-5 py-2.5 font-medium">Asignar a</th>}
          </tr>
        </thead>
        <tbody>
          {viajes.map((v) => (
            <tr key={v.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="px-5 py-3 font-medium">{v.folio ?? '—'}</td>
              <td className="px-5 py-3" style={{ color: 'var(--muted)' }}>
                {v.origen && v.destino ? `${v.origen} → ${v.destino}` : (v.origen ?? v.destino ?? 'sin ruta')}
              </td>
              <td className="px-5 py-3" style={{ color: 'var(--muted)' }}>{fechaMx(v.fechaInicio)}</td>
              {hayChoferes && (
                <td className="px-5 py-3">
                  <form action={accion} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="viajeId" value={v.id} />
                    <label className="sr-only" htmlFor={`chofer-${v.id}`}>Chofer para {v.folio ?? 'este viaje'}</label>
                    <select id={`chofer-${v.id}`} name="operadorId" required defaultValue=""
                      className="text-sm rounded-lg px-2.5 py-1.5" style={CONTROL}>
                      <option value="" disabled>Chofer…</option>
                      {operadores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                    <button type="submit" className="text-sm font-medium rounded-lg px-3 py-1.5"
                      style={{ background: 'var(--marca)', color: 'var(--marca-fg)' }}>
                      Asignar
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TablaCarga({ carga }: { carga: CargaOperador[] }) {
  if (carga.length === 0) {
    return (
      <div className="px-5 pb-5">
        <EstadoVacio icono={<UserCog width={17} height={17} strokeWidth={1.75} style={{ color: 'var(--marca)' }} />}>
          Todavía no hay operadores en esta flota. Se dan de alta solos cuando el chofer manda su primer mensaje por
          WhatsApp.
        </EstadoVacio>
      </div>
    );
  }
  // La barra es proporcional AL QUE MÁS TRAE, no a un máximo inventado: con
  // dos viajes cada uno, nadie está "al 20% de su capacidad" — esa capacidad
  // no existe en ningún lado y ponerla sería inventar una cifra.
  const cargaMax = Math.max(1, ...carga.map((c) => c.enCurso));
  return (
    <div className="overflow-x-auto pb-2">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--muted)' }} className="text-left">
            <th className="px-5 py-2.5 font-medium">Operador</th>
            <th className="px-5 py-2.5 font-medium">Carga</th>
            <th className="px-5 py-2.5 font-medium text-right">En curso</th>
            <th className="px-5 py-2.5 font-medium text-right">Sin POD</th>
            <th className="px-5 py-2.5 font-medium text-right">Incidencias</th>
            <th className="px-5 py-2.5 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody>
          {carga.map((c) => (
            <tr key={c.operadorId} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="px-5 py-3 font-medium">{c.nombre}</td>
              <td className="px-5 py-3 w-40">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--canvas)' }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${Math.round((c.enCurso / cargaMax) * 100)}%`, background: 'var(--marca)' }} />
                </div>
              </td>
              <td className="px-5 py-3 text-right tabular">{c.enCurso}</td>
              <td className="px-5 py-3 text-right tabular">{c.sinPod > 0 ? c.sinPod : '—'}</td>
              <td className="px-5 py-3 text-right tabular">{c.incidenciasAbiertas > 0 ? c.incidenciasAbiertas : '—'}</td>
              <td className="px-5 py-3">
                <StatusPill estado={c.activo ? 'ok' : 'neutral'}>{c.activo ? 'Activo' : 'Inactivo'}</StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
