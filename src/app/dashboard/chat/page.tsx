import { redirect } from 'next/navigation';
import { resolverTenantEfectivo } from '@/lib/auth/tenant-efectivo';
import { puedeVerArea } from '@/lib/auth/visibilidad';
import ChatFlota from '../chat';

export const dynamic = 'force-dynamic';

/**
 * Preguntar a la IA — LA PRIMERA página reconstruida tras el borrado del
 * 10-ago-2026, pedida explícita el 12-ago: "cuando le aprietes a preguntarle
 * a AI que te abra una página idéntica así [usehandle.ai] pero con el logo
 * de Likida". La composición hero ya vivía en `ChatFlota` (variante 'hero',
 * sobrevivió al borrado porque el componente lo usa también el rail).
 *
 * REGLA DE SEGURIDAD HEREDADA (inventario §12): el `puedeVerArea(rol,
 * 'dinero')` se queda — sin él, un encargado entraba a la caja del analista,
 * que sí lee cifras de dinero con sus tools. Lo que ya NO se pide aquí es
 * `getKpis`/`getAcreditables`: existían solo para alimentar el heurístico
 * local que AUD3 · FE-C1 retiró, y una consulta de dinero que nadie pinta es
 * superficie sin dueño.
 */
export default async function PaginaChat({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; tenant?: string; rol?: string }>;
}) {
  const sp = await searchParams;
  const { rol } = await resolverTenantEfectivo('/dashboard/chat', sp);

  if (!puedeVerArea(rol, 'dinero')) redirect('/dashboard');

  return (
    <main className="h-full">
      <div className="rounded-2xl min-h-full hairline flex flex-col" style={{ background: 'var(--g1)' }}>
        <div className="flex-1 flex flex-col"><ChatFlota variante="hero" /></div>
      </div>
    </main>
  );
}
