import { redirect } from 'next/navigation';
import { resolverTenantEfectivo } from '@/lib/auth/tenant-efectivo';
import { puedeVerArea } from '@/lib/auth/visibilidad';
import { getKpis, getAcreditables, type DashboardKpis, type Acreditables } from '@/lib/likida/analytics';
import { AvisoSinFlota } from '../sin-flota';
import ChatFlota from '../chat';

export const dynamic = 'force-dynamic';

/**
 * Preguntar a la IA — LA PRIMERA página reconstruida tras el borrado del
 * 10-ago-2026, pedida explícita el 12-ago: una página hero propia con el
 * logo de Likida. La composición hero ya vivía en `ChatFlota` (variante
 * 'hero', sobrevivió al borrado porque el componente lo usa también el rail).
 *
 * REGLA DE SEGURIDAD HEREDADA (inventario §12, corregida en su momento):
 * `getKpis`/`getAcreditables` se piden DESPUÉS de `puedeVerArea(rol,
 * 'dinero')` — antes de ese chequeo, un encargado podía leer cifras de
 * dinero por esta pantalla aunque el resto del panel se las negara.
 *
 * H13 (auditoría 24): era la única pantalla del panel que se tragaba
 * `tenantNombre` y `tenantExiste`. Un superadmin le preguntaba a la IA sobre
 * «mi flota» sin nada en pantalla que dijera CUÁL —la misma cinta que el
 * Resumen sí pinta—, y con `DEMO_TENANT_ID` apuntando a una flota borrada la
 * IA contestaba con los ceros de una flota inexistente como si fueran
 * medición. Las dos cosas ya se resolvían aquí arriba; solo faltaba
 * enseñarlas.
 */
export default async function PaginaChat({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; tenant?: string; rol?: string }>;
}) {
  const sp = await searchParams;
  const { tenantId, rol, tenantNombre, tenantExiste } = await resolverTenantEfectivo('/dashboard/chat', sp);

  if (!puedeVerArea(rol, 'dinero')) redirect('/dashboard');

  const [kpis, acred] = await Promise.all([
    getKpis(tenantId).catch((): DashboardKpis | null => null),
    getAcreditables(tenantId).catch((): Acreditables | null => null),
  ]);

  return (
    <main className="h-full">
      <div className="rounded-2xl min-h-full hairline flex flex-col" style={{ background: 'var(--g1)' }}>
        {tenantNombre && (
          <div className="px-5 pt-4">
            <span className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ color: 'var(--accent-fg)', background: 'var(--accent)' }}>
              viendo como superadmin · {tenantNombre}
            </span>
          </div>
        )}
        {/* ARRIBA de la conversación, como en el Resumen: una respuesta de la
            IA sobre una flota que no existe no es un dato del negocio. */}
        {!tenantExiste && <div className="px-5 pt-4"><AvisoSinFlota tenantId={tenantId} /></div>}
        <div className="flex-1 flex flex-col"><ChatFlota kpis={kpis} acred={acred} variante="hero" /></div>
      </div>
    </main>
  );
}
