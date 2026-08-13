import Link from 'next/link';
import { mxn } from '@/lib/formato';
import { fechaMx } from './formato';
import { etiquetaEstatus } from './estatus';
import type { LiqRow } from '@/lib/likida/analytics';

// ═══════════════════════════════════════════════════════════════════════════
// LA PUERTA AL EXPEDIENTE. AUDITORÍA 17 (pases 4 y 5), ALTO.
//
// `/dashboard/<uuid>` —la liquidación con el desglose de IVA/IEPS, la
// deducibilidad por renglón y el botón "Descargar PDF"— llevaba dos pases sin
// UN SOLO enlace entrante en todo el producto: las dos páginas que enlazaban
// (`dashboard/cuadre` y `dashboard/analitica`) se borraron en `2be4b1c`, y por
// ser ruta dinámica no puede vivir en `rutas.ts`, así que el arreglo del
// sidebar tampoco la alcanzaba. La única forma de llegar era pegar un UUID en
// la barra de direcciones.
//
// Eso deja el entregable del producto —"entrega la liquidación en PDF", primera
// línea de CLAUDE.md— fuera de la interfaz: el contralor pide "enséñame la
// liquidación de TI-0412 y el PDF que le llega a mi contador" y no hay clic que
// lleve ahí.
//
// La consulta ya existía y no la usaba nadie: `getLiquidaciones` (analytics.ts)
// se movió ahí el 10-ago justo para que no se perdiera al borrar Cuadre.
//
// Vive en su propio archivo, no dentro de `page.tsx`, por la misma razón que
// `resumen-visual.tsx`: `page.tsx` es un Server Component con doce consultas y
// no se puede montar en una prueba, así que lo que se verifica sería una copia.
// Aquí la prueba renderiza el componente REAL y cuenta los `href` que salen.
// ═══════════════════════════════════════════════════════════════════════════

export function UltimasLiquidaciones({
  liquidaciones, sufijo = '', limite = 5,
}: {
  /** `null` = la consulta se cayó. No es lo mismo que "no hay liquidaciones",
   *  y las dos cosas se dicen distinto (regla de CLAUDE.md). */
  liquidaciones: LiqRow[] | null;
  /** El `?tenant=`/`?vista=`/`?rol=` que hay que arrastrar en cada link
   *  interno (ver `sufijo.ts`) — sin él, un superadmin que entra al expediente
   *  desde la vista de una flota cae de vuelta en el tenant demo. */
  sufijo?: string;
  limite?: number;
}) {
  if (liquidaciones === null) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        No se pudieron leer las liquidaciones. La consulta falló — no es que no haya.
      </p>
    );
  }
  if (liquidaciones.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Todavía no hay liquidaciones cerradas. Aparecen aquí en cuanto el operador cierra su primer viaje por WhatsApp.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: 'var(--muted)' }}>
            <th className="font-medium pb-2 pr-3">Viaje</th>
            <th className="font-medium pb-2 pr-3">Cerrada</th>
            <th className="font-medium pb-2 pr-3 text-right">Comprobado</th>
            <th className="font-medium pb-2 pr-3 text-right">Diferencia</th>
            <th className="font-medium pb-2 pr-3">Estatus</th>
            <th className="font-medium pb-2" />
          </tr>
        </thead>
        <tbody>
          {liquidaciones.slice(0, limite).map((l) => {
            const e = etiquetaEstatus(l.estatus);
            return (
              <tr key={l.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-2.5 pr-3 font-medium">{l.folio}</td>
                <td className="py-2.5 pr-3" style={{ color: 'var(--muted)' }}>{fechaMx(l.creadoEn)}</td>
                <td className="py-2.5 pr-3 text-right tabular">{mxn(l.comprobado)}</td>
                <td className="py-2.5 pr-3 text-right tabular"
                  style={{ color: Math.abs(l.diferencia) >= 0.5 ? 'var(--color-bad)' : 'var(--muted)' }}>
                  {mxn(l.diferencia)}
                </td>
                <td className="py-2.5 pr-3">
                  <span className="text-xs font-semibold" style={{ color: e.color }}>{e.label}</span>
                </td>
                <td className="py-2.5 text-right">
                  <Link href={`/dashboard/${l.id}${sufijo}`} className="text-xs font-medium hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--marca)' }}>
                    Ver liquidación →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
