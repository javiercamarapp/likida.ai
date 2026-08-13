import { LifeBuoy, AlertTriangle, Timer } from 'lucide-react';
import { exigirVerRuta } from '@/lib/auth/guard';
import { resolverTenantEfectivo } from '@/lib/auth/tenant-efectivo';
import { getTickets, type TicketRow } from '@/lib/likida/comercial';
import { ahoraMs } from '@/lib/saludo';
import { EstadoVacio, KpiTile, StatusPill } from '../../admin/ui/kit';
import { fechaMx } from '@/lib/formato';

export const dynamic = 'force-dynamic';

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

// ── Los tres dominios de `ticket_soporte`, en lenguaje de contralor ────────
//
// AUDITORÍA 17 (pase 5), MEDIO — esta tabla imprimía las claves crudas del
// check constraint: `facturacion` · `alta` · `en_proceso`. Sin acento, con
// guion bajo, en minúscula, y en la MISMA fila donde la fecha sí sale
// formateada con `fechaMx`. Era la única de las ocho páginas vivas sin mapa
// de etiquetas, y hasta `8d6ac51` nadie podía llegar a ella con un clic.
//
// Los valores son los de `0051_soporte_y_cotizacion.sql:41-44`, uno por uno;
// `etiqueta()` cae a la clave cruda si aparece un valor nuevo, nunca a vacío.

const CATEGORIA: Record<string, string> = {
  facturacion: 'Facturación', operacion: 'Operación', tecnico: 'Técnico',
  cuenta: 'Cuenta', otro: 'Otro',
};
const PRIORIDAD: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente',
};
const ESTADO: Record<string, string> = {
  abierto: 'Abierto', en_proceso: 'En proceso', esperando: 'Esperando respuesta',
  resuelto: 'Resuelto', cerrado: 'Cerrado',
};
/** Nunca `undefined` ni una etiqueta inventada: mismo criterio que
 *  `etiquetaEstatus` y que `MOTIVO_ERROR` en Combustible & Casetas. */
function etiqueta(mapa: Record<string, string>, clave: string): string {
  return mapa[clave] ?? clave;
}

const CERRADOS = ['resuelto', 'cerrado'];

/**
 * SOPORTE — cola de tickets con reloj de SLA, sobre `ticket_soporte` (0051).
 *
 * EL RELOJ SE DERIVA, no se guarda. `vence_en` se escribe una vez al abrir el
 * ticket; lo que falta se resta contra el reloj del SERVIDOR, que llega como
 * prop (`ahoraMs()`): un `Date.now()` en el render lo bloquea
 * `react-hooks/purity`, y además haría que dos usuarios vieran relojes
 * distintos según su máquina.
 *
 * UN TICKET SIN SLA NO ESTÁ VENCIDO. `horasRestantes` es `null` y la fila dice
 * "sin SLA" — un 0 se leería como incumplido, y acusaría de incumplimiento a
 * quien nunca pactó un plazo.
 */
export default async function SoportePage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; tenant?: string }>;
}) {
  await exigirVerRuta('/dashboard/soporte');
  const sp = await searchParams;
  const { tenantId } = await resolverTenantEfectivo('/dashboard/soporte', sp);
  const ahora = ahoraMs();
  const tickets = await safe<TicketRow[]>(() => getTickets(tenantId, ahora));

  const abiertos = tickets?.filter((t) => !CERRADOS.includes(t.estado)) ?? [];
  const vencidos = abiertos.filter((t) => t.horasRestantes != null && t.horasRestantes < 0);
  const sinSla = abiertos.filter((t) => t.horasRestantes == null);

  return (
    <div className="flex flex-col gap-4">
      <header className="glass-panel flex items-center gap-2.5 px-5 py-4">
        <LifeBuoy width={16} height={16} strokeWidth={1.75} />
        <div>
          <span className="text-sm font-medium block">Soporte &amp; Quejas</span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Tickets, prioridad y reloj de SLA
          </span>
        </div>
      </header>

      {!tickets ? (
        <div className="glass-panel p-5">
          <EstadoVacio>
            No se pudo leer la cola. La consulta falló — no es que no haya tickets.
          </EstadoVacio>
        </div>
      ) : tickets.length === 0 ? (
        <div className="glass-panel p-5">
          <EstadoVacio icono={<LifeBuoy width={17} height={17} strokeWidth={1.75} style={{ color: 'var(--marca)' }} />}>
            <span className="font-semibold">No hay tickets abiertos.</span> La cola ya existe y
            registra prioridad, categoría y reloj de SLA. Si necesitas algo de Likida ahora, sigue
            siendo por WhatsApp — que es donde ya está tu operación.
          </EstadoVacio>
        </div>
      ) : (
        <>
          <div className="glass-panel p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile
                icono={<LifeBuoy width={15} height={15} strokeWidth={1.75} />}
                etiqueta="Abiertos"
                valor={abiertos.length}
              />
              <KpiTile
                icono={<AlertTriangle width={15} height={15} strokeWidth={1.75} />}
                etiqueta="SLA vencido"
                valor={vencidos.length}
                destacar={vencidos.length > 0}
              />
              <KpiTile
                icono={<Timer width={15} height={15} strokeWidth={1.75} />}
                etiqueta="Sin SLA pactado"
                valor={sinSla.length}
                nota="No están vencidos: nadie les puso plazo"
              />
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
                    <th className="text-left font-medium px-5 py-3">Asunto</th>
                    <th className="text-left font-medium px-5 py-3">Categoría</th>
                    <th className="text-left font-medium px-5 py-3">Prioridad</th>
                    <th className="text-left font-medium px-5 py-3">Estado</th>
                    <th className="text-left font-medium px-5 py-3">Abierto</th>
                    <th className="text-right font-medium px-5 py-3">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td className="px-5 py-3 font-medium">{t.asunto}</td>
                      <td className="px-5 py-3" style={{ color: 'var(--muted)' }}>{etiqueta(CATEGORIA, t.categoria)}</td>
                      <td className="px-5 py-3">{etiqueta(PRIORIDAD, t.prioridad)}</td>
                      <td className="px-5 py-3">
                        {/* El color decía `warn` (naranja) para CUALQUIER estado
                            abierto, así que un ticket recién levantado con 23 h
                            de SLA por delante llevaba la misma insignia de
                            alerta que uno vencido — y entonces la insignia deja
                            de significar algo. La urgencia la dice la columna
                            de SLA, que sí la mide; ésta dice el estado. */}
                        <StatusPill estado={CERRADOS.includes(t.estado) ? 'ok' : 'neutral'}>
                          {etiqueta(ESTADO, t.estado)}
                        </StatusPill>
                      </td>
                      <td className="px-5 py-3 text-xs" style={{ color: 'var(--muted)' }}>{fechaMx(t.abiertoEn)}</td>
                      <td className="px-5 py-3 text-right text-xs tabular"
                        style={{ color: t.horasRestantes != null && t.horasRestantes < 0 ? 'var(--bad)' : 'var(--muted)' }}>
                        {t.horasRestantes == null
                          ? 'sin SLA'
                          : t.horasRestantes < 0
                            ? `vencido hace ${Math.abs(Math.round(t.horasRestantes))} h`
                            : `${Math.round(t.horasRestantes)} h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
