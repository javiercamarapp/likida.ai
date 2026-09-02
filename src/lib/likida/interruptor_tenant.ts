// ═══════════════════════════════════════════════════════════════════════════
// AUDITORÍA 24, ADM-6 (MEDIO) — el pipeline del chofer (whatsapp/ocr/cuadre)
// de UNA sola flota, apagable sin tocar las otras 799.
//
// `interruptores.ts` (0110) es GLOBAL por agente: apagar `global` para
// Innovativos apagaría también a las demás flotas del piloto. La tabla
// `interruptor_tenant` (mig. 0297) vive por (tenant_id, pipeline) — la
// pantalla que la escribe está en `lib/admin/negocio.ts`
// (`getInterruptoresPipelineDeTenant`/`apagar`/`encender`); este archivo es
// la LECTURA que `processor.ts` puede hacer sin importar de `lib/admin`
// (frontera de dominio: lib/likida no depende de lib/admin).
//
// MISMO CONTRATO que el interruptor global: SIN FILA = ENCENDIDO. Fallo de
// lectura = ENCENDIDO (a diferencia del kill switch global): esta palanca es
// operativa, no de incidente — una base intermitente no debe dejar sin
// servicio de WhatsApp a una flota que nadie apagó a propósito. El grito va
// al log, no a bloquear el turno.
// ═══════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { acotada } from '@/lib/likida/presupuesto';
import { logger } from '@/lib/logger';

export type PipelineChofer = 'whatsapp' | 'ocr' | 'cuadre';

export async function pipelineTenantApagado(tenantId: string, pipeline: PipelineChofer): Promise<boolean> {
  const { data, error } = await acotada(supabaseAdmin()
    .from('interruptor_tenant')
    .select('apagado')
    .eq('tenant_id', tenantId)
    .eq('pipeline', pipeline)
    .maybeSingle(), 'pipelineTenantApagado');
  if (error) {
    logger.warn('interruptor_tenant.ilegible', { tenantId, pipeline, err: error.message });
    return false;
  }
  return data?.apagado === true;
}
